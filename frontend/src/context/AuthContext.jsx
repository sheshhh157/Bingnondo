import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient } from '../services/apiClient';
import { connectSocket, disconnectSocket, SOCKET_ROOM_BY_ROLE } from '../services/socket';
import { joinSocketRoom, leaveManagerRoom } from './SocketContext';
import { connectSocket, disconnectSocket } from '../services/socket';
import { switchAPI } from '../services/api';

const AuthContext = createContext(null);

const SOCKET_ROOM_MAP = {
  cashier:       'cashier',
  kitchen_staff: 'kitchen',
  staff:         'staff',
  owner:         'manager',
  admin:         'manager',
};

export function AuthProvider({ children }) {
  const [user, setUser]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  // Dashboards this user can switch to (fetched after login)
  const [switchOptions, setSwitchOptions] = useState([]);

  // ── Restore session from localStorage ────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('bingnondo_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        // Restore switch options if they were cached
        const cachedOptions = localStorage.getItem('bingnondo_switch_options');
        if (cachedOptions) {
          try { setSwitchOptions(JSON.parse(cachedOptions)); } catch { /* ignore */ }
        }
      } catch {
        localStorage.clear();
      }
    }
    setLoading(false);

    // Listen for silent token-refresh failures from apiClient
    const onExpired = () => {
      localStorage.clear();
      disconnectSocket();
      setUser(null);
      setSwitchOptions([]);
      window.location.replace('/login');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  // ── Fetch switch options (called after login + after any switch) ──────────────
  const fetchSwitchOptions = useCallback(async () => {
    try {
      const res = await switchAPI.getOptions();
      const options = res.data?.data || [];
      setSwitchOptions(options);
      localStorage.setItem('bingnondo_switch_options', JSON.stringify(options));
    } catch {
      // Not fatal — user just won't see the dropdown
      setSwitchOptions([]);
    }
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────────
  const login = useCallback(async (credentials) => {
    const res = await authClient.staffLogin(credentials);
    const userData = res.user;

    localStorage.setItem('bingnondo_user', JSON.stringify(userData));
    setUser(userData);

    // Join the correct socket room for this role
    connectSocket(SOCKET_ROOM_BY_ROLE[userData.role]);
    // Also ensure the provider's singleton is in the same room (covers the
    // case where the provider reconnected in the meantime).
    joinSocketRoom();
    connectSocket(SOCKET_ROOM_MAP[userData.role]);

    // Fetch which dashboards this staff can switch to (non-blocking)
    // Admin never gets the switcher (they must re-login for other dashboards)
    if (userData.role !== 'admin') {
      fetchSwitchOptions();
    }

    return userData;
  }, [fetchSwitchOptions]);

  // ── Switch Dashboard ──────────────────────────────────────────────────────────
  // Called by DashboardSwitcher component.
  // Returns { success: true } or throws with { message, pin_required }
  const switchDashboard = useCallback(async (targetDashboard, pin = null) => {
    const body = { target_dashboard: targetDashboard };
    if (pin) body.pin = pin;

    const res = await switchAPI.switch(body);
    const { accessToken, refreshToken, user: updatedUser, active_dashboard, home_role } = res.data;

    // Persist new tokens — the new accessToken carries the switched role
    localStorage.setItem('bingnondo_access_token', accessToken);
    localStorage.setItem('bingnondo_refresh_token', refreshToken);

    // Build the updated user object — role = active dashboard
    const newUserData = {
      ...updatedUser,
      role:      active_dashboard,
      home_role: home_role,
    };
    localStorage.setItem('bingnondo_user', JSON.stringify(newUserData));
    setUser(newUserData);

    // Switch socket room
    disconnectSocket();
    connectSocket(SOCKET_ROOM_MAP[active_dashboard] || active_dashboard);

    // Refresh switch options (they may have changed)
    fetchSwitchOptions();

    return { success: true };
  }, [fetchSwitchOptions]);

  // ── Logout ────────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    authClient.logout().catch(() => {});
    localStorage.clear();
    disconnectSocket();
    // The shared socket is granted the `manager` room from its handshake token,
    // and discarding the token client-side doesn't tell the server. Drop the
    // room before the redirect so the tab stops receiving operational events.
    leaveManagerRoom();
    setUser(null);
    setSwitchOptions([]);
    window.location.replace('/login');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchDashboard, switchOptions, fetchSwitchOptions }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};