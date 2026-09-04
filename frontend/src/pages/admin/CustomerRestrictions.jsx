import { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI } from '../../services/api';
import '../../styles/AdminPage.css';

// ── shared mini-components (same pattern as other admin pages) ──────
let _tid = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = ++_tid;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);
  const dismiss = id => setToasts(p => p.filter(t => t.id !== id));
  return { toasts, dismiss, toast: { success: m => push(m, 'success'), error: m => push(m, 'error'), info: m => push(m, 'info') } };
}

function Toasts({ toasts, dismiss }) {
  const icons = { success: '✓', error: '✕', info: 'i' };
  return (
    <div className="ap-toast-stack" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`ap-toast ap-toast--${t.type}`}>
          <span className="ap-toast__icon">{icons[t.type]}</span>
          <span className="ap-toast__msg">{t.msg}</span>
          <button className="ap-toast__dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

function Spinner({ size = 16 }) {
  return (
    <svg className="ap-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#2E2B22" strokeWidth="2.5" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#C9963C" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Btn({ variant = 'ghost', size = 'md', icon, children, disabled, loading, onClick, type = 'button' }) {
  return (
    <button type={type} className={`ap-btn ap-btn--${variant} ap-btn--${size}`} disabled={disabled || loading} onClick={onClick}>
      {loading ? <Spinner size={13} /> : icon && <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>}
      {children}
    </button>
  );
}

function AppSelect({ id, children, ...props }) {
  return <select id={id} className="ap-select" {...props}>{children}</select>;
}

function Field({ label, id, error, children }) {
  return (
    <div className="ap-input-wrap">
      {label && <label className="ap-label" htmlFor={id}>{label}</label>}
      {children}
      {error && <span className="ap-field-error">{error}</span>}
    </div>
  );
}

function Modal({ open, onClose, title, width = 520, children }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ap-overlay" ref={ref} onClick={e => e.target === ref.current && onClose()} role="presentation">
      <div className="ap-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="ap-modal__head">
          <span className="ap-modal__title" id="modal-title">{title}</span>
          <button className="ap-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ap-modal__body">{children}</div>
      </div>
    </div>
  );
}

function Pagination({ page, total, onPage }) {
  if (total <= 1) return null;
  return (
    <div className="ap-pager">
      <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>←</Btn>
      {Array.from({ length: total }, (_, i) => i + 1).map(p => (
        <Btn key={p} variant={p === page ? 'gold' : 'ghost'} size="sm" onClick={() => onPage(p)}>{p}</Btn>
      ))}
      <Btn variant="ghost" size="sm" disabled={page >= total} onClick={() => onPage(page + 1)}>→</Btn>
    </div>
  );
}

// ── Restriction level badge ─────────────────────────────────────────
const LEVEL_META = {
  none:           { label: 'No restriction',   cls: 'cr-badge--none'     },
  warned:         { label: 'Warned',            cls: 'cr-badge--warned'   },
  cod_restricted: { label: 'GCash only',        cls: 'cr-badge--codblock' },
  suspended:      { label: 'Suspended',         cls: 'cr-badge--suspend'  },
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
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!open || !customer) return;
    setLoading(true);
    adminAPI.getCustomerViolations(customer.customer_id)
      .then(({ data }) => setViolations(data))
      .catch(() => setViolations([]))
      .finally(() => setLoading(false));
  }, [open, customer]);

  return (
    <Modal open={open} onClose={onClose} title="Violation history" width={560}>
      {/* Customer header */}
      <div className="cr-modal-customer">
        <div className="cr-modal-avatar">{customer?.customer_name?.[0]?.toUpperCase() || 'C'}</div>
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
          <div className="ap-empty__sub">This customer has a clean order history.</div>
        </div>
      ) : (
        <div className="cr-viol-list">
          {violations.map(v => (
            <div key={v.id} className="cr-viol-row">
              <div className="cr-viol-row__left">
                <ViolBadge type={v.violation_type} />
                {v.order_id && (
                  <span className="cr-viol-row__order">Order #{v.order_id}</span>
                )}
              </div>
              <div className="cr-viol-row__date">
                {new Date(v.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
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
  const [level, setLevel]   = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (open && customer) {
      setLevel(customer.restriction_level || 'none');
      setReason('');
      setError('');
    }
  }, [open, customer]);

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
      <div className="cr-modal-customer">
        <div className="cr-modal-avatar">{customer?.customer_name?.[0]?.toUpperCase() || 'C'}</div>
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
          {error && <span className="ap-field-error">{error}</span>}
        </Field>

        {isLifting && (
          <div className="cr-override-notice cr-override-notice--lift">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            This will restore full ordering access for this customer.
          </div>
        )}
        {isDemotion && !isLifting && (
          <div className="cr-override-notice cr-override-notice--warn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Changing restriction level will affect this customer's checkout options immediately.
          </div>
        )}

        <p style={{ fontSize: '0.6875rem', color: 'rgba(232,224,212,0.28)', lineHeight: 1.6 }}>
          All admin overrides are permanently logged to the audit trail with your account ID attached.
          Overrides cannot be silently reversed.
        </p>
      </div>

      <div className="ap-modal__footer">
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn
          variant={isLifting ? 'gold' : 'primary'}
          onClick={submit}
          loading={loading}
        >
          {isLifting ? 'Lift restriction' : 'Apply override'}
        </Btn>
      </div>
    </Modal>
  );
}

// ── Customer restriction row ────────────────────────────────────────
function CustomerRow({ customer, onViewViolations, onOverride }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const violCount = customer.violation_count || 0;

  return (
    <tr>
      {/* Customer */}
      <td>
        <div className="ap-member">
          <div className="cr-customer-avatar">
            {customer.customer_name?.[0]?.toUpperCase() || 'C'}
          </div>
          <div className="ap-member__info">
            <span className="ap-member__name">{customer.customer_name}</span>
            <span className="ap-member__email">{customer.customer_email}</span>
          </div>
        </div>
      </td>

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
      <td style={{ fontSize: '0.75rem', color: 'rgba(232,224,212,0.4)', whiteSpace: 'nowrap' }}>
        {customer.updated_at
          ? new Date(customer.updated_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
          : <span style={{ color: 'rgba(232,224,212,0.2)' }}>Auto</span>
        }
      </td>

      {/* Updated by */}
      <td style={{ fontSize: '0.75rem', color: 'rgba(232,224,212,0.4)' }}>
        {customer.updated_by_name
          ? customer.updated_by_name
          : <span style={{ color: 'rgba(232,224,212,0.2)' }}>System</span>
        }
      </td>

      {/* Actions */}
      <td className="ap-table__th--right">
        <div className="ap-menu-wrap">
          <Btn variant="ghost" size="icon" onClick={() => setMenuOpen(o => !o)} aria-label="Actions">
            <span style={{ letterSpacing: '0.1em', fontSize: '1rem' }}>···</span>
          </Btn>
          {menuOpen && (
            <>
              <div className="ap-menu__backdrop" onClick={() => setMenuOpen(false)} />
              <div className="ap-menu">
                <button className="ap-menu__item" onClick={() => { setMenuOpen(false); onViewViolations(customer); }}>
                  View violations
                </button>
                <div className="ap-menu__divider" />
                <button className="ap-menu__item" onClick={() => { setMenuOpen(false); onOverride(customer); }}>
                  Override restriction
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Stats row ────────────────────────────────────────────────────────
function StatCards({ customers }) {
  const total      = customers.length;
  const warned     = customers.filter(c => c.restriction_level === 'warned').length;
  const codBlock   = customers.filter(c => c.restriction_level === 'cod_restricted').length;
  const suspended  = customers.filter(c => c.restriction_level === 'suspended').length;

  const stats = [
    { label: 'Flagged customers', value: total,     icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { label: 'Warned',            value: warned,    color: '#D4A030' },
    { label: 'GCash only',        value: codBlock,  color: '#A090D0' },
    { label: 'Suspended',         value: suspended, color: '#E06050' },
  ];

  return (
    <div className="cr-stats">
      {stats.map((s, i) => (
        <div key={i} className="cr-stat">
          <div className="cr-stat__value" style={s.color ? { color: s.color } : {}}>
            {s.value}
          </div>
          <div className="cr-stat__label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function CustomerRestrictions() {
  const { toasts, dismiss, toast } = useToast();

  const [customers, setCustomers]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]         = useState('');
  const [filterLevel, setFilterLevel] = useState('');

  const [viewViol, setViewViol]   = useState(null);   // customer for violation modal
  const [override, setOverride]   = useState(null);   // customer for override modal

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.listCustomerRestrictions({
        page, limit: 12,
        search:           search     || undefined,
        restriction_level: filterLevel || undefined,
      });
      setCustomers(data.data || data);
      setTotalPages(data.totalPages || 1);
    } catch {
      toast.error('Failed to load customer restrictions.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterLevel]);

  useEffect(() => { load(); }, [load]);

  const SearchIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );

  return (
    <>
      <Toasts toasts={toasts} dismiss={dismiss} />

      <div className="ap-page ap-page--wide">

        {/* Stats */}
        <StatCards customers={customers} />

        {/* Info notice */}
        <div className="ap-notice">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Only customers with at least one violation or an active restriction appear here. All override actions are logged.
        </div>

        {/* Toolbar */}
        <div className="ap-toolbar">
          <div className="ap-toolbar__filters">
            <div style={{ minWidth: 220, flex: 1 }}>
              <div className="ap-input-row">
                <span className="ap-input-prefix"><SearchIcon /></span>
                <input
                  className="ap-input ap-input--prefix"
                  placeholder="Search customer name or email…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  aria-label="Search customers"
                />
              </div>
            </div>
            <div style={{ minWidth: 180 }}>
              <AppSelect value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setPage(1); }}>
                <option value="">All restriction levels</option>
                <option value="warned">Warned</option>
                <option value="cod_restricted">GCash only</option>
                <option value="suspended">Suspended</option>
              </AppSelect>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="ap-card">
          {loading ? (
            <div className="ap-loading"><Spinner size={24} /></div>
          ) : customers.length === 0 ? (
            <div className="ap-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(232,224,212,0.15)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: 8 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div className="ap-empty__title">No restricted customers</div>
              <div className="ap-empty__sub">
                {filterLevel || search
                  ? 'No customers match the current filters.'
                  : 'All customers are in good standing.'}
              </div>
            </div>
          ) : (
            <div className="ap-table-wrap">
              <table className="ap-table">
                <thead>
                  <tr>
                    {['Customer', 'Violations', 'Restriction', 'Last updated', 'Updated by', ''].map(h => (
                      <th key={h} className={h === '' ? 'ap-table__th--right' : ''}>{h}</th>
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
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && customers.length > 0 && (
            <div className="ap-table-foot">
              <span className="ap-table-foot__info">
                Page {page} of {totalPages} · {customers.length} customers
              </span>
              <Pagination page={page} total={totalPages} onPage={setPage} />
            </div>
          )}
        </div>
      </div>

      {/* Violation history modal */}
      <ViolationModal
        open={!!viewViol}
        onClose={() => setViewViol(null)}
        customer={viewViol}
      />

      {/* Override modal */}
      <OverrideModal
        open={!!override}
        onClose={() => setOverride(null)}
        customer={override}
        onSuccess={load}
        toast={toast}
      />
    </>
  );
}