import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useAuth } from '../../context/AuthContext';
import CashierPage from './CashierPage';
import InventoryPage from '../shared/InventoryPage';
import StaffProfile from '../shared/StaffProfile';
import SupportChatPage from './SupportChatPage';
import logo from '../../assets/logo.png';
import CashierHeader from './components/CashierHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import { NAV_GROUPS } from './cashierNav';
import { ordersAPI } from '../../services/cashierApi';
import { supportChatAPI } from '../../services/api';
import { connectSocket } from '../../services/socket';
import '../../styles/CashierLayout.css';

// Cashier destinations rendered inside CashierPage (shared red header + tabs).
// Everything else (Inventory, Support Chat) is a staff page rendered here.
const CASHIER_VIEW_IDS = ['order', 'online'];

// ─── Staff page content ───────────────────────────────────────────────────────
function StaffPageContent({ pageId }) {
  switch (pageId) {
    case 'inventory': return <InventoryPage />;
    case 'chat':      return <SupportChatPage />;
    case 'profile':   return <StaffProfile />;
    default:          return null;
  }
}

// ─── Page title map for the staff sub-header bar ──────────────────────────────
const PAGE_META = {
  inventory: { title: 'Inventory',    sub: 'Track stock & reorder thresholds' },
  chat:      { title: 'Support Chat', sub: 'Customer conversations' },
  profile:   { title: 'My Profile', sub: 'Your account information' },
};

// ─── Main layout ──────────────────────────────────────────────────────────────
// ─── Sidebar nav list ─────────────────────────────────────────────────────────
function SidebarNavList({ items, sidebarOpen, view, onNav, indicators }) {
  return items.map(({ id, label, sub, icon }) => {
    const count = indicators[id] || 0;
    const badge = count > 9 ? '9+' : count;
    const attentionLabel = id === 'chat' ? 'unread messages' : 'orders need attention';
    const accessibleLabel = count ? `${label}, ${count} ${attentionLabel}` : label;

    return (
      <button
        key={id}
        title={!sidebarOpen ? accessibleLabel : undefined}
        className={`cl-nav__link${view === id ? ' cl-nav__link--active' : ''}${!sidebarOpen ? ' cl-nav__link--collapsed' : ''}`}
        onClick={() => onNav(id)}
        aria-current={view === id ? 'page' : undefined}
        aria-label={!sidebarOpen ? accessibleLabel : undefined}
      >
        <span className={`cl-nav__icon${view === id ? ' cl-nav__icon--active' : ''}`}>{icon}</span>
        {sidebarOpen && (
          <span className="cl-nav__labels">
            <span className="cl-nav__label">{label}</span>
            <span className="cl-nav__sub">{sub}</span>
          </span>
        )}
        {count > 0 && (
          <span className="cl-nav__badge" aria-label={`${count} ${attentionLabel}`}>
            {badge}
          </span>
        )}
        {sidebarOpen && view === id && <span className="cl-nav__pip" aria-hidden="true" />}
      </button>
    );
  });
}

// ─── Sidebar content (desktop only) ───────────────────────────────────────────
function SidebarContent({ sidebarOpen, view, onNav, user, onLogout, indicators }) {
  return (
    <>
      {/* Brand */}
      <div className="cl-brand">
        <img src={logo} alt="Bingnondo logo" className="cl-brand__logo" width="32" height="32" />
        <div className={`cl-brand__text${sidebarOpen ? '' : ' cl-brand__text--hidden'}`}>
          <span className="cl-brand__name">Bingnondo</span>
          <span className="cl-brand__station">Cashier Station</span>
        </div>
      </div>

      {/*       Nav groups */}
      <nav className="cl-nav" aria-label="Cashier navigation">
        {NAV_GROUPS.map((group, i) => (
          <Fragment key={group.label}>
            {sidebarOpen
              ? <span className={`cl-nav__group-label${i > 0 ? ' cl-nav__group-label--spaced' : ''}`}>{group.label}</span>
              : i > 0 && <div className="cl-nav__divider" aria-hidden="true" />}
            <SidebarNavList items={group.items} sidebarOpen={sidebarOpen} view={view} onNav={onNav} indicators={indicators} />
          </Fragment>
        ))}
      </nav>

      {/* User + logout */}
      <div className="cl-user">
        <div className={`cl-user__card${!sidebarOpen ? ' cl-user__card--collapsed' : ''}`}>
          <div className="cl-user__avatar" aria-hidden="true">
            {user?.profile_image_url
              ? <img src={user.profile_image_url} alt="" />
              : user?.full_name?.[0]?.toUpperCase() || 'C'}
          </div>
          {sidebarOpen && (
            <div className="cl-user__info">
              <span className="cl-user__name">{user?.full_name || 'Cashier'}</span>
              <span className="cl-user__role">Cashier</span>
            </div>
          )}
        </div>
        <button
          className={`cl-user__logout${!sidebarOpen ? ' cl-user__logout--collapsed' : ''}`}
          onClick={onLogout}
          aria-label="Sign out"
          title={!sidebarOpen ? 'Sign out' : undefined}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          {sidebarOpen && <span>Sign out</span>}
        </button>
      </div>
    </>
  );
}

export default function CashierLayout() {
  const { user, logout } = useAuth();
  const [view,        setView]        = useState('order');  // order | history | online | inventory | chat
  const [indicators, setIndicators] = useState({ online: 0, chat: 0 });
  const seenStorageKey = `bingnondo_cashier_seen_${user?.id ?? 'staff'}`;
  const seenEventsRef = useRef(new Set());
  const indicatorEventsRef = useRef({ online: [], chat: [] });
  const viewRef = useRef(view);
  // Start collapsed on tablets/small laptops so the content area gets the
  // room it needs; the header toggle can still expand it.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1024
  );

  // Keep the sidebar in sync when the window crosses the desktop breakpoint.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setSidebarOpen(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Mobile nav drawer.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);

  // Sign-out confirmation.
  const [logoutOpen, setLogoutOpen] = useState(false);
  const confirmLogout = () => { setLogoutOpen(false); logout(); };

  // The drawer is a phone affordance: close it if the viewport grows past 768.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const close = () => { if (mq.matches) setDrawerOpen(false); };
    mq.addEventListener('change', close);
    return () => mq.removeEventListener('change', close);
  }, []);

  // Drawer dialog behaviour: Escape to close, focus trap while open, restore
  // focus to the opener on close, and lock page scroll underneath.
  useEffect(() => {
    if (!drawerOpen) return;
    const dialog = drawerRef.current;
    const previouslyFocused = document.activeElement;

    const focusables = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          )
        : [];

    const first = focusables()[0];
    if (first) first.focus();
    else if (dialog) dialog.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { setDrawerOpen(false); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) { e.preventDefault(); return; }
      const firstEl = f[0];
      const lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    };
  }, [drawerOpen]);

  const isCashierView = CASHIER_VIEW_IDS.includes(view);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const rememberSeenEvents = useCallback((events) => {
    let changed = false;
    for (const event of events) {
      if (!seenEventsRef.current.has(event.key)) {
        seenEventsRef.current.add(event.key);
        changed = true;
      }
    }
    if (changed) {
      while (seenEventsRef.current.size > 500) {
        seenEventsRef.current.delete(seenEventsRef.current.values().next().value);
      }
      try {
        window.localStorage.setItem(seenStorageKey, JSON.stringify([...seenEventsRef.current]));
      } catch (err) {
        console.error('[cashier.sidebarIndicators] could not save viewed items:', err);
      }
    }
  }, [seenStorageKey]);

  const handleNav = (id) => {
    if (id === 'online' || id === 'chat') {
      rememberSeenEvents(indicatorEventsRef.current[id]);
      setIndicators((current) => ({ ...current, [id]: 0 }));
    }
    setView(id);
    setDrawerOpen(false);
  };
  const toggleSidebar = () => setSidebarOpen((v) => !v);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(seenStorageKey) || '[]');
      seenEventsRef.current = new Set(Array.isArray(saved) ? saved : []);
    } catch (err) {
      console.error('[cashier.sidebarIndicators] could not restore viewed items:', err);
      seenEventsRef.current = new Set();
    }
  }, [seenStorageKey]);

  const refreshIndicators = useCallback(async () => {
    const [ordersResult, threadsResult] = await Promise.allSettled([
      ordersAPI.getOnline({ limit: 200 }),
      supportChatAPI.getThreads(),
    ]);

    if (ordersResult.status === 'fulfilled') {
      const orders = ordersResult.value.data?.orders || [];
      const onlineEvents = orders.flatMap((order) => {
        if (['completed', 'cancelled'].includes(order.status)) return [];
        const events = [];
        if (order.status === 'pending') {
          events.push({ key: `online:new:${order.id}:${order.created_at}` });
        }
        if (order.status === 'ready') {
          events.push({ key: `online:ready:${order.id}:${order.updated_at || order.created_at}` });
        }
        if (order.payment_method === 'gcash'
          && ['pending', 'awaiting_verification'].includes(order.payment_status)) {
          events.push({
            key: `online:verify:${order.id}:${order.resubmitted_at || order.receipt_uploaded_at || order.created_at}`,
          });
        }
        return events;
      });
      indicatorEventsRef.current.online = onlineEvents;
      if (viewRef.current === 'online') rememberSeenEvents(onlineEvents);
      const unseen = onlineEvents.filter((event) => !seenEventsRef.current.has(event.key)).length;
      setIndicators((current) => ({ ...current, online: unseen }));
    } else {
      console.error('[cashier.sidebarIndicators] online orders:', ordersResult.reason);
    }

    if (threadsResult.status === 'fulfilled') {
      const data = threadsResult.value.data;
      const threads = data.data || data.threads || data;
      const chatEvents = Array.isArray(threads)
        ? threads
          .filter((thread) => Number(thread.unread_count) > 0 && thread.last_message_sender === 'customer')
          .map((thread) => ({
            key: `chat:${thread.chat_id ?? thread.id}:${thread.last_message_at}`,
          }))
        : [];
      indicatorEventsRef.current.chat = chatEvents;
      if (viewRef.current === 'chat') rememberSeenEvents(chatEvents);
      const unreadMessages = chatEvents.filter((event) => !seenEventsRef.current.has(event.key)).length;
      setIndicators((current) => ({ ...current, chat: unreadMessages }));
    } else {
      console.error('[cashier.sidebarIndicators] support chat:', threadsResult.reason);
    }
  }, [rememberSeenEvents]);

  useEffect(() => {
    let active = true;
    let refreshPending = false;
    const refresh = async () => {
      if (!active || refreshPending) return;
      refreshPending = true;
      try {
        await refreshIndicators();
      } finally {
        refreshPending = false;
      }
    };

    const socket = connectSocket('staff');
    const joinStaffRoom = () => socket.emit('join', { room: 'staff' });
    socket.on('connect', joinStaffRoom);
    const refreshOnEvent = () => { refresh(); };
    const events = [
      'online_order:new',
      'order:status',
      'payment:pending',
      'payment:verified',
      'payment:rejected',
      'payment:resubmitted',
      'support_chat:message',
    ];
    events.forEach((event) => socket.on(event, refreshOnEvent));

    refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
      socket.off('connect', joinStaffRoom);
      events.forEach((event) => socket.off(event, refreshOnEvent));
    };
  }, [refreshIndicators]);

  return (
    <div className={`cl-root${sidebarOpen ? '' : ' cl-root--collapsed'}`}>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className={`cl-sidebar${sidebarOpen ? '' : ' cl-sidebar--collapsed'}`}>
        <SidebarContent
          sidebarOpen={sidebarOpen}
          view={view}
          onNav={handleNav}
          user={user}
          onLogout={() => setLogoutOpen(true)}
          indicators={indicators}
        />
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="cl-main" id="main-content">
        {isCashierView ? (
          <CashierPage
            view={view}
            onToggleSidebar={toggleSidebar}
            sidebarOpen={sidebarOpen}
            onOpenDrawer={() => setDrawerOpen(true)}
            drawerOpen={drawerOpen}
          />
        ) : (
          <div className="cl-staff-wrapper">
            <CashierHeader
              view={view}
              title={PAGE_META[view]?.title}
              onToggleSidebar={toggleSidebar}
              sidebarOpen={sidebarOpen}
              onOpenDrawer={() => setDrawerOpen(true)}
              drawerOpen={drawerOpen}
            />
            <div className="cl-staff-body" key={view}>
              <StaffPageContent pageId={view} />
            </div>
          </div>
        )}
      </main>

      {/* ── Mobile nav drawer ────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="cl-drawer-overlay" onClick={() => setDrawerOpen(false)} role="presentation">
          <div
            className="cl-drawer"
            id="cashier-drawer"
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="cl-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarContent
              sidebarOpen
              view={view}
              onNav={handleNav}
              user={user}
              onLogout={() => setLogoutOpen(true)}
              indicators={indicators}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={logoutOpen}
        title="Sign out?"
        message="You'll be returned to the login screen. Any unsaved changes will be lost."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        tone="danger"
        onConfirm={confirmLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}
