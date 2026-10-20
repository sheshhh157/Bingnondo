import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import useLiveData from '../../hooks/useLiveData';
import { Spinner } from './adminShared';
import { timeAgo } from './format';

const CATEGORY_ICONS = {
  orders: (
    <>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
    </>
  ),
  payments: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
    </>
  ),
  deliveries: (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </>
  ),
  inventory: (
    <>
      <polyline points="21 8 21 21 3 21 3 8"/>
      <rect x="1" y="3" width="22" height="5"/>
      <line x1="10" y1="12" x2="14" y2="12"/>
    </>
  ),
  kitchen: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  ),
  customers: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </>
  ),
  system: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
};

const REFETCH_EVENTS = [
  'order:new',
  'order:status',
  'payment:pending',
  'payment:verified',
  'payment:rejected',
  'inventory:low_stock',
  'kitchen_alert',
  'delivery:update',
];

const INITIAL = { items: [], unread: 0, lastSeenAt: null };

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const rootRef = useRef(null);

  const { data, loading, error, refresh, setData } = useLiveData({
    fetchFn: async () => {
      const res = await adminAPI.getNotifications({ limit: 30 });
      const payload = res.data || {};
      return {
        items: Array.isArray(payload.data) ? payload.data : [],
        unread: payload.unread || 0,
        lastSeenAt: payload.lastSeenAt || null,
      };
    },
    refetchEvents: REFETCH_EVENTS,
    initial: INITIAL,
    pollMs: 60000,
  });

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;
  const lastSeenAt = data?.lastSeenAt ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) refresh(true);
  }

  async function markAllRead() {
    if (marking) return;
    setMarking(true);
    try {
      const res = await adminAPI.markNotificationsSeen();
      const seenAt = res?.data?.data?.lastSeenAt ?? new Date().toISOString();
      setData((prev) => ({ ...(prev || INITIAL), unread: 0, lastSeenAt: seenAt }));
    } catch {
      // Badge reconciles with the server on the next poll.
    } finally {
      setMarking(false);
    }
  }

  const isUnread = (item) => !lastSeenAt || new Date(item.at) > new Date(lastSeenAt);

  return (
    <div className="nb-root" ref={rootRef}>
      <button
        type="button"
        className={`nb-btn${open ? ' nb-btn--open' : ''}`}
        onClick={toggleOpen}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="nb-badge" aria-hidden="true">{unread >= 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notifications">
          <div className="nb-panel__head">
            <span className="nb-panel__title">Notifications</span>
            {unread > 0 && (
              <button type="button" className="nb-mark" onClick={markAllRead} disabled={marking}>
                {marking ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="nb-list">
            {loading && items.length === 0 ? (
              <div className="nb-empty"><Spinner size={18}/></div>
            ) : items.length === 0 ? (
              <div className="nb-empty">
                {error ? "Couldn't load notifications." : "You're all caught up."}
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nb-item${isUnread(item) ? ' nb-item--unread' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    if (item.link) navigate(item.link);
                  }}
                >
                  <span className={`nb-item__icon nb-item__icon--${item.category}`} aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {CATEGORY_ICONS[item.category] || CATEGORY_ICONS.system}
                    </svg>
                  </span>
                  <span className="nb-item__text">
                    <span className="nb-item__title">{item.title}</span>
                    {item.body && <span className="nb-item__body">{item.body}</span>}
                    <span className="nb-item__time">{timeAgo(item.at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="nb-panel__foot">
            <Link className="nb-manage" to="/admin/settings" onClick={() => setOpen(false)}>
              Manage notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
