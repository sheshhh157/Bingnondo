import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../services/api';
import Pagination from '../../components/Pagination';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { useAdminToast } from './useAdminToast';
import { PageHeader } from './adminShared';
import '../../styles/AdminPage.css';

const PAGE_SIZE = 10;
const TYPE_LABELS = {
  menu_item: 'Menu item',
  menu_category: 'Menu category',
  variant_group: 'Variant group',
  staff_account: 'Staff account',
  rider: 'Rider',
  payment_qr_code: 'Payment QR code',
};

function formatDate(value) {
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function daysRemaining(value) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
}

export default function ArchivePage() {
  const { toast } = useAdminToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const debouncedSearch = useDebouncedValue(search);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    try {
      const { data } = await adminAPI.listArchivedRecords({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        type,
      });
      if (currentRequestId !== requestId.current) return;
      setRecords(data.data || []);
      const nextPagination = data.pagination || { page: 1, total: 0, total_pages: 0 };
      setPagination(nextPagination);
      setPage(nextPagination.page);
    } catch (err) {
      if (currentRequestId === requestId.current) {
        toast.error(err.response?.data?.message || 'Failed to load the archive.');
      }
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [debouncedSearch, page, toast, type]);

  // Loading state reflects the archive request and is initialized on mount.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function restore(record) {
    setActionId(record.id);
    try {
      await adminAPI.restoreArchivedRecord(record.id);
      toast.success(`${record.display_name} restored.`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not restore this record.');
    } finally {
      setActionId(null);
    }
  }

  async function deletePermanently(record) {
    if (!window.confirm(`Permanently delete "${record.display_name}"? This cannot be undone.`)) return;
    setActionId(record.id);
    try {
      await adminAPI.deleteArchivedRecord(record.id);
      toast.success(`${record.display_name} permanently deleted.`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not permanently delete this record.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="ap-page ap-page--wide">
      <PageHeader
        title="Archive"
        sub="Deleted records stay here for 30 days. Restore them anytime before they are permanently removed."
      />

      <section className="ap-card" aria-label="Archived records">
        <div className="ap-card__head">
          <div>
            <div className="ap-card__title">Archived records</div>
            <div className="ap-card__sub">{pagination.total} record{pagination.total === 1 ? '' : 's'} available to restore</div>
          </div>
          <button type="button" className="ap-btn ap-btn--ghost ap-btn--md" onClick={load} disabled={loading || actionId != null}>
            Refresh
          </button>
        </div>

        <div className="ap-toolbar ap-archive-toolbar">
          <label className="ap-archive-search">
            <span className="ap-archive-filter-label">Search records</span>
            <input
              type="search"
              className="ap-input"
              placeholder="Name, type, record ID, or archived by"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="ap-archive-type">
            <span className="ap-archive-filter-label">Record type</span>
            <select
              className="ap-select"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All types</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="ap-empty" role="status"><p>Loading archive…</p></div>
        ) : pagination.total === 0 ? (
          <div className="ap-empty">
            <p className="ap-empty__title">{search || type !== 'all' ? 'No matching records' : 'Archive is empty'}</p>
            <p>{search || type !== 'all' ? 'Try changing your search or record type filter.' : 'No deleted records are waiting to be restored.'}</p>
          </div>
        ) : (
          <>
            <div className="ap-table-wrap">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Type</th>
                    <th>Archived</th>
                    <th>Time left</th>
                    <th className="ap-table__th--right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.display_name}</strong>
                        <div className="ap-archive-id">Record #{record.entity_id}</div>
                      </td>
                      <td>{TYPE_LABELS[record.entity_type] || record.entity_type}</td>
                      <td>{formatDate(record.archived_at)}</td>
                      <td>{daysRemaining(record.expires_at)} day{daysRemaining(record.expires_at) === 1 ? '' : 's'}</td>
                      <td className="ap-archive-actions">
                        <button
                          type="button"
                          className="ap-btn ap-btn--primary ap-btn--sm"
                          onClick={() => restore(record)}
                          disabled={actionId != null}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="ap-btn ap-btn--danger ap-btn--sm"
                          onClick={() => deletePermanently(record)}
                          disabled={actionId != null}
                        >
                          Delete permanently
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.total_pages}
              total={pagination.total}
              from={(pagination.page - 1) * pagination.limit + 1}
              to={Math.min(pagination.page * pagination.limit, pagination.total)}
              onPage={setPage}
              label="Archive pagination"
            />
          </>
        )}
      </section>
    </div>
  );
}
