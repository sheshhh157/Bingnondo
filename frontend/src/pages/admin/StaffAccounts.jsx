import { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI } from '../../services/api';
import '../../styles/AdminPage.css';

// ── tiny helpers ─────────────────────────────────────────────────────
const ROLES = ['cashier', 'kitchen_staff', 'staff', 'owner'];
const ROLE_LABELS = {
  cashier:       'Cashier',
  kitchen_staff: 'Kitchen Staff',
  staff:         'Staff',
  owner:         'Owner / Manager',
};

let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = ++_toastId;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  const dismiss = id => setToasts(p => p.filter(t => t.id !== id));
  return { toasts, dismiss, toast: { success: m => push(m,'success'), error: m => push(m,'error'), info: m => push(m,'info') } };
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
      <circle cx="12" cy="12" r="9" stroke="#2E2B22" strokeWidth="2.5"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#C9963C" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function Badge({ type, label }) {
  return (
    <span className={`ap-badge ap-badge--${type}`}>
      <span className="ap-badge__dot" aria-hidden="true"/>
      {label}
    </span>
  );
}

function Btn({ variant='ghost', size='md', icon, children, disabled, loading, onClick, type='button' }) {
  return (
    <button type={type} className={`ap-btn ap-btn--${variant} ap-btn--${size}`} disabled={disabled||loading} onClick={onClick}>
      {loading ? <Spinner size={13}/> : icon && <span style={{display:'flex',flexShrink:0}}>{icon}</span>}
      {children}
    </button>
  );
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

function TextInput({ id, error, prefix, ...props }) {
  return (
    <div className="ap-input-row">
      {prefix && <span className="ap-input-prefix">{prefix}</span>}
      <input id={id} className={`ap-input${prefix?' ap-input--prefix':''}${error?' ap-input--error':''}`} {...props}/>
    </div>
  );
}

function AppSelect({ id, error, children, ...props }) {
  return <select id={id} className={`ap-select${error?' ap-input--error':''}`} {...props}>{children}</select>;
}

function Modal({ open, onClose, title, width=480, children }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ap-overlay" ref={ref} onClick={e=>e.target===ref.current&&onClose()} role="presentation">
      <div className="ap-modal" style={{maxWidth:width}} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="ap-modal__head">
          <span className="ap-modal__title" id="modal-title">{title}</span>
          <button className="ap-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ap-modal__body">{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({ open, onClose, onConfirm, loading, title, message, confirmLabel='Confirm', variant='danger' }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={380}>
      <p style={{fontSize:'0.8125rem',color:'rgba(232,224,212,0.6)',lineHeight:1.6}}>{message}</p>
      <div className="ap-modal__footer">
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

// ── Create account modal ────────────────────────────────────────────
function CreateModal({ open, onClose, onCreated, toast }) {
  const [form, setForm] = useState({ full_name:'', email:'', role:'cashier', temp_password:'' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k,v) => { setForm(f=>({...f,[k]:v})); setErrors(e=>({...e,[k]:''})); };

  function validate() {
    const e = {};
    if (!form.full_name.trim())        e.full_name    = 'Full name is required.';
    if (!form.email.includes('@'))     e.email        = 'Enter a valid email.';
    if (!form.role)                    e.role         = 'Select a role.';
    if (form.temp_password.length < 8) e.temp_password = 'Minimum 8 characters.';
    setErrors(e); return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setLoading(true);
    try {
      await adminAPI.createStaffAccount(form);
      toast.success(`Account created for ${form.full_name}.`);
      onCreated();
      onClose();
      setForm({ full_name:'', email:'', role:'cashier', temp_password:'' });
    } catch (err) {
      toast.error(err.message || 'Failed to create account.');
    } finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create staff account">
      <Field label="Full name" id="sa-name" error={errors.full_name}>
        <TextInput id="sa-name" value={form.full_name} onChange={e=>set('full_name',e.target.value)} placeholder="e.g. Maria Santos" error={errors.full_name}/>
      </Field>
      <Field label="Email address" id="sa-email" error={errors.email}>
        <TextInput id="sa-email" type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="staff@bingnondo.com" error={errors.email}/>
      </Field>
      <Field label="Role" id="sa-role" error={errors.role}>
        <AppSelect id="sa-role" value={form.role} onChange={e=>set('role',e.target.value)}>
          {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </AppSelect>
      </Field>
      <Field label="Temporary password" id="sa-pass" error={errors.temp_password}>
        <TextInput id="sa-pass" type="password" value={form.temp_password} onChange={e=>set('temp_password',e.target.value)} placeholder="Min. 8 characters" error={errors.temp_password}/>
      </Field>
      <p style={{fontSize:'0.6875rem',color:'rgba(232,224,212,0.3)',lineHeight:1.6}}>
        Staff will be prompted to change this password on first sign-in. All actions are logged.
      </p>
      <div className="ap-modal__footer">
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn variant="primary" onClick={submit} loading={loading}>Create account</Btn>
      </div>
    </Modal>
  );
}

// ── Staff table row ─────────────────────────────────────────────────
function StaffRow({ account, onStatusChange, onReset, actionLoading }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = account.status === 'active';
  const busy = actionLoading === account.id;

  return (
    <tr>
      <td>
        <div className="ap-member">
          <div className="ap-avatar">{account.full_name?.slice(0,2).toUpperCase()}</div>
          <div className="ap-member__info">
            <span className="ap-member__name">{account.full_name}</span>
            <span className="ap-member__email">{account.email}</span>
          </div>
        </div>
      </td>
      <td><Badge type={account.role} label={ROLE_LABELS[account.role]||account.role}/></td>
      <td><Badge type={isActive?'active':'inactive'} label={isActive?'Active':'Inactive'}/></td>
      <td style={{fontSize:'0.75rem',color:'rgba(232,224,212,0.4)',whiteSpace:'nowrap'}}>
        {new Date(account.created_at).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'})}
      </td>
      <td className="ap-table__th--right">
        <div className="ap-menu-wrap">
          <Btn variant="ghost" size="icon" onClick={()=>setMenuOpen(o=>!o)} disabled={busy} aria-label="Actions">
            {busy ? <Spinner size={13}/> : <span style={{letterSpacing:'0.1em',fontSize:'1rem'}}>···</span>}
          </Btn>
          {menuOpen && (
            <>
              <div className="ap-menu__backdrop" onClick={()=>setMenuOpen(false)}/>
              <div className="ap-menu">
                <button className="ap-menu__item" onClick={()=>{setMenuOpen(false);onReset(account);}}>Reset password</button>
                <div className="ap-menu__divider"/>
                <button
                  className={`ap-menu__item ap-menu__item--${isActive?'danger':'success'}`}
                  onClick={()=>{setMenuOpen(false);onStatusChange(account);}}
                >
                  {isActive?'Deactivate':'Reactivate'}
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Pagination ──────────────────────────────────────────────────────
function Pagination({ page, total, onPage }) {
  if (total <= 1) return null;
  return (
    <div className="ap-pager">
      <Btn variant="ghost" size="sm" disabled={page<=1} onClick={()=>onPage(page-1)}>←</Btn>
      {Array.from({length:total},(_,i)=>i+1).map(p=>(
        <Btn key={p} variant={p===page?'gold':'ghost'} size="sm" onClick={()=>onPage(p)}>{p}</Btn>
      ))}
      <Btn variant="ghost" size="sm" disabled={page>=total} onClick={()=>onPage(page+1)}>→</Btn>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────
export default function StaffAccounts() {
  const { toasts, dismiss, toast } = useToast();

  const [accounts, setAccounts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch]         = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [createOpen, setCreateOpen]   = useState(false);
  const [actionRow, setActionRow]     = useState(null);
  const [actionType, setActionType]   = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.listStaffAccounts({ page, limit:10, search:search||undefined, role:filterRole||undefined, status:filterStatus||undefined });
      setAccounts(data.data || data);
      setTotalPages(data.totalPages || 1);
    } catch { toast.error('Failed to load accounts.'); }
    finally { setLoading(false); }
  }, [page, search, filterRole, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange() {
    const newStatus = actionRow.status === 'active' ? 'inactive' : 'active';
    setActionLoading(actionRow.id);
    try {
      await adminAPI.updateStaffStatus(actionRow.id, newStatus);
      toast.success(`${actionRow.full_name} ${newStatus==='active'?'reactivated':'deactivated'}.`);
      load();
    } catch (err) { toast.error(err.message||'Action failed.'); }
    finally { setActionLoading(null); setActionRow(null); setActionType(null); }
  }

  async function handleReset() {
    setActionLoading(actionRow.id);
    try {
      await adminAPI.resetStaffPassword(actionRow.id);
      toast.success(`Password reset email sent to ${actionRow.email}.`);
    } catch (err) { toast.error(err.message||'Reset failed.'); }
    finally { setActionLoading(null); setActionRow(null); setActionType(null); }
  }

  const PlusIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
  const SearchIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );

  return (
    <>
      <Toasts toasts={toasts} dismiss={dismiss}/>

      <div className="ap-page ap-page--wide">
        {/* Toolbar */}
        <div className="ap-toolbar">
          <div className="ap-toolbar__filters">
            <div style={{minWidth:200,flex:1}}>
              <Field id="sa-search">
                <TextInput id="sa-search" placeholder="Search name or email…" value={search}
                  onChange={e=>{setSearch(e.target.value);setPage(1);}} prefix={<SearchIcon/>}/>
              </Field>
            </div>
            <div style={{minWidth:140}}>
              <AppSelect value={filterRole} onChange={e=>{setFilterRole(e.target.value);setPage(1);}}>
                <option value="">All roles</option>
                {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </AppSelect>
            </div>
            <div style={{minWidth:130}}>
              <AppSelect value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(1);}}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </AppSelect>
            </div>
          </div>
          <Btn variant="primary" onClick={()=>setCreateOpen(true)} icon={<PlusIcon/>}>New account</Btn>
        </div>

        {/* Table */}
        <div className="ap-card">
          {loading ? (
            <div className="ap-loading"><Spinner size={24}/></div>
          ) : accounts.length === 0 ? (
            <div className="ap-empty">
              <div className="ap-empty__title">No accounts found</div>
              <div className="ap-empty__sub">Try adjusting the filters, or create a new account.</div>
            </div>
          ) : (
            <div className="ap-table-wrap">
              <table className="ap-table">
                <thead>
                  <tr>
                    {['Staff member','Role','Status','Created',''].map(h=>(
                      <th key={h} className={h===''?'ap-table__th--right':''}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a=>(
                    <StaffRow key={a.id} account={a}
                      onStatusChange={r=>{setActionRow(r);setActionType(r.status==='active'?'deactivate':'reactivate');}}
                      onReset={r=>{setActionRow(r);setActionType('reset');}}
                      actionLoading={actionLoading}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && accounts.length > 0 && (
            <div className="ap-table-foot">
              <span className="ap-table-foot__info">Page {page} of {totalPages}</span>
              <Pagination page={page} total={totalPages} onPage={setPage}/>
            </div>
          )}
        </div>
      </div>

      <CreateModal open={createOpen} onClose={()=>setCreateOpen(false)} onCreated={load} toast={toast}/>

      <ConfirmModal open={actionType==='deactivate'} onClose={()=>{setActionRow(null);setActionType(null);}}
        onConfirm={handleStatusChange} loading={!!actionLoading} title="Deactivate account"
        message={`${actionRow?.full_name} will lose access immediately. This action is logged.`}
        confirmLabel="Deactivate" variant="danger"/>

      <ConfirmModal open={actionType==='reactivate'} onClose={()=>{setActionRow(null);setActionType(null);}}
        onConfirm={handleStatusChange} loading={!!actionLoading} title="Reactivate account"
        message={`Restore access for ${actionRow?.full_name}? This action is logged.`}
        confirmLabel="Reactivate" variant="gold"/>

      <ConfirmModal open={actionType==='reset'} onClose={()=>{setActionRow(null);setActionType(null);}}
        onConfirm={handleReset} loading={!!actionLoading} title="Reset password"
        message={`A reset email will be sent to ${actionRow?.email}. This action is logged.`}
        confirmLabel="Send reset email" variant="ghost"/>
    </>
  );
}