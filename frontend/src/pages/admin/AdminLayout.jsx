import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/logo.png';
import '../../styles/AdminLayout.css';

const NAV = [
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
  {
    to: '/admin/restrictions',
    label: 'Customer Restrictions',
    sub: 'Violations & overrides',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const SidebarInner = ({ onNav }) => (
    <>
      {/* Brand */}
      <div className="al-brand">
        <img src={logo} alt="Bingnondo logo" className="al-brand__logo" width="32" height="32" />
        <div className="al-brand__text">
          <span className="al-brand__name">Bingnondo</span>
          <span className="al-brand__station">Admin Console</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="al-nav" aria-label="Admin navigation">
        {NAV.map(({ to, label, sub, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNav}
            className={({ isActive }) =>
              `al-nav__link${isActive ? ' al-nav__link--active' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`al-nav__icon${isActive ? ' al-nav__icon--active' : ''}`}>{icon}</span>
                <span className="al-nav__labels">
                  <span className="al-nav__label">{label}</span>
                  <span className="al-nav__sub">{sub}</span>
                </span>
                {isActive && <span className="al-nav__pip" aria-hidden="true" />}
              </>
            )}
          </NavLink>
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
            <span className="al-user__role">Root Access</span>
          </div>
        </div>
        <button className="al-user__logout" onClick={handleLogout} aria-label="Sign out">
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
    <div className="al-root">
      {/* Desktop sidebar */}
      <aside className="al-sidebar" aria-label="Admin sidebar">
        <SidebarInner />
      </aside>

      {/* Tablet icon strip */}
      <aside className="al-sidebar-compact" aria-label="Admin navigation">
        <div className="al-compact__brand">
          <img src={logo} alt="Bingnondo logo" width="28" height="28" />
        </div>
        <nav className="al-compact__nav">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `al-compact__link${isActive ? ' al-compact__link--active' : ''}`
              }
              aria-label={label}
            >
              {icon}
            </NavLink>
          ))}
        </nav>
        <button className="al-compact__logout" onClick={handleLogout} aria-label="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="al-topbar" aria-label="Admin top bar">
        <div className="al-topbar__brand">
          <img src={logo} alt="Bingnondo logo" width="26" height="26" />
          <span className="al-topbar__name">Bingnondo</span>
        </div>
        <button
          className="al-topbar__menu"
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

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="al-drawer-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true">
          <div className="al-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button className="al-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarInner onNav={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="al-main" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}