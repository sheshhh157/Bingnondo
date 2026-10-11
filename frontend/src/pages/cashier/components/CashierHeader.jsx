import { VIEWS } from '../CashierPage';
import '../../../styles/CashierHeader.css';

// Hamburger icon — same as in CashierLayout, kept inline so no circular dep
function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6"  x2="20" y2="6"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="18" x2="20" y2="18"/>
    </svg>
  );
}

// Brand & user are now in CashierLayout sidebar.
// This header holds: [hamburger] [tabs] so the toggle is always accessible
// regardless of which view (Counter Order / Transactions) is active.
export default function CashierHeader({ view, onViewChange, draftCount, onToggleSidebar, sidebarOpen }) {
  return (
    <header className="c-header">
      {/* Sidebar toggle — hamburger, desktop only (hidden on mobile, topbar handles it) */}
      <button
        className="c-header__sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={sidebarOpen}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <HamburgerIcon />
      </button>

      {/* View tabs */}
      <nav className="c-header__nav" aria-label="Cashier views">
        <button
          className={`c-header__tab${view === VIEWS.ORDER ? ' c-header__tab--active' : ''}`}
          onClick={() => onViewChange(VIEWS.ORDER)}
          aria-current={view === VIEWS.ORDER ? 'page' : undefined}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          Counter Order
          {draftCount > 0 && view !== VIEWS.ORDER && (
            <span className="c-header__badge">{draftCount}</span>
          )}
        </button>
        <button
          className={`c-header__tab${view === VIEWS.HISTORY ? ' c-header__tab--active' : ''}`}
          onClick={() => onViewChange(VIEWS.HISTORY)}
          aria-current={view === VIEWS.HISTORY ? 'page' : undefined}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="10" y1="9"  x2="8" y2="9"/>
          </svg>
          My Transactions
        </button>
      </nav>
    </header>
  );
}