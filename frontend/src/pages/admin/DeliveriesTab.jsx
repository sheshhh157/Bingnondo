import { useState, useEffect, useCallback } from 'react';
import { adminDeliveriesAPI } from '../../services/api';
import { Spinner, Btn, PageHeader, Pagination, Modal } from './adminShared';
import FilterModal, { FilterTrigger, FilterInline } from '../../components/MobileFilter';
import { getSocket } from '../../services/socket';
import { currency } from '../../utils/format';
import '../../styles/AdminPage.css';
import '../../styles/RidersPage.css';

// ── constants ─────────────────────────────────────────────────────────────────
const DELIVERY_STATUS = {
  pending_assignment: { label: 'Pending',          cls: 'rd-del-badge--pending'   },
  assigned:           { label: 'Assigned',         cls: 'rd-del-badge--assigned'  },
  out_for_delivery:   { label: 'Out for delivery', cls: 'rd-del-badge--ofd'       },
  delivered:          { label: 'Delivered',        cls: 'rd-del-badge--delivered' },
  cancelled:          { label: 'Cancelled',        cls: 'rd-del-badge--cancelled' },
};

const STATUS_TABS = [
  { value: 'all',                label: 'All'        },
  { value: 'pending_assignment', label: 'Pending'    },
  { value: 'assigned',           label: 'Assigned'   },
  { value: 'out_for_delivery',   label: 'In transit' },
  { value: 'delivered',          label: 'Delivered'  },
  { value: 'cancelled',          label: 'Cancelled'  },
];

const PREFERENCE_LABEL = {
  own_delivery: 'Own delivery',
  lalamove:     'Lalamove',
};

function fmtWhen(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

function DeliveryStatusBadge({ status }) {
  const s = DELIVERY_STATUS[status] || { label: status || 'Unknown', cls: 'rd-del-badge--pending' };
  return <span className={`rd-del-badge ${s.cls}`}>{s.label}</span>;
}

// ── Delivery detail modal ─────────────────────────────────────────────────────
function DeliveryDetailModal({ row, onClose }) {
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  const itemsTotal = items.reduce((sum, it) => sum + (Number(it.unit_price) * Number(it.quantity)), 0);

  return (
    <Modal open onClose={onClose} title={`Delivery #${row.order_number}`} width={560}>
      <div className="rd-del-detail">
        <div className="rd-del-detail__row">
          <span className="rd-del-detail__key">Status</span>
          <DeliveryStatusBadge status={row.status} />
        </div>
        <div className="rd-del-detail__row">
          <span className="rd-del-detail__key">Customer</span>
          <span className="rd-del-detail__val">{row.customer_name || '—'}{row.customer_contact ? ` · ${row.customer_contact}` : ''}</span>
        </div>
        <div className="rd-del-detail__row">
          <span className="rd-del-detail__key">Address</span>
          <span className="rd-del-detail__val">{row.customer_address || '—'}</span>
        </div>
        <div className="rd-del-detail__row">
          <span className="rd-del-detail__key">Rider</span>
          <span className="rd-del-detail__val">
            {row.rider_name || 'Unassigned'}
            {row.rider_contact && row.rider_name ? ` · ${row.rider_contact}` : ''}
            {row.rider_plate_number ? ` · ${row.rider_plate_number}` : ''}
          </span>
        </div>
        <div className="rd-del-detail__row">
          <span className="rd-del-detail__key">Preference</span>
          <span className="rd-del-detail__val">{PREFERENCE_LABEL[row.delivery_preference] || row.delivery_preference || '—'}</span>
        </div>

        <div className="rd-del-detail__section-label">Items</div>
        {items.length === 0 ? (
          <div className="rd-del-detail__muted">No item details.</div>
        ) : (
          <ul className="rd-del-detail__items">
            {items.map(it => (
              <li key={it.id}>
                <span className="rd-del-detail__item-qty">{it.quantity}×</span>
                <span className="rd-del-detail__item-name">
                  {it.name}
                  {it.notes ? <em className="rd-del-detail__item-note"> — {it.notes}</em> : null}
                </span>
                <span className="rd-del-detail__item-price">{currency(Number(it.unit_price) * Number(it.quantity))}</span>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="rd-del-detail__total">
            <span>Total</span>
            <span>{currency(row.total_amount ?? itemsTotal)}</span>
          </div>
        )}

        <div className="rd-del-detail__timeline">
          <div className="rd-del-detail__tl-row"><span className="rd-del-detail__key">Placed</span><span className="rd-del-detail__val">{fmtWhen(row.created_at)}</span></div>
          <div className="rd-del-detail__tl-row"><span className="rd-del-detail__key">Assigned</span><span className="rd-del-detail__val">{fmtWhen(row.assigned_at)}</span></div>
          <div className="rd-del-detail__tl-row"><span className="rd-del-detail__key">Delivered</span><span className="rd-del-detail__val">{fmtWhen(row.delivered_at)}</span></div>
        </div>

        <div className="ap-divider" />
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Deliveries Tab ─────────────────────────────────────────────────────────────
export default function DeliveriesTab() {
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({});
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const [search,   setSearch]   = useState('');
  const [statusF,  setStatusF]  = useState('all');
  const [page,     setPage]     = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detail,   setDetail]   = useState(null);
  const LIMIT = 15;

  const load = useCallback(() => {
    return adminDeliveriesAPI
      .getAll({ page, limit: LIMIT, search: search || undefined, status: statusF })
      .then(res => {
        setRows(res.data || []);
        setCounts(res.counts || {});
        setTotal(res.total || 0);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, search, statusF]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (val) => { setLoading(true); setSearch(val); setPage(1); };
  const handleStatus = (val) => { setLoading(true); setStatusF(val); setPage(1); };
  const handlePage   = (p)   => { setLoading(true); setPage(p); };
  const refresh      = () => { setLoading(true); load(); };

  // Live refresh when a rider advances a delivery
  useEffect(() => {
    let socket;
    try { socket = getSocket(); } catch { return undefined; }
    if (!socket) return undefined;
    const onUpdate = () => { load(); };
    socket.on('delivery:update', onUpdate);
    return () => { socket.off('delivery:update', onUpdate); };
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const isEmpty = !loading && !error && rows.length === 0;

  const filterFields = (
    <div className="rd-filter-pills" role="group" aria-label="Filter by delivery status">
      {STATUS_TABS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`rd-filter-pill${statusF === value ? ' rd-filter-pill--active' : ''}`}
          onClick={() => handleStatus(value)}
          aria-pressed={statusF === value}
        >
          {label}
          {value !== 'all' && counts[value] ? ` (${counts[value]})` : ''}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="rd-tabhead">
        <PageHeader
          title="Deliveries"
          chip={`${allCount} ${allCount === 1 ? 'delivery' : 'deliveries'}`}
          sub="Track rider deliveries from assignment to drop-off."
          action={
            <Btn
              variant="ghost"
              onClick={refresh}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>}
            >
              Refresh
            </Btn>
          }
        />
      </div>

      <div className="ap-card rd-main-card">
        <div className="ap-card__head">
          <div className="ap-toolbar" style={{ width: '100%' }}>
            <div className="ap-toolbar__filters">
              <div style={{ flex: 1, minWidth: 0, maxWidth: 340 }}>
                <input
                  type="search"
                  className="ap-input"
                  placeholder="Search order, customer, rider…"
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  aria-label="Search deliveries"
                />
              </div>
              <FilterTrigger open={filterOpen} onClick={() => setFilterOpen(true)} active={statusF !== 'all'} label="Filter deliveries by status" />
              <FilterInline>{filterFields}</FilterInline>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="ap-loading"><Spinner size={24} /></div>
        ) : error ? (
          <div className="ap-empty">
            <div className="ap-empty__title">Couldn't load deliveries.</div>
            <Btn variant="primary" size="sm" onClick={refresh} style={{ marginTop: 12 }}>Try again</Btn>
          </div>
        ) : isEmpty ? (
          <div className="ap-empty">
            <div className="ap-empty__title">{search || statusF !== 'all' ? 'No deliveries match your filter.' : 'No deliveries yet.'}</div>
            <div className="ap-empty__sub">{!search && statusF === 'all' && 'Deliveries appear here once orders are placed and assigned.'}</div>
          </div>
        ) : (
          <div className="rd-del-list">
            {rows.map(row => (
              <button
                key={row.id}
                type="button"
                className="rd-del-card"
                onClick={() => setDetail(row)}
              >
                <div className="rd-del-card__top">
                  <div className="rd-del-card__order">
                    <span className="rd-del-card__num">#{row.order_number}</span>
                    <span className="rd-del-card__customer">{row.customer_name || '—'}</span>
                  </div>
                  <DeliveryStatusBadge status={row.status} />
                </div>

                <div className="rd-del-card__grid">
                  <div className="rd-del-card__meta">
                    <span className="rd-del-card__key">Rider</span>
                    <span className="rd-del-card__val">
                      {row.rider_name || <span className="rd-del-card__muted">Unassigned</span>}
                      {row.rider_contact && row.rider_name ? ` · ${row.rider_contact}` : ''}
                    </span>
                  </div>
                  <div className="rd-del-card__meta">
                    <span className="rd-del-card__key">Address</span>
                    <span className="rd-del-card__val rd-del-card__val--truncate" title={row.customer_address || undefined}>
                      {row.customer_address || '—'}
                    </span>
                  </div>
                  <div className="rd-del-card__meta">
                    <span className="rd-del-card__key">Total</span>
                    <span className="rd-del-card__val">{currency(row.total_amount)}</span>
                  </div>
                  <div className="rd-del-card__meta">
                    <span className="rd-del-card__key">Placed</span>
                    <span className="rd-del-card__val">{fmtWhen(row.created_at)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && !error && !isEmpty && (
          <div className="ap-table-foot">
            <span className="ap-table-foot__info">
              Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total} deliver{total !== 1 ? 'ies' : 'y'}
            </span>
            <Pagination page={page} total={totalPages} onPage={handlePage} label="Deliveries pagination" />
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <DeliveryDetailModal row={detail} onClose={() => setDetail(null)} />
      )}

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter deliveries">
        {filterFields}
      </FilterModal>
    </>
  );
}
