import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './StaffLayout.css';
import logo from '../../assets/logo.png';

const NAV = [
  {
    to: '/staff/inventory',
    label: 'Inventory',
    sub: 'Stock levels',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="17"/>
        <line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
      </svg>
    ),
  },
  {
    to: '/staff/menu',
    label: 'Menu',
    sub: 'Items & availability',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
        <path d="M7 2v20"/>
        <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
      </svg>
    ),
  },
  {
    to: '/staff/delivery',
    label: 'Delivery',
    sub: 'Assign & track',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
        <rect width="13" height="8" x="9" y="11" rx="1"/>
        <circle cx="11" cy="19" r="2"/>
        <circle cx="19" cy="19" r="2"/>
      </svg>
    ),
  },
  {
    to: '/staff/chat',
    label: 'Support Chat',
    sub: 'Customer messages',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
];

export default function StaffLayout() {
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
      <div className="sl-brand">
        <img src={logo} alt="Bingnondo logo" className="sl-brand__logo" width="32" height="32" />
        <div className="sl-brand__text">
          <span className="sl-brand__name">Bingnondo</span>
          <span className="sl-brand__station">Staff Portal</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="sl-nav" aria-label="Staff navigation">
        {NAV.map(({ to, label, sub, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNav}
            className={({ isActive }) =>
              `sl-nav__link${isActive ? ' sl-nav__link--active' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`sl-nav__icon${isActive ? ' sl-nav__icon--active' : ''}`}>{icon}</span>
                <span className="sl-nav__labels">
                  <span className="sl-nav__label">{label}</span>
                  <span className="sl-nav__sub">{sub}</span>
                </span>
                {isActive && <span className="sl-nav__pip" aria-hidden="true" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="sl-user">
        <div className="sl-user__card">
          <div className="sl-user__avatar" aria-hidden="true">
            {user?.full_name?.[0]?.toUpperCase() || 'S'}
          </div>
          <div className="sl-user__info">
            <span className="sl-user__name">{user?.full_name || 'Staff'}</span>
            <span className="sl-user__role">{user?.role || 'staff'}</span>
          </div>
        </div>
        <button className="sl-user__logout" onClick={handleLogout} aria-label="Sign out">
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
    <div className="sl-root">
      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside className="sl-sidebar" aria-label="Staff sidebar">
        <SidebarInner />
      </aside>

      {/* ── Tablet icon strip ─────────────────────────── */}
      <aside className="sl-sidebar-compact" aria-label="Staff navigation">
        <div className="sl-compact__brand">
          <img src={logo} alt="Bingnondo logo" width="28" height="28" />
        </div>
        <nav className="sl-compact__nav">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `sl-compact__link${isActive ? ' sl-compact__link--active' : ''}`
              }
              aria-label={label}
            >
              {icon}
            </NavLink>
          ))}
        </nav>
        <button className="sl-compact__logout" onClick={handleLogout} aria-label="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </aside>

      {/* ── Mobile top bar ────────────────────────────── */}
      <header className="sl-topbar" aria-label="Staff top bar">
        <div className="sl-topbar__brand">
          <img src={logo} alt="Bingnondo logo" width="26" height="26" />
          <span className="sl-topbar__name">Bingnondo</span>
        </div>
        <button
          className="sl-topbar__menu"
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

      {/* ── Mobile drawer ─────────────────────────────── */}
      {drawerOpen && (
        <div className="sl-drawer-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true">
          <div className="sl-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button className="sl-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarInner onNav={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────── */}
      <main className="sl-main" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}