import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import CashierPage from './CashierPage';
import PaymentVerificationPage from '../staff/PaymentVerificationPage';
import InventoryPage from '../staff/InventoryPage';
import MenuPage from '../staff/MenuPage';
import SupportChatPage from '../staff/SupportChatPage';
import logo from '../../assets/logo.png';
import '../../styles/CashierLayout.css';

// ─── Sidebar nav items ────────────────────────────────────────────────────────
const CASHIER_NAV = [
  {
    id: 'cashier',
    label: 'Cashier',
    sub: 'Counter orders',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
    ),
  },
];

const STAFF_NAV = [
  {
    id: 'payments',
    label: 'Payments',
    sub: 'Verify GCash receipts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'inventory',
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
    id: 'menu',
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
    id: 'chat',
    label: 'Support Chat',
    sub: 'Customer messages',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
];

// ─── Staff page renderer (pure component swap, no routing) ────────────────────
function StaffPageContent({ pageId }) {
  switch (pageId) {
    case 'payments':  return <PaymentVerificationPage />;
    case 'inventory': return <InventoryPage />;
    case 'menu':      return <MenuPage />;
    case 'chat':      return <SupportChatPage />;
    default:          return null;
  }
}

export default function CashierLayout() {
  const { user, logout } = useAuth();
  const [activePage, setActivePage] = useState('cashier');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleNav = (id) => {
    setActivePage(id);
    setDrawerOpen(false);
  };

  // ── Shared sidebar inner ──────────────────────────────────────────────────
  const SidebarInner = ({ onNav }) => (
    <>
      {/* Brand */}
      <div className="cl-brand">
        <img src={logo} alt="Bingnondo logo" className="cl-brand__logo" width="32" height="32" />
        <div className="cl-brand__text">
          <span className="cl-brand__name">Bingnondo</span>
          <span className="cl-brand__station">Cashier Station</span>
        </div>
      </div>

      {/* Cashier nav group */}
      <nav className="cl-nav" aria-label="Cashier navigation">
        <span className="cl-nav__group-label">Cashier</span>
        {CASHIER_NAV.map(({ id, label, sub, icon }) => (
          <button
            key={id}
            className={`cl-nav__link${activePage === id ? ' cl-nav__link--active' : ''}`}
            onClick={() => { handleNav(id); onNav?.(); }}
            aria-current={activePage === id ? 'page' : undefined}
          >
            <span className={`cl-nav__icon${activePage === id ? ' cl-nav__icon--active' : ''}`}>{icon}</span>
            <span className="cl-nav__labels">
              <span className="cl-nav__label">{label}</span>
              <span className="cl-nav__sub">{sub}</span>
            </span>
            {activePage === id && <span className="cl-nav__pip" aria-hidden="true" />}
          </button>
        ))}

        {/* Divider */}
        <span className="cl-nav__group-label cl-nav__group-label--spaced">Staff Portal</span>
        {STAFF_NAV.map(({ id, label, sub, icon }) => (
          <button
            key={id}
            className={`cl-nav__link${activePage === id ? ' cl-nav__link--active' : ''}`}
            onClick={() => { handleNav(id); onNav?.(); }}
            aria-current={activePage === id ? 'page' : undefined}
          >
            <span className={`cl-nav__icon${activePage === id ? ' cl-nav__icon--active' : ''}`}>{icon}</span>
            <span className="cl-nav__labels">
              <span className="cl-nav__label">{label}</span>
              <span className="cl-nav__sub">{sub}</span>
            </span>
            {activePage === id && <span className="cl-nav__pip" aria-hidden="true" />}
          </button>
        ))}
      </nav>

      {/* User + logout */}
      <div className="cl-user">
        <div className="cl-user__card">
          <div className="cl-user__avatar" aria-hidden="true">
            {user?.full_name?.[0]?.toUpperCase() || 'C'}
          </div>
          <div className="cl-user__info">
            <span className="cl-user__name">{user?.full_name || 'Cashier'}</span>
            <span className="cl-user__role">Cashier</span>
          </div>
        </div>
        <button className="cl-user__logout" onClick={logout} aria-label="Sign out">
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

  // ── Compact sidebar (tablet) icons only ──────────────────────────────────
  const allNav = [...CASHIER_NAV, ...STAFF_NAV];

  return (
    <div className="cl-root">
      {/* ── Desktop sidebar (≥1024px) ──────────────────────── */}
      <aside className="cl-sidebar" aria-label="Cashier sidebar">
        <SidebarInner />
      </aside>

      {/* ── Tablet icon strip (768–1023px) ─────────────────── */}
      <aside className="cl-sidebar-compact" aria-label="Cashier navigation">
        <div className="cl-compact__brand">
          <img src={logo} alt="Bingnondo logo" width="28" height="28" />
        </div>
        <nav className="cl-compact__nav">
          {allNav.map(({ id, label, icon }) => (
            <button
              key={id}
              title={label}
              className={`cl-compact__link${activePage === id ? ' cl-compact__link--active' : ''}`}
              onClick={() => handleNav(id)}
              aria-label={label}
              aria-current={activePage === id ? 'page' : undefined}
            >
              {icon}
            </button>
          ))}
        </nav>
        <button className="cl-compact__logout" onClick={logout} aria-label="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </aside>

      {/* ── Mobile top bar (<768px) ─────────────────────────── */}
      <header className="cl-topbar" aria-label="Cashier top bar">
        <div className="cl-topbar__brand">
          <img src={logo} alt="Bingnondo logo" width="26" height="26" />
          <span className="cl-topbar__name">Bingnondo</span>
        </div>
        <button
          className="cl-topbar__menu"
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

      {/* ── Mobile drawer ───────────────────────────────────── */}
      {drawerOpen && (
        <div className="cl-drawer-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true">
          <div className="cl-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button className="cl-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarInner onNav={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="cl-main" id="main-content">
        {activePage === 'cashier' ? (
          <CashierPage />
        ) : (
          <div className="cl-staff-wrapper">
            <StaffPageContent pageId={activePage} />
          </div>
        )}
      </main>
    </div>
  );
}