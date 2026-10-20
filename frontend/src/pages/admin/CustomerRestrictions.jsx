import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import {
  Spinner, TableSkeleton, Btn, Field, TextInput, AppSelect, Modal,
  PageHeader, RowAction, Pagination,
} from './adminShared';
import { useAdminToast } from './useAdminToast';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { formatDate } from './format';
import FilterModal, { FilterTrigger, FilterInline } from '../../components/MobileFilter';
import '../../styles/AdminPage.css';

// ── Restriction level badge ─────────────────────────────────────────
const LEVEL_META = {
  none:           { label: 'No restriction',   cls: 'cr-badge--none'     },
  warned:         { label: 'Warned',            cls: 'cr-badge--warned'   },
  cod_restricted: { label: 'GCash only',        cls: 'cr-badge--codblock' },
  suspended:      { label: 'Ordering blocked',  cls: 'cr-badge--suspend'  },
};

function RestrictionBadge({ level }) {
  const meta = LEVEL_META[level] || LEVEL_META.none;
  return (
    <span className={`cr-badge ${meta.cls}`}>
      <span className="cr-badge__dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// ── Account status badge ────────────────────────────────────────────
const ACCOUNT_META = {
  active:                { label: 'Active',                cls: 'cr-acct--active'  },
  awaiting_verification: { label: 'Awaiting verification', cls: 'cr-acct--await'   },
  suspended:             { label: 'Suspended',             cls: 'cr-acct--suspend' },
};

function AccountBadge({ status }) {
  const meta = ACCOUNT_META[status] || { label: status || 'Unknown', cls: 'cr-acct--await' };
  return (
    <span className={`cr-acct ${meta.cls}`}>
      <span className="cr-acct__dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// ── Violation type badge ────────────────────────────────────────────
const VIOL_META = {
  cancelled_before_prep: { label: 'Cancelled (before prep)', cls: 'cr-viol--cancel'  },
  cancelled_after_prep:  { label: 'Cancelled (after prep)',  cls: 'cr-viol--late'    },
  no_show:               { label: 'No-show',                  cls: 'cr-viol--noshow'  },
};

function ViolBadge({ type }) {
  const meta = VIOL_META[type] || { label: type, cls: 'cr-viol--cancel' };
  return <span className={`cr-viol ${meta.cls}`}>{meta.label}</span>;
}

// ── Violation history modal ─────────────────────────────────────────
function ViolationModal({ open, onClose, customer }) {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!open || !customer) return;
    let active = true;
    adminAPI.getCustomerViolations(customer.customer_id)
      .then(({ data }) => { if (active) setViolations(data.data || data); })
      .catch(() => { if (active) setViolations([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, customer]);

  return (
    <Modal open={open} onClose={onClose} title="Violation history" width={560}>
      {/* Customer header */}
      <div className="cr-modal-customer">
        <div className="cr-modal-avatar">{customer?.customer_name?.[0]?.toUpperCase() || 'U'}</div>
        <div>
          <div className="cr-modal-name">{customer?.customer_name}</div>
          <div className="cr-modal-email">{customer?.customer_email}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <RestrictionBadge level={customer?.restriction_level || 'none'} />
        </div>
      </div>

      <div className="ap-divider" />

      {/* Violation list */}
      {loading ? (
        <div className="ap-loading"><Spinner size={20} /></div>
      ) : violations.length === 0 ? (
        <div className="ap-empty" style={{ padding: '28px 0' }}>
          <div className="ap-empty__title">No violations on record</div>
          <div className="ap-empty__sub">This user has a clean order history.</div>
        </div>
      ) : (
        <div className="cr-viol-list">
          {violations.map(v => (
            <div key={v.id} className="cr-viol-row">
              <div className="cr-viol-row__left">
                <ViolBadge type={v.violation_type} />
                {v.order_number && (
                  <span className="cr-viol-row__order">Order #{v.order_number}</span>
                )}
              </div>
              <div className="cr-viol-row__date">
                {formatDate(v.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Escalation key */}
      <div className="cr-escalation">
        <div className="cr-escalation__title">Escalation scale</div>
        <div className="cr-escalation__steps">
          {[
            { n: '1st', desc: 'Logged — no restriction' },
            { n: '2nd', desc: 'In-app warning shown' },
            { n: '3rd', desc: 'GCash only at checkout' },
            { n: '4th+', desc: 'Order placement blocked' },
          ].map(s => (
            <div key={s.n} className="cr-escalation__step">
              <span className="cr-escalation__n">{s.n}</span>
              <span className="cr-escalation__desc">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ap-modal__footer">
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

// ── Override restriction modal ──────────────────────────────────────
const LEVELS = ['none', 'warned', 'cod_restricted', 'suspended'];
const LEVEL_LABELS = {
  none:           'No restriction',
  warned:         'Warned',
  cod_restricted: 'GCash only (COD restricted)',
  suspended:      'Suspended (order blocked)',
};

function OverrideModal({ open, onClose, customer, onSuccess, toast }) {
  const [level, setLevel]   = useState(customer?.restriction_level || 'none');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function submit() {
    if (!reason.trim()) { setError('A reason is required for audit purposes.'); return; }
    setLoading(true);
    try {
      await adminAPI.overrideCustomerRestriction(customer.customer_id, { restriction_level: level, reason: reason.trim() });
      toast.success(`Restriction updated for ${customer.customer_name}.`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update restriction.');
    } finally {
      setLoading(false);
    }
  }

  const isDemotion = customer && level !== customer.restriction_level;
  const isLifting  = customer && (customer.restriction_level !== 'none') && level === 'none';

  return (
    <Modal open={open} onClose={onClose} title="Override restriction" width={460}>
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="cr-modal-customer">
          <div className="cr-modal-avatar">{customer?.customer_name?.[0]?.toUpperCase() || 'U'}</div>
          <div>
            <div className="cr-modal-name">{customer?.customer_name}</div>
            <div className="cr-modal-email">{customer?.customer_email}</div>
          </div>
        </div>

        <div className="ap-divider" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Restriction level" id="ov-level">
            <AppSelect id="ov-level" value={level} onChange={e => setLevel(e.target.value)}>
              {LEVELS.map(l => (
                <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
              ))}
            </AppSelect>
          </Field>

          <Field label="Reason / notes" id="ov-reason" error={error}>
            <textarea
              id="ov-reason"
              className="ap-input"
              rows={3}
              value={reason}
              onChange={e => { setReason(e.target.value); setError(''); }}
              placeholder="State the reason for this override. This will be logged to the audit trail."
              style={{ resize: 'vertical', minHeight: 72 }}
            />
          </Field>

          {isLifting && (
            <div className="cr-override-notice cr-override-notice--lift">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              This will restore full ordering access for this user.
            </div>
          )}
          {isDemotion && !isLifting && (
            <div className="cr-override-notice cr-override-notice--warn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Changing restriction level will affect this user's checkout options immediately.
            </div>
          )}

          <p style={{ fontSize: '0.6875rem', color: 'var(--color-muted-foreground)', lineHeight: 1.6 }}>
            All admin overrides are permanently logged to the audit trail with your account ID attached.
            Overrides cannot be silently reversed.
          </p>
        </div>

        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn
            variant={isLifting ? 'gold' : 'primary'}
            type="submit"
            loading={loading}
          >
            {isLifting ? 'Lift restriction' : 'Apply override'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Suspend / reinstate account modal ───────────────────────────────
function AccountStatusModal({ open, onClose, customer, onSuccess, toast }) {
  const suspending = customer?.account_status !== 'suspended';
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function submit() {
    if (!reason.trim()) { setError('A reason is required for audit purposes.'); return; }
    setLoading(true);
    try {
      await adminAPI.updateCustomerAccountStatus(customer.customer_id, {
        status: suspending ? 'suspended' : 'active',
        reason: reason.trim(),
      });
      toast.success(suspending
        ? `Account suspended for ${customer.customer_name}.`
        : `Account reinstated for ${customer.customer_name}.`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update account status.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={suspending ? 'Suspend account' : 'Reinstate account'}
      width={460}
    >
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="cr-modal-customer">
          <div className="cr-modal-avatar">{customer?.customer_name?.[0]?.toUpperCase() || 'U'}</div>
          <div>
            <div className="cr-modal-name">{customer?.customer_name}</div>
            <div className="cr-modal-email">{customer?.customer_email}</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <AccountBadge status={customer?.account_status} />
          </div>
        </div>

        <div className="ap-divider" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className={`cr-override-notice ${suspending ? 'cr-override-notice--warn' : 'cr-override-notice--lift'}`}>
            {suspending
              ? 'Suspending blocks this user from signing in and placing orders.'
              : "This restores the user's ability to sign in and place orders."}
          </div>

          <Field label="Reason / notes" id="acct-reason" error={error}>
            <textarea
              id="acct-reason"
              className="ap-input"
              rows={3}
              value={reason}
              onChange={e => { setReason(e.target.value); setError(''); }}
              placeholder="State the reason for this account change. This will be logged to the audit trail."
              style={{ resize: 'vertical', minHeight: 72 }}
            />
          </Field>

          <p style={{ fontSize: '0.6875rem', color: 'var(--color-muted-foreground)', lineHeight: 1.6 }}>
            All account status changes are permanently logged to the audit trail with your account ID attached.
          </p>
        </div>

        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant={suspending ? 'danger' : 'gold'} type="submit" loading={loading}>
            {suspending ? 'Suspend account' : 'Reinstate account'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────
const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);
const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const SuspendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="17" y1="8" x2="22" y2="13" />
    <line x1="22" y1="8" x2="17" y2="13" />
  </svg>
);
const ReinstateIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </svg>
);

// ── Customer restriction row ────────────────────────────────────────
function CustomerRow({ customer, onViewViolations, onOverride, onAccountStatus }) {
  const violCount = customer.total_violations || 0;

  return (
    <tr>
      {/* Customer */}
      <td>
        <div className="ap-member">
          <div className="cr-customer-avatar">
            {customer.customer_name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="ap-member__info">
            <span className="ap-member__name" title={customer.customer_name}>{customer.customer_name}</span>
            <span className="ap-member__email" title={customer.customer_email}>{customer.customer_email}</span>
          </div>
        </div>
      </td>

      {/* Mobile */}
      <td style={{ fontSize: '0.75rem', color: 'var(--color-muted-foreground)', whiteSpace: 'nowrap' }}>
        {customer.customer_mobile || '—'}
      </td>

      {/* Account status */}
      <td><AccountBadge status={customer.account_status} /></td>

      {/* Violations */}
      <td>
        <button className="cr-viol-count" onClick={() => onViewViolations(customer)} aria-label={`View violations for ${customer.customer_name}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {violCount} {violCount === 1 ? 'violation' : 'violations'}
        </button>
      </td>

      {/* Restriction */}
      <td><RestrictionBadge level={customer.restriction_level || 'none'} /></td>

      {/* Updated */}
      <td style={{ fontSize: '0.75rem', color: 'var(--color-muted-foreground)', whiteSpace: 'nowrap' }}>
        {customer.restriction_updated_at
          ? formatDate(customer.restriction_updated_at)
          : <span style={{ color: 'var(--color-muted-foreground)' }}>Auto</span>
        }
      </td>

      {/* Updated by */}
      <td style={{ fontSize: '0.75rem', color: 'var(--color-muted-foreground)' }}>
        {customer.updated_by_name
          ? customer.updated_by_name
          : <span style={{ color: 'var(--color-muted-foreground)' }}>System</span>
        }
      </td>

      {/* Actions */}
      <td className="ap-table__th--right">
        <div className="ap-row-actions">
          <RowAction
            icon={<HistoryIcon />}
            label="History"
            srLabel={`View violation history for ${customer.customer_name}`}
            onClick={() => onViewViolations(customer)}
          />
          <RowAction
            variant="gold"
            icon={<ShieldIcon />}
            label="Override"
            srLabel={`Override restriction for ${customer.customer_name}`}
            onClick={() => onOverride(customer)}
          />
          {customer.account_status === 'suspended' ? (
            <RowAction
              variant="success"
              icon={<ReinstateIcon />}
              label="Reinstate"
              srLabel={`Reinstate account for ${customer.customer_name}`}
              onClick={() => onAccountStatus(customer)}
            />
          ) : (
            <RowAction
              variant="danger"
              icon={<SuspendIcon />}
              label="Suspend"
              srLabel={`Suspend account for ${customer.customer_name}`}
              onClick={() => onAccountStatus(customer)}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Stats row ────────────────────────────────────────────────────────
function StatCards({ summary }) {
  const s = summary || {};

  const stats = [
    { label: 'Total users',        value: s.total_customers ?? '—',        color: undefined },
    { label: 'Flagged',            value: s.flagged ?? '—',                color: '#B45309' },
    { label: 'Warned',             value: s.warned ?? '—',                 color: '#D97706' },
    { label: 'GCash only',         value: s.cod_restricted ?? '—',         color: '#B45309' },
    { label: 'Ordering blocked',   value: s.restriction_suspended ?? '—',  color: '#DC2626' },
    { label: 'Accounts suspended', value: s.accounts_suspended ?? '—',     color: '#DC2626' },
  ];

  return (
    <div className="cr-stats">
      {stats.map((s2, i) => (
        <div key={i} className="cr-stat">
          <div className="cr-stat__value" style={s2.color ? { color: s2.color } : {}}>
            {s2.value}
          </div>
          <div className="cr-stat__label">{s2.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function CustomerRestrictions() {
  const { toast } = useAdminToast();

  const [customers, setCustomers]   = useState([]);
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]         = useState('');
  const [filterLevel, setFilterLevel]     = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterOpen, setFilterOpen]   = useState(false);

  // Debounce the server query so typing doesn't fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);

  const [viewViol, setViewViol]         = useState(null);   // customer for violation modal
  const [override, setOverride]         = useState(null);   // customer for override modal
  const [accountModal, setAccountModal] = useState(null);   // customer for suspend/reinstate modal

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    adminAPI.listCustomerRestrictions({
      page, limit: 10,
      search:            debouncedSearch || undefined,
      restriction_level: filterLevel || undefined,
      account_status:    filterAccount || undefined,
    })
      .then(({ data }) => {
        setCustomers(data.data || data);
        setTotalPages(data.totalPages || 1);
        setSummary(data.summary || null);
      })
      .catch(() => toast.error('Failed to load user accounts.'))
      .finally(() => { if (!silent) setLoading(false); });
  }, [page, debouncedSearch, filterLevel, filterAccount, toast]);

  // Fetch-on-mount: the sync setLoading inside `load` is intentional.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const hasFilters = Boolean(search || filterLevel || filterAccount);
  const clearFilters = () => { setSearch(''); setFilterLevel(''); setFilterAccount(''); setPage(1); };

  // First load gets the skeleton; paging/filtering keeps the rows and dims them.
  const firstLoad = loading && customers.length === 0;
  const busy = loading && customers.length > 0;

  const filterFields = (
    <>
      <AppSelect value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setPage(1); }} aria-label="Filter by restriction level">
        <option value="">All restriction levels</option>
        <option value="none">No restriction</option>
        <option value="warned">Warned</option>
        <option value="cod_restricted">GCash only</option>
        <option value="suspended">Ordering blocked</option>
      </AppSelect>
      <AppSelect value={filterAccount} onChange={e => { setFilterAccount(e.target.value); setPage(1); }} aria-label="Filter by account status">
        <option value="">All account statuses</option>
        <option value="active">Active</option>
        <option value="awaiting_verification">Awaiting verification</option>
        <option value="suspended">Suspended</option>
      </AppSelect>
      {hasFilters && (
        <button type="button" className="ap-clear-link" onClick={clearFilters}>Clear filters</button>
      )}
    </>
  );

  return (
    <>
      <div className="ap-page ap-page--wide">

        <PageHeader
          title="User Accounts"
          chip={`${summary?.flagged ?? 0} flagged`}
          sub="All registered user accounts. Restriction overrides and account suspensions are logged to the audit trail."
        />

        {/* Stats */}
        <StatCards summary={summary} />

        {/* Info notice */}
        <div className="ap-notice">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Every registered user account appears here. Overrides and account status changes are logged to the audit trail.
        </div>

        {/* Toolbar */}
        <div className="ap-toolbar">
          <div className="ap-toolbar__filters">
            <div style={{ minWidth: 220, flex: 1 }}>
              <TextInput
                placeholder="Search name, email, or mobile…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                prefix={<SearchIcon />}
                aria-label="Search user accounts"
              />
            </div>
            <FilterTrigger open={filterOpen} onClick={() => setFilterOpen(true)} active={hasFilters} label="Filter user accounts" />
            <FilterInline>{filterFields}</FilterInline>
          </div>
        </div>

        {/* Table */}
        <div className="ap-card">
          {firstLoad ? (
            <TableSkeleton rows={6} cols={8} />
          ) : customers.length === 0 ? (
            <div className="ap-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: 8 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div className="ap-empty__title">No user accounts found</div>
              <div className="ap-empty__sub">
                {filterLevel || filterAccount || search
                  ? 'No user accounts match the current filters.'
                  : 'No user accounts yet.'}
              </div>
            </div>
          ) : (
            <div className={`ap-table-wrap${busy ? ' is-busy' : ''}`} aria-busy={busy}>
              <table className="ap-table">
                <thead>
                  <tr>
                    {['User', 'Mobile', 'Account', 'Violations', 'Restriction', 'Last updated', 'Updated by', ''].map(h => (
                      <th key={h} scope="col" className={h === '' ? 'ap-table__th--right' : ''}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => (
                    <CustomerRow
                      key={c.customer_id}
                      customer={c}
                      onViewViolations={setViewViol}
                      onOverride={setOverride}
                      onAccountStatus={setAccountModal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!firstLoad && customers.length > 0 && (
            <div className="ap-table-foot">
              <span className="ap-table-foot__info">
                Page {page} of {totalPages} · showing {customers.length} user{customers.length === 1 ? '' : 's'}
              </span>
              <Pagination page={page} total={totalPages} onPage={setPage} />
            </div>
          )}
        </div>
      </div>

      {/* Violation history modal */}
      <ViolationModal
        key={viewViol?.customer_id ?? 'none'}
        open={!!viewViol}
        onClose={() => setViewViol(null)}
        customer={viewViol}
      />

      {/* Override modal */}
      <OverrideModal
        key={override?.customer_id ?? 'none'}
        open={!!override}
        onClose={() => setOverride(null)}
        customer={override}
        onSuccess={() => load(true)}
        toast={toast}
      />

      {/* Suspend / reinstate modal */}
      <AccountStatusModal
        key={accountModal?.customer_id ?? 'none'}
        open={!!accountModal}
        onClose={() => setAccountModal(null)}
        customer={accountModal}
        onSuccess={() => load(true)}
        toast={toast}
      />

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter user accounts">
        {filterFields}
      </FilterModal>
    </>
  );
}