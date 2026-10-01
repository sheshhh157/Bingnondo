const bcrypt = require('bcrypt');
const db     = require('../../config/db');
const { signAccessToken, signRefreshToken } = require('./auth.jwt');

const BCRYPT_ROUNDS = 12;

// ─── helpers ──────────────────────────────────────────────────────────────────

function sanitizeStaff(row) {
  const { password_hash, ...safe } = row;
  return safe;
}

async function writeAuditLog(actorId, action, targetType, targetId, details = {}) {
  await db.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/staff/switch-options
// Returns the list of dashboards the current staff member can switch to,
// AND whether a PIN is required for each one.
// Used by the frontend to build the dropdown.
// ─────────────────────────────────────────────────────────────────────────────
exports.getSwitchOptions = async (req, res) => {
  try {
    const staffId = req.user.sub;

    // Fetch all granted dashboards for this staff member
    const { rows: access } = await db.query(
      `SELECT target_dashboard FROM staff_dashboard_access WHERE staff_id = $1`,
      [staffId]
    );

    if (access.length === 0) {
      return res.json({ data: [] }); // no dashboards granted — hide dropdown
    }

    // Resolve PIN requirement for each target dashboard:
    // Priority 1: per_staff config for this staff member
    // Priority 2: per_dashboard config for the target
    // Default: false
    const { rows: perStaffConfig } = await db.query(
      `SELECT requires_pin FROM dashboard_switch_config
       WHERE scope = 'per_staff' AND staff_id = $1`,
      [staffId]
    );

    const { rows: perDashboardConfig } = await db.query(
      `SELECT target_dashboard, requires_pin FROM dashboard_switch_config
       WHERE scope = 'per_dashboard'`
    );

    const perDashboardMap = {};
    for (const row of perDashboardConfig) {
      perDashboardMap[row.target_dashboard] = row.requires_pin;
    }

    const perStaffRequiresPin = perStaffConfig.length > 0
      ? perStaffConfig[0].requires_pin
      : null; // null = not configured at per_staff level

    // Check if staff has a PIN set at all
    const { rows: pinRow } = await db.query(
      `SELECT EXISTS(SELECT 1 FROM staff_switch_pin WHERE staff_id = $1) AS has_pin`,
      [staffId]
    );
    const hasPin = pinRow[0].has_pin;

    const options = access.map(({ target_dashboard }) => {
      let requiresPin;
      if (perStaffRequiresPin !== null) {
        // per_staff config takes priority
        requiresPin = perStaffRequiresPin;
      } else if (target_dashboard in perDashboardMap) {
        // per_dashboard config is secondary
        requiresPin = perDashboardMap[target_dashboard];
      } else {
        requiresPin = false; // default
      }

      return {
        dashboard:   target_dashboard,
        requires_pin: requiresPin && hasPin, // only require PIN if both config says so AND a PIN is actually set
        pin_configured: hasPin,
      };
    });

    return res.json({ data: options });
  } catch (err) {
    console.error('[getSwitchOptions]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/staff/switch-dashboard
// Switches the current session to a different dashboard.
// Issues a new JWT with the target dashboard role.
// Body: { target_dashboard, pin? }
// ─────────────────────────────────────────────────────────────────────────────
exports.switchDashboard = async (req, res) => {
  try {
    const staffId = req.user.sub;
    const { target_dashboard, pin } = req.body;

    if (!target_dashboard) {
      return res.status(400).json({ message: 'target_dashboard is required.' });
    }

    // 1. Verify this staff member actually has access to the target dashboard
    const { rows: access } = await db.query(
      `SELECT id FROM staff_dashboard_access
       WHERE staff_id = $1 AND target_dashboard = $2`,
      [staffId, target_dashboard]
    );
    if (access.length === 0) {
      return res.status(403).json({
        message: "You don't have permission to switch to this dashboard.",
      });
    }

    // 2. Resolve whether a PIN is required
    const { rows: perStaffConfig } = await db.query(
      `SELECT requires_pin FROM dashboard_switch_config
       WHERE scope = 'per_staff' AND staff_id = $1`,
      [staffId]
    );
    const { rows: perDashboardConfig } = await db.query(
      `SELECT requires_pin FROM dashboard_switch_config
       WHERE scope = 'per_dashboard' AND target_dashboard = $1`,
      [target_dashboard]
    );

    let requiresPin = false;
    if (perStaffConfig.length > 0) {
      requiresPin = perStaffConfig[0].requires_pin;
    } else if (perDashboardConfig.length > 0) {
      requiresPin = perDashboardConfig[0].requires_pin;
    }

    // 3. If PIN is required, verify it
    if (requiresPin) {
      if (!pin) {
        return res.status(400).json({
          message: 'A PIN is required to switch to this dashboard.',
          pin_required: true,
        });
      }

      const { rows: pinRow } = await db.query(
        `SELECT pin_hash FROM staff_switch_pin WHERE staff_id = $1`,
        [staffId]
      );

      if (pinRow.length === 0) {
        // Config says PIN required but none is set — allow switch, log warning
        console.warn(`[switchDashboard] PIN required for staff ${staffId} but no PIN set. Allowing switch.`);
      } else {
        const pinMatch = await bcrypt.compare(String(pin), pinRow[0].pin_hash);
        if (!pinMatch) {
          return res.status(401).json({ message: 'Incorrect PIN. Please try again.', pin_required: true });
        }
      }
    }

    // 4. Fetch fresh staff data (to include in token / response)
    const { rows: staff } = await db.query(
      'SELECT * FROM staff_accounts WHERE id = $1',
      [staffId]
    );
    if (staff.length === 0) {
      return res.status(404).json({ message: 'Staff account not found.' });
    }

    // 5. Issue new tokens — role becomes the target dashboard
    //    We keep sub (staff id) and original_role so the frontend knows
    //    which role to return to when the user switches back or logs out.
    const payload = {
      sub:           staffId,
      type:          'staff',
      role:          target_dashboard,      // active dashboard role
      home_role:     staff[0].role,         // their real assigned role
    };
    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // 6. Audit log
    await writeAuditLog(staffId, 'dashboard_switch', 'staff_accounts', staffId, {
      from_role:   req.user.role,
      to_dashboard: target_dashboard,
      pin_used:    requiresPin,
    });

    return res.json({
      message:      `Switched to ${target_dashboard} dashboard.`,
      accessToken,
      refreshToken,
      active_dashboard: target_dashboard,
      home_role:         staff[0].role,
      user:              sanitizeStaff(staff[0]),
    });
  } catch (err) {
    console.error('[switchDashboard]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/staff/switch-pin/update
// Staff member updates their OWN switch PIN.
// Body: { current_pin, new_pin }
// ─────────────────────────────────────────────────────────────────────────────
exports.updateOwnSwitchPin = async (req, res) => {
  try {
    const staffId = req.user.sub;
    const { current_pin, new_pin } = req.body;

    if (!current_pin || !new_pin) {
      return res.status(400).json({ message: 'current_pin and new_pin are required.' });
    }
    if (!/^\d{4,6}$/.test(String(new_pin))) {
      return res.status(400).json({ message: 'New PIN must be 4 to 6 digits.' });
    }

    // Fetch existing PIN
    const { rows: pinRow } = await db.query(
      'SELECT pin_hash FROM staff_switch_pin WHERE staff_id = $1',
      [staffId]
    );
    if (pinRow.length === 0) {
      return res.status(404).json({
        message: 'No PIN is set for your account. Ask your admin to set an initial PIN.',
      });
    }

    // Verify current PIN
    const match = await bcrypt.compare(String(current_pin), pinRow[0].pin_hash);
    if (!match) {
      return res.status(401).json({ message: 'Current PIN is incorrect.' });
    }

    // Hash and save new PIN
    const newPinHash = await bcrypt.hash(String(new_pin), BCRYPT_ROUNDS);
    await db.query(
      `UPDATE staff_switch_pin
       SET pin_hash = $1, set_by_admin = FALSE, updated_at = NOW()
       WHERE staff_id = $2`,
      [newPinHash, staffId]
    );

    await writeAuditLog(staffId, 'update_switch_pin', 'staff_accounts', staffId, {});

    return res.json({ message: 'Switch PIN updated successfully.' });
  } catch (err) {
    console.error('[updateOwnSwitchPin]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};