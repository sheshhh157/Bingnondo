import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import CashierPage from './CashierPage';
import PaymentVerificationPage from '../staff/PaymentVerificationPage';
import InventoryPage from '../staff/InventoryPage';
import MenuPage from '../staff/MenuPage';
import SupportChatPage from '../staff/SupportChatPage';
import logo from '../../assets/logo.png';
import '../../styles/CashierLayout.css';

// ─── Nav config ───────────────────────────────────────────────────────────────
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

// ─── Hamburger icon (3 lines) ─────────────────────────────────────────────────
function HamburgerIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6"  x2="20" y2="6"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="18" x2="20" y2="18"/>
    </svg>
  );
}

// ─── Chevron left / right for collapse button ─────────────────────────────────
function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {open
        ? <><polyline points="15 18 9 12 15 6"/></>   /* chevron left = close */
        : <><polyline points="9 18 15 12 9 6"/></>    /* chevron right = open  */
      }
    </svg>
  );
}

// ─── Staff page content ───────────────────────────────────────────────────────
function StaffPageContent({ pageId, onSetHeaderActions }) {
  switch (pageId) {
    case 'payments':  return <PaymentVerificationPage onSetHeaderActions={onSetHeaderActions} />;
    case 'inventory': return <InventoryPage onSetHeaderActions={onSetHeaderActions} />;
    case 'menu':      return <MenuPage onSetHeaderActions={onSetHeaderActions} />;
    case 'chat':      return <SupportChatPage onSetHeaderActions={onSetHeaderActions} />;
    default:          return null;
  }
}

// ─── Page title map for the staff sub-header bar ──────────────────────────────
const PAGE_META = {
  payments:  { title: 'Payment Verification', sub: 'Review GCash receipts before orders reach the kitchen' },
  inventory: { title: 'Inventory',            sub: 'Track ingredient stock and reorder thresholds' },
  menu:      { title: 'Menu Management',      sub: 'Add, edit, and manage item availability in real time' },
  chat:      { title: 'Support Chat',         sub: 'Customer conversations' },
};

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function CashierLayout() {
  const { user, logout } = useAuth();
  const [activePage,     setActivePage]     = useState('cashier');
  const [sidebarOpen,    setSidebarOpen]    = useState(true);
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [headerActions,  setHeaderActions]  = useState(null);

  const allNav = [...CASHIER_NAV, ...STAFF_NAV];

  const handleNav = useCallback((id) => {
    setActivePage(id);
    setDrawerOpen(false);
    setHeaderActions(null); // clear actions when switching pages
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen(v => !v), []);

  // ── Sidebar content (shared between full sidebar + mobile drawer) ────────
  const SidebarInner = ({ onNav }) => (
    <>
      {/* Brand row */}
      <div className="cl-brand">
        <img src={logo} alt="Bingnondo logo" className="cl-brand__logo" width="32" height="32" />
        <div className={`cl-brand__text${sidebarOpen ? '' : ' cl-brand__text--hidden'}`}>
          <span className="cl-brand__name">Bingnondo</span>
          <span className="cl-brand__station">Cashier Station</span>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="cl-nav" aria-label="Cashier navigation">
        {sidebarOpen && <span className="cl-nav__group-label">Cashier</span>}
        {CASHIER_NAV.map(({ id, label, sub, icon }) => (
          <button
            key={id}
            title={!sidebarOpen ? label : undefined}
            className={`cl-nav__link${activePage === id ? ' cl-nav__link--active' : ''}${!sidebarOpen ? ' cl-nav__link--collapsed' : ''}`}
            onClick={() => { handleNav(id); onNav?.(); }}
            aria-current={activePage === id ? 'page' : undefined}
            aria-label={!sidebarOpen ? label : undefined}
          >
            <span className={`cl-nav__icon${activePage === id ? ' cl-nav__icon--active' : ''}`}>{icon}</span>
            {sidebarOpen && (
              <span className="cl-nav__labels">
                <span className="cl-nav__label">{label}</span>
                <span className="cl-nav__sub">{sub}</span>
              </span>
            )}
            {sidebarOpen && activePage === id && <span className="cl-nav__pip" aria-hidden="true" />}
          </button>
        ))}

        {sidebarOpen && <span className="cl-nav__group-label cl-nav__group-label--spaced">Staff Portal</span>}
        {!sidebarOpen && <div className="cl-nav__divider" aria-hidden="true" />}
        {STAFF_NAV.map(({ id, label, sub, icon }) => (
          <button
            key={id}
            title={!sidebarOpen ? label : undefined}
            className={`cl-nav__link${activePage === id ? ' cl-nav__link--active' : ''}${!sidebarOpen ? ' cl-nav__link--collapsed' : ''}`}
            onClick={() => { handleNav(id); onNav?.(); }}
            aria-current={activePage === id ? 'page' : undefined}
            aria-label={!sidebarOpen ? label : undefined}
          >
            <span className={`cl-nav__icon${activePage === id ? ' cl-nav__icon--active' : ''}`}>{icon}</span>
            {sidebarOpen && (
              <span className="cl-nav__labels">
                <span className="cl-nav__label">{label}</span>
                <span className="cl-nav__sub">{sub}</span>
              </span>
            )}
            {sidebarOpen && activePage === id && <span className="cl-nav__pip" aria-hidden="true" />}
          </button>
        ))}
      </nav>

      {/* User + logout */}
      <div className="cl-user">
        <div className={`cl-user__card${!sidebarOpen ? ' cl-user__card--collapsed' : ''}`}>
          <div className="cl-user__avatar" aria-hidden="true">
            {user?.full_name?.[0]?.toUpperCase() || 'C'}
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
          onClick={logout}
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

  // ── Staff sub-header bar (injected above each staff page) ─────────────────
  const StaffHeader = ({ pageId }) => {
    const meta = PAGE_META[pageId] || {};
    return (
      <header className="cl-staff-header">
        <button
          className="cl-staff-header__toggle"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
          aria-expanded={sidebarOpen}
        >
          <HamburgerIcon size={18} />
        </button>
        <div className="cl-staff-header__title-group">
          <h1 className="cl-staff-header__title">{meta.title}</h1>
          <span className="cl-staff-header__sub">{meta.sub}</span>
        </div>
        {/* Actions injected by each page */}
        {headerActions && (
          <div className="cl-staff-header__actions">
            {headerActions}
          </div>
        )}
      </header>
    );
  };

  return (
    <div className={`cl-root${sidebarOpen ? '' : ' cl-root--collapsed'}`}>

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`cl-sidebar${sidebarOpen ? '' : ' cl-sidebar--collapsed'}`}
        aria-label="Cashier sidebar"
      >
        {/* Collapse/expand toggle — bottom of sidebar, always visible */}
        <button
          className="cl-sidebar__toggle"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
        >
          <ChevronIcon open={sidebarOpen} />
          {sidebarOpen && <span>Collapse</span>}
        </button>

        <SidebarInner />
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <header className="cl-topbar" aria-label="Cashier top bar">
        <div className="cl-topbar__brand">
          <img src={logo} alt="Bingnondo logo" width="26" height="26" />
          <span className="cl-topbar__name">Bingnondo</span>
        </div>
        <button
          className="cl-topbar__menu"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
        >
          <HamburgerIcon size={20} />
        </button>
      </header>

      {/* ── Mobile drawer ───────────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="cl-drawer-overlay"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        >
          <div
            className="cl-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <button
              className="cl-drawer__close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6"  x2="6"  y2="18"/>
                <line x1="6"  y1="6"  x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarInner onNav={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="cl-main" id="main-content">
        {activePage === 'cashier' ? (
          // Cashier page passes toggle down into its own header
          <CashierPage onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
        ) : (
          <div className="cl-staff-wrapper">
            {/* Injected header with hamburger for all staff pages */}
            <StaffHeader pageId={activePage} />
            <div className="cl-staff-body">
              <StaffPageContent pageId={activePage} onSetHeaderActions={setHeaderActions} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}