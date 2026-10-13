import { VIEWS } from '../constants';
import '../../../styles/CashierHeader.css';

// ─── Icons ────────────────────────────────────────────────────────────────────
const ICON_COLLAPSE = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="6"  x2="20" y2="6"/>
    <line x1="4" y1="12" x2="20" y2="12"/>
    <line x1="4" y1="18" x2="20" y2="18"/>
  </svg>
);

const ICON_MENU = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="6"  x2="20" y2="6"/>
    <line x1="4" y1="12" x2="20" y2="12"/>
    <line x1="4" y1="18" x2="20" y2="18"/>
  </svg>
);

const TITLES = {
  [VIEWS.ORDER]:  'Counter Orders',
  [VIEWS.ONLINE]: 'Online Orders',
};

// ─── Header ───────────────────────────────────────────────────────────────────
export default function CashierHeader({ view, title, onToggleSidebar, sidebarOpen, onOpenDrawer, drawerOpen }) {
  const pageTitle = title || TITLES[view] || 'Counter Order';

  return (
    <header className="c-header">
      {/* Bar: menu (mobile) / collapse (desktop) + brand + current section */}
      <div className="c-header__top">
        <button
          className="c-header__icon-btn c-header__sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
        >
          {ICON_COLLAPSE}
        </button>

        <button
          className="c-header__icon-btn c-header__menu-btn"
          onClick={onOpenDrawer}
          aria-label="Open navigation menu"
          aria-controls="cashier-drawer"
          aria-expanded={drawerOpen}
        >
          {ICON_MENU}
        </button>

        <div className="c-header__brand">
          <span className="c-header__logo-dot" aria-hidden="true">B</span>
          <span className="c-header__brand-name">Bingnondo</span>
        </div>

        <span className="c-header__page-title">{pageTitle}</span>
      </div>
    </header>
  );
}
