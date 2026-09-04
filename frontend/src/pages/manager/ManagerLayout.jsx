import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocketEvent } from '../../context/SocketContext';
import ToastContainer from '../../components/Toast';
import '../../styles/ManagerLayout.css';
import logo from '../../assets/logo.png';

const SECTIONS = [
  {
    label: 'Overview',
    links: [
      { to: '/manager/dashboard', label: 'Dashboard', sub: 'Analytics at a glance', icon: <DashboardIcon /> },
      { to: '/manager/sales', label: 'Sales Reports', sub: 'Revenue & transactions', icon: <SalesIcon /> },
    ],
  },
  {
    label: 'Operational Oversight',
    links: [
      { to: '/manager/oversight', label: 'Oversight', sub: 'Live operation hub', icon: <EyeIcon /> },
      { to: '/manager/oversight/kitchen', label: 'Kitchen', sub: 'Read-only view', icon: <KitchenIcon /> },
      { to: '/manager/oversight/stocks', label: 'Stocks', sub: 'Read-only stock', icon: <StocksIcon /> },
      { to: '/manager/oversight/delivery', label: 'Delivery', sub: 'Track progress', icon: <DeliveryIcon /> },
    ],
  },
];

export default function ManagerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { payload: orderNew } = useSocketEvent('order:new');
  const [toasts, setToasts] = useState([]);

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

  // Live toast on new order
  useEffect(() => {
    if (orderNew) {
      const p = orderNew;
      const itemCount = (p.order_items || []).reduce((s, it) => s + (it.quantity || 0), 0);
      const id = `order-${p.id}-${Date.now()}`;
      setToasts((prev) => [...prev, {
        id,
        title: `New order #${p.order_number}`,
        desc: `${itemCount} item${itemCount === 1 ? '' : 's'} · ${p.order_channel === 'mobile_app' ? 'Online' : 'Counter'}`,
      }]);
    }
  }, [orderNew]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const SidebarInner = ({ onNav }) => (
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
              {section.links.map(({ to, label, sub, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onNav}
                  className={({ isActive }) =>
                    `ml-nav__link${isActive ? ' ml-nav__link--active' : ''}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`ml-nav__icon${isActive ? ' ml-nav__icon--active' : ''}`}>{icon}</span>
                      <span className="ml-nav__labels">
                        <span className="ml-nav__label">{label}</span>
                        <span className="ml-nav__sub">{sub}</span>
                      </span>
                      {isActive && <span className="ml-nav__pip" aria-hidden="true" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="ml-user">
        <div className="ml-readonly-note">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Read-only view
        </div>
        <div className="ml-user__card">
          <div className="ml-user__avatar" aria-hidden="true">
            {user?.full_name?.[0]?.toUpperCase() || 'M'}
          </div>
          <div className="ml-user__info">
            <span className="ml-user__name">{user?.full_name || 'Manager'}</span>
            <span className="ml-user__role">{user?.role || 'manager'}</span>
          </div>
        </div>
        <button className="ml-user__logout" onClick={handleLogout} aria-label="Sign out">
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

  return (
    <div className="ml-root">
      <aside className="ml-sidebar" aria-label="Manager sidebar">
        <SidebarInner />
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
              className={({ isActive }) =>
                `ml-compact__link${isActive ? ' ml-compact__link--active' : ''}`
              }
              aria-label={label}
            >
              {icon}
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
            <button className="ml-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarInner onNav={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <main className="ml-main" id="main-content">
        <Outlet />
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1"/>
      <rect x="14" y="3" width="7" height="5" rx="1"/>
      <rect x="14" y="12" width="7" height="9" rx="1"/>
      <rect x="3" y="16" width="7" height="5" rx="1"/>
    </svg>
  );
}
function SalesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18"/>
      <path d="M7 14l4-4 3 3 5-6"/>
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function KitchenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
      <path d="M7 2v20"/>
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
    </svg>
  );
}
function StocksIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  );
}
function DeliveryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
      <rect width="13" height="8" x="9" y="11" rx="1"/>
      <circle cx="11" cy="19" r="2"/>
      <circle cx="19" cy="19" r="2"/>
    </svg>
  );
}
