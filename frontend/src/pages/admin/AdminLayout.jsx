import { Fragment, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardIcon, SalesIcon, KitchenIcon, StocksIcon, MenuIcon } from './oversightIcons';
import ConfirmDialog from '../../components/ConfirmDialog';
import logo from '../../assets/logo.png';
import '../../styles/AdminLayout.css';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      {
        to: '/admin/overview',
        label: 'Overview',
        sub: 'Admin home',
        icon: <DashboardIcon />,
      },
      {
        to: '/admin/sales',
        label: 'Sales Reports',
        sub: 'Revenue & transactions',
        icon: <SalesIcon />,
      },
      {
        to: '/admin/oversight/kitchen',
        label: 'Kitchen Queue',
        sub: 'Counter & online queues',
        icon: <KitchenIcon />,
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        to: '/admin/accounts',
        label: 'Staff Accounts',
        sub: 'Manage access',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ),
      },
      {
        to: '/admin/riders',
        label: 'Riders',
        sub: 'Manage rider accounts',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4l3 3"/>
          </svg>
        ),
      },
      {
        to: '/admin/restrictions',
        label: 'User Accounts',
        sub: 'Accounts, violations & overrides',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Store setup',
    items: [
      {
        to: '/admin/menu',
        label: 'Menu Management',
        sub: 'Items, categories & availability',
        icon: <MenuIcon />,
      },
      {
        to: '/admin/inventory',
        label: 'Inventory',
        sub: 'Ingredients & stock levels',
        icon: <StocksIcon />,
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        to: '/admin/settings',
        label: 'System Settings',
        sub: 'Devices & config',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        ),
      },
      {
        to: '/admin/audit',
        label: 'Audit Log',
        sub: 'Action history',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        ),
      },
    ],
  },
];

function NavItem({ item, onNav }) {
  return (
    <NavLink
      to={item.to}
      onClick={onNav}
      className={({ isActive }) =>
        `al-nav__link${item.manager ? ' al-nav__link--manager' : ''}${isActive ? ' al-nav__link--active' : ''}`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`al-nav__icon${isActive ? ' al-nav__icon--active' : ''}`}>{item.icon}</span>
          <span className="al-nav__labels">
            <span className="al-nav__label">{item.label}</span>
            {item.sub && <span className="al-nav__sub">{item.sub}</span>}
          </span>
        </>
      )}
    </NavLink>
  );
}

function CompactNavLink({ item }) {
  return (
    <NavLink
      to={item.to}
      title={item.title}
      aria-label={item.aria}
      className={({ isActive }) =>
        `al-compact__link al-compact__link--manager${isActive ? ' al-compact__link--active' : ''}`
      }
    >
      {item.icon}
    </NavLink>
  );
}

function SidebarInner({ user, onLogout, onNav }) {
  return (
    <>
      {/* Brand */}
      <div className="al-brand">
        <img src={logo} alt="Bingnondo logo" className="al-brand__logo" width="32" height="32" />
        <div className="al-brand__text">
          <span className="al-brand__name">Bingnondo</span>
          <span className="al-brand__station">Admin Console</span>
        </div>
      </div>

      {/* Admin Nav */}
      <nav className="al-nav" aria-label="Admin navigation">
        {NAV_GROUPS.map(group => (
          <Fragment key={group.label}>
            <span className="al-nav__section-label">{group.label}</span>
            {group.items.map(item => (
              <NavItem key={item.to} item={item} onNav={onNav} />
            ))}
          </Fragment>
        ))}
      </nav>

      {/* User + logout */}
      <div className="al-user">
        <div className="al-user__card">
          <div className="al-user__avatar" aria-hidden="true">
            {user?.full_name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="al-user__info">
            <span className="al-user__name">{user?.full_name || 'Admin'}</span>
            <span className="al-user__role">Administrator</span>
          </div>
        </div>
        <button className="al-user__logout" onClick={onLogout} aria-label="Sign out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>Sign out</span>
        </button>
      </div>
    </>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const drawerRef = useRef(null);

  // Mobile drawer dialog behaviour: Escape to close, focus trap while open,
  // restore focus to the opener on close, and lock page scroll underneath.
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

  const handleLogout = () => setLogoutOpen(true);
  const confirmLogout = () => {
    setLogoutOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div className="al-root">
      <a className="al-skip" href="#main-content">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="al-sidebar" aria-label="Admin sidebar">
        <SidebarInner
          user={user}
          onLogout={handleLogout}
          onNav={undefined}
        />
      </aside>

      {/* Tablet icon strip */}
      <aside className="al-sidebar-compact" aria-label="Admin navigation">
        <div className="al-compact__brand">
          <img src={logo} alt="Bingnondo logo" width="28" height="28" />
        </div>
        <nav className="al-compact__nav">
          {NAV_GROUPS.map(group => (
            <Fragment key={group.label}>
              {group !== NAV_GROUPS[0] && <div className="al-compact__divider" aria-hidden="true" />}
              <div className="al-compact__group">
                {group.items.map(item => (
                  <CompactNavLink key={item.to} item={{ ...item, title: item.label, aria: item.label }} />
                ))}
              </div>
            </Fragment>
          ))}
        </nav>
        <button className="al-compact__logout" onClick={handleLogout} aria-label="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="al-drawer-overlay" onClick={() => setDrawerOpen(false)} role="presentation">
          <div className="al-drawer" ref={drawerRef} tabIndex={-1} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button className="al-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarInner user={user} onLogout={handleLogout} onNav={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={`al-main${drawerOpen ? ' al-main--locked' : ''}`} id="main-content">
        {/* Mobile top bar — sticky inside the scroll container so it never overlaps content */}
        <header className="al-header" aria-label="Admin top bar">
          <div className="al-header__brand">
            <span className="al-header__logo-dot" aria-hidden="true">B</span>
            <span className="al-header__name">Bingnondo</span>
          </div>
          <button
            type="button"
            className="al-header__menu"
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
        <div className="al-content" key={location.pathname}>
          <Outlet />
        </div>
      </main>

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