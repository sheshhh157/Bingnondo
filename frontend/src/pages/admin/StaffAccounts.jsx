import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Spinner, TableSkeleton, Badge, Btn, Field, TextInput, PasswordInput,
  AppSelect, Modal, ConfirmModal, PageHeader, RowAction, Pagination,
} from './adminShared';
import { useAdminToast } from './useAdminToast';
import { formatDate } from './format';
import FilterModal, { FilterTrigger, FilterInline } from '../../components/MobileFilter';
import '../../styles/AdminPage.css';

// ── constants ─────────────────────────────────────────────────────────────────
const ROLES = ['cashier', 'kitchen_staff'];
const ROLE_LABELS = {
  cashier:       'Cashier',
  kitchen_staff: 'Kitchen Staff',
  owner:         'Owner',
  admin:         'Admin',
};
const ROLE_DESC = {
  cashier:       'Cashier: takes counter orders, marks payments, manages online orders.',
  kitchen_staff: 'Kitchen Staff: sees the kitchen queue and updates order progress.',
};

// ── tiny icons ────────────────────────────────────────────────────────────────
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
const ResetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const BanIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const KebabIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
  </svg>
);

// ── Create account modal ──────────────────────────────────────────────────────
function CreateModal({ open, onClose, onCreated, toast }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'cashier', temp_password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  function validate() {
    const e = {};
    if (!form.full_name.trim())        e.full_name     = 'Full name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email.';
    if (!form.role)                    e.role          = 'Select a role.';
    if (form.temp_password.length < 8) e.temp_password = 'Minimum 8 characters.';
    setErrors(e); return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setLoading(true);
    try {
      await adminAPI.createStaffAccount({
        full_name:     form.full_name.trim(),
        email:         form.email.trim(),
        role:          form.role,
        temp_password: form.temp_password,
      });
      toast.success(`Account created for ${form.full_name.trim()}.`);
      onCreated();
      onClose();
      setForm({ full_name: '', email: '', role: 'cashier', temp_password: '' });
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to create account.');
    } finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create staff account">
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Full name" id="sa-name" error={errors.full_name}>
          <TextInput id="sa-name" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="e.g. Maria Santos" error={errors.full_name} autoFocus />
        </Field>
        <Field label="Email address" id="sa-email" error={errors.email}>
          <TextInput id="sa-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="staff@bingnondo.com" error={errors.email} />
        </Field>
        <Field label="Role" id="sa-role" error={errors.role} hint={ROLE_DESC[form.role]}>
          <AppSelect id="sa-role" value={form.role} onChange={e => set('role', e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </AppSelect>
        </Field>
        <Field label="Temporary password" id="sa-pass" error={errors.temp_password}>
          <PasswordInput id="sa-pass" value={form.temp_password} onChange={e => set('temp_password', e.target.value)} placeholder="Min. 8 characters" error={errors.temp_password} autoComplete="new-password" />
        </Field>
        <p className="ap-field-hint">
          Staff will be prompted to change this password on first sign-in. All actions are logged.
        </p>
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" loading={loading}>Create account</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit account modal ────────────────────────────────────────────────────────
function EditModal({ account, onClose, onSaved, toast }) {
  const [form, setForm] = useState({
    full_name: account.full_name || '',
    email:     account.email || '',
    role:      account.role || 'cashier',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  function validate() {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'Full name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email.';
    if (!form.role) e.role = 'Select a role.';
    setErrors(e); return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setLoading(true);
    try {
      await adminAPI.updateStaffAccount(account.id, {
        full_name: form.full_name.trim(),
        email:     form.email.trim(),
        role:      form.role,
      });
      toast.success(`${form.full_name.trim()} updated.`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to update account.');
    } finally { setLoading(false); }
  }

  return (
    <Modal open onClose={onClose} title="Edit staff account">
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Full name" id="sa-edit-name" error={errors.full_name}>
          <TextInput id="sa-edit-name" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="e.g. Maria Santos" error={errors.full_name} autoFocus />
        </Field>
        <Field label="Email address" id="sa-edit-email" error={errors.email}>
          <TextInput id="sa-edit-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="staff@bingnondo.com" error={errors.email} />
        </Field>
        <Field label="Role" id="sa-edit-role" error={errors.role} hint={ROLE_DESC[form.role]}>
          <AppSelect id="sa-edit-role" value={form.role} onChange={e => set('role', e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </AppSelect>
        </Field>
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" loading={loading}>Save changes</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Reset password modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ open, onClose, account, toast }) {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  async function submit() {
    if (newPassword.length < 8) { setError('Minimum 8 characters.'); return; }
    setLoading(true);
    try {
      await adminAPI.resetStaffPassword(account.id, newPassword);
      toast.success(`Password reset for ${account.full_name}.`);
      setNewPassword('');
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Reset failed.');
    } finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Reset password — ${account?.full_name}`} width={420}>
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <p className="ap-field-hint" style={{ marginBottom: 14 }}>
          Enter a new password for this staff member. They should change it on next login.
        </p>
        <Field id="rp-pass" error={error}>
          <PasswordInput id="rp-pass" value={newPassword} onChange={e => { setNewPassword(e.target.value); setError(''); }} placeholder="New password (min. 8 chars)" error={error} autoFocus aria-label="New password" />
        </Field>
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" loading={loading}>Reset password</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Staff table row ───────────────────────────────────────────────────────────
function StaffRow({ account, isSelf, menuOpen, onToggleMenu, onCloseMenu, onEdit, onStatusChange, onReset, onDelete, actionLoading }) {
  const isActive = account.status === 'active';
  const busy = actionLoading === account.id;
  const selfActive = isSelf && isActive;
  const manageable = ROLES.includes(account.role);

  const actions = [
    { key: 'edit',  label: 'Edit',           icon: <EditIcon />,  onClick: () => onEdit(account),   disabled: !manageable },
    { key: 'reset', label: 'Reset password', icon: <ResetIcon />, onClick: () => onReset(account) },
    isActive
      ? { key: 'deactivate', label: 'Deactivate', icon: <BanIcon />,   onClick: () => onStatusChange(account), disabled: !manageable || selfActive, variant: 'danger',  tone: 'danger' }
      : { key: 'reactivate', label: 'Reactivate', icon: <CheckIcon />, onClick: () => onStatusChange(account), disabled: !manageable, variant: 'success', tone: 'success' },
    { key: 'delete', label: 'Delete', icon: <TrashIcon />, onClick: () => onDelete(account), disabled: !manageable || isSelf, variant: 'danger', tone: 'danger' },
  ];

  return (
    <>
      <tr className={isActive ? undefined : 'ap-row--inactive'}>
        <td className="ap-col--member">
          <div className="ap-member">
            <div className="ap-member__info">
              <span className="ap-member__name-row">
                <span className="ap-member__name" title={account.full_name}>{account.full_name}</span>
                {isSelf && <span className="ap-you-tag">You</span>}
              </span>
              <span className="ap-member__email" title={account.email}>{account.email}</span>
            </div>
          </div>
        </td>
        <td className="ap-col--role"><Badge type={account.role} label={ROLE_LABELS[account.role] || account.role} /></td>
        <td className="ap-col--status"><Badge type={isActive ? 'active' : 'inactive'} label={isActive ? 'Active' : 'Inactive'} /></td>
        <td className="ap-col--created" style={{ fontSize: '0.75rem', color: 'var(--color-muted-foreground)', whiteSpace: 'nowrap' }}>
          {formatDate(account.created_at)}
          {account.created_by_name && (
            <div style={{ fontSize: '0.6875rem', marginTop: 2, color: 'var(--color-muted-foreground)' }}>
              by {account.created_by_name}
            </div>
          )}
        </td>
        <td className="ap-table__th--right ap-col--actions">
          {busy ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px' }}>
              <Spinner size={14} />
            </div>
          ) : (
            <>
              <div className="ap-row-actions ap-row-actions--inline">
                {actions.map(a => (
                  <RowAction
                    key={a.key}
                    variant={a.variant || 'default'}
                    icon={a.icon}
                    label={a.label}
                    srLabel={`${a.label} ${account.full_name}`}
                    onClick={a.onClick}
                    disabled={a.disabled}
                  />
                ))}
              </div>
              <button
                type="button"
                className="ap-kebab"
                aria-label={`Actions for ${account.full_name}`}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={onToggleMenu}
              >
                <KebabIcon />
              </button>
            </>
          )}
        </td>
      </tr>
      {menuOpen && (
        <tr className="ap-row-menu-row">
          <td colSpan={3} className="ap-row-menu-cell">
            <div className="ap-row-menu" role="menu">
              {actions.map(a => (
                <button
                  key={a.key}
                  type="button"
                  role="menuitem"
                  className={`ap-menu__item${a.tone === 'danger' ? ' ap-menu__item--danger' : ''}${a.tone === 'success' ? ' ap-menu__item--success' : ''}`}
                  disabled={a.disabled}
                  onClick={() => { onCloseMenu(); a.onClick(); }}
                >
                  <span className="ap-menu__item-icon">{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StaffAccounts() {
  const { user } = useAuth();
  const { toast } = useAdminToast();

  const [accounts, setAccounts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const [createOpen, setCreateOpen]       = useState(false);
  const [editTarget, setEditTarget]       = useState(null);
  const [resetTarget, setResetTarget]     = useState(null);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionRow, setActionRow]         = useState(null);
  const [actionType, setActionType]       = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [menuId, setMenuId]               = useState(null);

  // Backend ignores page/limit/search/role/status — fetch the full list once,
  // filter + paginate on the client.
  const load = useCallback(async () => {
    try {
      const res = await adminAPI.listStaffAccounts();
      const payload = res.data?.data || res.data;
      setAccounts(Array.isArray(payload) ? payload : (payload.data || []));
    } catch { toast.error('Failed to load accounts.'); }
    finally { setLoading(false); }
  }, [toast]);

  // Fetch-on-mount: the sync setLoading inside `load` is intentional.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter(a => {
      const matchQ     = !q || (a.full_name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q);
      const matchRole  = !filterRole || a.role === filterRole;
      const matchSt    = !filterStatus || a.status === filterStatus;
      return matchQ && matchRole && matchSt;
    });
  }, [accounts, search, filterRole, filterStatus]);

  const hasFilters = Boolean(search.trim() || filterRole || filterStatus);

  const filterFields = (
    <>
      <AppSelect value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1); }} aria-label="Filter by role">
        <option value="">All roles</option>
        {Object.keys(ROLE_LABELS).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </AppSelect>
      <AppSelect value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="deactivated">Inactive</option>
      </AppSelect>
      {hasFilters && (
        <button type="button" className="ap-clear-link" onClick={clearFilters}>Clear filters</button>
      )}
    </>
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage   = Math.min(page, totalPages);
  const visible    = useMemo(() => filtered.slice((safePage - 1) * 10, safePage * 10), [filtered, safePage]);

  function clearFilters() {
    setSearch(''); setFilterRole(''); setFilterStatus(''); setPage(1);
  }

  async function handleStatusChange() {
    const target = actionRow;
    const newStatus = target.status === 'active' ? 'deactivated' : 'active';
    setActionLoading(target.id);
    // Optimistic: flip the status pill immediately; the reload below reconciles
    // with the server (e.g. dropping the row if a status filter is active).
    setAccounts(list => list.map(a => (a.id === target.id ? { ...a, status: newStatus } : a)));
    try {
      await adminAPI.updateStaffStatus(target.id, newStatus);
      toast.success(`${target.full_name} ${newStatus === 'active' ? 'reactivated' : 'deactivated'}.`);
      load();
    } catch (err) {
      setAccounts(list => list.map(a => (a.id === target.id ? { ...a, status: target.status } : a)));
      toast.error(err?.response?.data?.message || 'Action failed.');
    } finally { setActionLoading(null); setActionRow(null); setActionType(null); }
  }

  async function handleDelete() {
    const target = deleteTarget;
    setDeleteLoading(true);
    try {
      await adminAPI.deleteStaffAccount(target.id);
      toast.success(`${target.full_name} deleted.`);
      setAccounts(list => list.filter(a => a.id !== target.id));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete account.');
    } finally { setDeleteLoading(false); }
  }

  return (
    <>
      <div className="ap-page ap-page--wide">
        <PageHeader
          title="Staff Accounts"
          chip={`${filtered.length} account${filtered.length === 1 ? '' : 's'}`}
          sub="Who can sign in to Bingnondo, and what they can do. Every change is recorded in the Audit Log."
          action={<Btn variant="primary" onClick={() => setCreateOpen(true)} icon={<PlusIcon />}>New account</Btn>}
        />

        {/* Toolbar */}
        <div className="ap-toolbar">
          <div className="ap-toolbar__filters">
            <div style={{ minWidth: 200, flex: 1 }}>
              <Field id="sa-search">
                <TextInput id="sa-search" placeholder="Search name or email…" value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }} prefix={<SearchIcon />} aria-label="Search staff" />
              </Field>
            </div>
            <FilterTrigger open={filterOpen} onClick={() => setFilterOpen(true)} active={hasFilters} label="Filter accounts" />
            <FilterInline>{filterFields}</FilterInline>
          </div>
        </div>

        {/* Table */}
        <div className="ap-card">
          {loading && accounts.length === 0 ? (
            <TableSkeleton rows={5} cols={5} />
          ) : filtered.length === 0 ? (
            accounts.length === 0 ? (
              <div className="ap-empty">
                <div className="ap-empty__title">No staff yet</div>
                <div className="ap-empty__sub">Create the first account to get your team signed in.</div>
                <Btn variant="primary" size="sm" onClick={() => setCreateOpen(true)} icon={<PlusIcon />} style={{ marginTop: 12 }}>New account</Btn>
              </div>
            ) : (
              <div className="ap-empty">
                <div className="ap-empty__title">No matches</div>
                <div className="ap-empty__sub">No staff match the current filters.</div>
                <button type="button" className="ap-clear-link" onClick={clearFilters} style={{ marginTop: 10 }}>Clear filters</button>
              </div>
            )
          ) : (
            <div className="ap-table-wrap ap-table-wrap--fit">
              <table className="ap-table ap-table--fit">
                <thead>
                  <tr>
                    {[
                      { label: 'Staff member' },
                      { label: 'Role' },
                      { label: 'Status',  className: 'ap-col--status' },
                      { label: 'Created', className: 'ap-col--created' },
                      { label: '',        className: 'ap-table__th--right ap-col--actions' },
                    ].map((h, i) => (
                      <th key={i} scope="col" className={h.className || ''}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(a => (
                    <StaffRow key={a.id} account={a} isSelf={a.id === user?.id}
                      menuOpen={menuId === a.id}
                      onToggleMenu={() => setMenuId(id => (id === a.id ? null : a.id))}
                      onCloseMenu={() => setMenuId(null)}
                      onEdit={r => setEditTarget(r)}
                      onStatusChange={r => { setActionRow(r); setActionType(r.status === 'active' ? 'deactivate' : 'reactivate'); }}
                      onReset={r => setResetTarget(r)}
                      onDelete={r => setDeleteTarget(r)}
                      actionLoading={actionLoading}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="ap-table-foot">
              <span className="ap-table-foot__info">
                {visible.length < filtered.length
                  ? `${visible.length} of ${filtered.length} account${filtered.length === 1 ? '' : 's'}`
                  : `${filtered.length} account${filtered.length === 1 ? '' : 's'}`}
                {totalPages > 1 && <> · page {safePage} of {totalPages}</>}
              </span>
              <Pagination page={safePage} total={totalPages} onPage={setPage} />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} toast={toast} />
      {editTarget && (
        <EditModal
          key={editTarget.id}
          account={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={load}
          toast={toast}
        />
      )}
      <ResetPasswordModal open={!!resetTarget} onClose={() => setResetTarget(null)} account={resetTarget} toast={toast} />

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter accounts">
        {filterFields}
      </FilterModal>

      <ConfirmModal
        open={actionType === 'deactivate'}
        onClose={() => { setActionRow(null); setActionType(null); }}
        onConfirm={handleStatusChange}
        loading={!!actionLoading}
        title="Deactivate account"
        message={`${actionRow?.full_name} will be signed out and won't be able to log in until you reactivate the account. Their order history is kept. This action is logged.`}
        confirmLabel="Deactivate"
        variant="danger"
      />

      <ConfirmModal
        open={actionType === 'reactivate'}
        onClose={() => { setActionRow(null); setActionType(null); }}
        onConfirm={handleStatusChange}
        loading={!!actionLoading}
        title="Reactivate account"
        message={`Restore access for ${actionRow?.full_name}? This action is logged.`}
        confirmLabel="Reactivate"
        variant="gold"
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleteLoading}
        title="Delete account"
        message={`Permanently delete ${deleteTarget?.full_name}? This cannot be undone. Accounts with order or audit history can't be deleted — deactivate them instead. This action is logged.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </>
  );
}