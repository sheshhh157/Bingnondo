import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocketContext, useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import DashboardSwitcher from '../../components/DashboardSwitcher';
import useLiveData from '../../hooks/useLiveData';
import { timeStamp } from '../../utils/format';
import { OPERATIONAL_INITIAL, fetchOperationalSnapshot, OPERATIONAL_EVENTS, stockCounts, queueTone, useNow } from './managerData';
import { DashboardIcon, SalesIcon, KitchenIcon, StocksIcon, DeliveryIcon, MenuIcon } from './managerIcons';
import '../../styles/ManagerLayout.css';
import logo from '../../assets/logo.png';

const STATUS_TOAST = {
  confirmed: { desc: 'Order confirmed', variant: 'default' },
  preparing:  { desc: 'Being prepared',  variant: 'default' },
  completed:  { desc: 'Order completed', variant: 'success' },
  cancelled:  { desc: 'Order cancelled', variant: 'danger'  },
};

const SECTIONS = [
  {
    label: 'Overview',
    links: [
      { to: '/manager/dashboard', label: 'Dashboard',     sub: 'Analytics at a glance',    icon: <DashboardIcon /> },
      { to: '/manager/sales',     label: 'Sales Reports', sub: 'Revenue & transactions',    icon: <SalesIcon /> },
    ],
  },
  {
    label: 'Operational Oversight',
    links: [
      { to: '/manager/oversight/kitchen',  label: 'Kitchen',  sub: 'Counter & online queues', icon: <KitchenIcon /> },
      { to: '/manager/oversight/stocks',   label: 'Stocks',   sub: 'Reorder alerts',           icon: <StocksIcon /> },
      { to: '/manager/oversight/menu',     label: 'Menu',     sub: 'Item availability',        icon: <MenuIcon /> },
      { to: '/manager/oversight/delivery', label: 'Delivery', sub: 'Track progress',           icon: <DeliveryIcon /> },
    ],
  },
];

export default function ManagerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { payload: orderNew }    = useSocketEvent('order:new');
  const { payload: orderReady }  = useSocketEvent('order:ready');
  const { payload: orderStatus } = useSocketEvent('order:status');
  const { connected } = useSocketContext();
  const { toast } = useToast();

  const { data: live, lastUpdated: syncStamp } = useLiveData({
    fetchFn: fetchOperationalSnapshot,
    initial:  OPERATIONAL_INITIAL,
    events:   OPERATIONAL_EVENTS,
    pollMs:   15000,
  });

  const now = useNow();

  const { kitchen = [], stock = [], deliveries = [] } = live;
  const kitchenTone    = queueTone(kitchen, now);
  const stockAlerts    = stockCounts(stock).alerts;
  const outForDelivery = deliveries.filter((d) => d.status === 'out_for_delivery').length;

  const badges = {
    '/manager/oversight/kitchen':  { value: kitchen.length,  tone: kitchenTone, showWhenZero: true  },
    '/manager/oversight/stocks':   { value: stockAlerts,     tone: 'critical',  showWhenZero: false },
    '/manager/oversight/delivery': { value: outForDelivery,  tone: 'default',   showWhenZero: false },
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // ESC to close drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // Live toasts
  useEffect(() => {
    if (!orderNew) return;
    const itemCount = (orderNew.order_items || []).reduce((s, it) => s + (it.quantity || 0), 0);
    toast({ title: `New order #${orderNew.order_number}`, desc: `${itemCount} item${itemCount === 1 ? '' : 's'} · ${orderNew.order_channel === 'mobile_app' ? 'Online' : 'Counter'}` });
  }, [orderNew, toast]);

  useEffect(() => {
    if (!orderReady) return;
    toast({ title: `Order #${orderReady.orderNumber}`, desc: 'Ready for pickup', variant: 'warning' });
  }, [orderReady, toast]);

  useEffect(() => {
    if (!orderStatus) return;
    const meta = STATUS_TOAST[orderStatus.status];
    if (!meta) return;
    toast({ title: `Order #${orderStatus.orderNumber}`, desc: meta.desc, variant: meta.variant });
  }, [orderStatus, toast]);

  return (
    <div className="ml-root">
      <aside className="ml-sidebar" aria-label="Manager sidebar">
        <SidebarInner user={user} badges={badges} onLogout={handleLogout} />
      </aside>

      <aside className="ml-sidebar-compact" aria-label="Manager navigation">
        <div className="ml-compact__brand">
          <img src={logo} alt="Bingnondo logo" width="28" height="28" />
        </div>
        <nav className="ml-compact__nav">
          {SECTIONS.flatMap((s) => s.links).map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) => `ml-compact__link${isActive ? ' ml-compact__link--active' : ''}`}
              aria-label={label}
            >
              {icon}
              {badges[to]?.value > 0 && (
                badges[to].tone === 'critical' ? (
                  <span className="ml-compact__dot" aria-hidden="true" />
                ) : (
                  <span className={`ml-compact__badge${badges[to].tone !== 'default' ? ` ml-compact__badge--${badges[to].tone}` : ''}`} aria-hidden="true">
                    {badges[to].value > 99 ? '99+' : badges[to].value}
                  </span>
                )
              )}
            </NavLink>
          ))}
        </nav>
        <button className="ml-compact__logout" onClick={handleLogout} aria-label="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </aside>

      <header className="ml-topbar" aria-label="Manager top bar">
        <div className="ml-topbar__brand">
          <img src={logo} alt="Bingnondo logo" width="26" height="26" />
          <span className="ml-topbar__name">Bingnondo</span>
        </div>
        <ConnPill connected={connected} />
        {/* Dashboard switcher in mobile topbar */}
        <DashboardSwitcher />
        <button
          className="ml-topbar__menu"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="20" y2="18"/>
          </svg>
        </button>
      </header>

      {drawerOpen && (
        <div className="ml-drawer-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true">
          <div className="ml-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button className="ml-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu" autoFocus>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarInner user={user} badges={badges} onLogout={handleLogout} onNav={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <main className="ml-main" id="main-content">
        <div className="ml-status">
          <span className="ml-status__hint">Live connection</span>
          <span
            className="ml-status__stamp"
            dateTime={syncStamp}
            title={syncStamp ? `Last synced ${new Date(syncStamp).toLocaleString('en-PH')}` : undefined}
          >
            Synced {syncStamp ? timeStamp(syncStamp) : '—'}
          </span>
          <ConnPill connected={connected} />
        </div>
        <Outlet />
      </main>
    </div>
  );
}

function ConnPill({ connected }) {
  return (
    <span className={`ml-conn${connected ? '' : ' ml-conn--off'}`} role="status">
      <span className="ml-conn__dot" aria-hidden="true" />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}

function SidebarInner({ user, badges, onLogout, onNav }) {
  return (
    <>
      <div className="ml-brand">
        <img src={logo} alt="Bingnondo logo" className="ml-brand__logo" width="32" height="32" />
        <div className="ml-brand__text">
          <span className="ml-brand__name">Bingnondo</span>
          <span className="ml-brand__station">Manager Dashboard</span>
        </div>
      </div>

      <nav className="ml-nav" aria-label="Manager navigation">
        {SECTIONS.map((section) => (
          <div key={section.label} className="ml-section">
            <span className="ml-section__label">{section.label}</span>
            <div className="ml-section__links">
              {section.links.map(({ to, label, sub, icon }) => {
                const badge = badges[to];
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onNav}
                    className={({ isActive }) => `ml-nav__link${isActive ? ' ml-nav__link--active' : ''}`}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`ml-nav__icon${isActive ? ' ml-nav__icon--active' : ''}`}>{icon}</span>
                        <span className="ml-nav__labels">
                          <span className="ml-nav__label">{label}</span>
                          <span className="ml-nav__sub">{sub}</span>
                        </span>
                        {badge && (badge.showWhenZero || badge.value > 0) && (
                          <span
                            className={`ml-nav__badge${badge.tone !== 'default' ? ` ml-nav__badge--${badge.tone}` : ''}`}
                            role="status"
                            aria-label={`${label}: ${badge.value}`}
                          >
                            {badge.value}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User + dashboard switcher + logout */}
      <div className="ml-user">
        <div className="ml-user__card">
          <div className="ml-user__avatar" aria-hidden="true">
            {user?.full_name?.[0]?.toUpperCase() || 'M'}
          </div>
          <div className="ml-user__info">
            <span className="ml-user__name">{user?.full_name || 'Manager'}</span>
            <span className="ml-user__role">
              {user?.home_role && user.home_role !== user.role
                ? `Manager (switched)`
                : user?.role || 'manager'}
            </span>
          </div>
        </div>

        {/* Dashboard switcher — only visible if admin granted access to other dashboards */}
        <div style={{ padding: '0 12px 8px' }}>
          <DashboardSwitcher />
        </div>

        <button className="ml-user__logout" onClick={onLogout} aria-label="Sign out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign out
        </button>
      </div>
    </>
  );
}