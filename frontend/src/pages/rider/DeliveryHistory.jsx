import { useState, useEffect, useCallback } from 'react';
import { getDeliveryHistory } from '../../services/riderApi';
import '../../styles/DeliveryHistory.css';

function IconCalendar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function HistoryCard({ delivery }) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };
  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const formatCurrency = (n) =>
    `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  return (
    <li className="dh-card">
      <button
        className="dh-card__trigger"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`dh-detail-${delivery.id}`}
      >
        <div className="dh-card__main">
          <div className="dh-card__left">
            <span className="dh-card__order-num">{delivery.order_number}</span>
            <div className="dh-card__meta">
              <span className="dh-card__date">
                <IconCalendar />
                {formatDate(delivery.delivered_at)} · {formatTime(delivery.delivered_at)}
              </span>
            </div>
          </div>
          <div className="dh-card__right">
            <span className="dh-card__total">{formatCurrency(delivery.total_amount)}</span>
            <span className="dh-card__chevron" aria-hidden="true"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>

        <div className="dh-card__address">
          <IconPin />
          <span>{delivery.delivery_address}</span>
        </div>
      </button>

      {expanded && (
        <div id={`dh-detail-${delivery.id}`} className="dh-card__detail">
          <p className="dh-card__customer">{delivery.customer_name}</p>
          <ul className="dh-card__items" aria-label="Order items">
            {(delivery.items || []).map((item, i) => (
              <li key={i} className="dh-card__item">
                <span className="dh-card__item-qty">{item.quantity}×</span>
                <span className="dh-card__item-name">{item.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default function DeliveryHistory() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [page, setPage]             = useState(1);
  const [pagination, setPagination] = useState(null);

  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await getDeliveryHistory({ page: p, limit: 15 });
      if (p === 1) {
        setDeliveries(res.deliveries || []);
      } else {
        setDeliveries((prev) => [...prev, ...(res.deliveries || [])]);
      }
      setPagination(res.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(1); }, [fetchHistory]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchHistory(next);
  };

  const hasMore = pagination && page < pagination.total_pages;

  return (
    <div className="dh-root">
      <header className="dh-header">
        <h1 className="dh-header__title">Delivery History</h1>
        <p className="dh-header__sub">
          {pagination?.total !== undefined
            ? `${pagination.total} completed deliveries`
            : 'Your completed deliveries'}
        </p>
      </header>

      {error && (
        <div className="dh-alert" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {loading && deliveries.length === 0 ? (
        <div className="dh-loading" role="status" aria-live="polite">
          <div className="dh-skeleton" /><div className="dh-skeleton" /><div className="dh-skeleton" />
        </div>
      ) : deliveries.length === 0 ? (
        <div className="dh-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <p className="dh-empty__title">No deliveries yet</p>
          <p className="dh-empty__sub">Completed deliveries will show up here.</p>
        </div>
      ) : (
        <>
          <ul className="dh-list" aria-label="Delivery history">
            {deliveries.map((d) => (
              <HistoryCard key={d.id} delivery={d} />
            ))}
          </ul>

          {hasMore && (
            <button
              className="dh-load-more"
              onClick={loadMore}
              disabled={loading}
              aria-busy={loading}
            >
              {loading
                ? <span className="dh-spinner" aria-label="Loading more" />
                : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}