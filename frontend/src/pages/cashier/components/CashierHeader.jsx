import { VIEWS } from '../CashierPage';
import './CashierHeader.css';

export default function CashierHeader({ user, view, onViewChange, onLogout, draftCount }) {
  return (
    <header className="c-header">
      {/* Left: wordmark */}
      <div className="c-header__brand">
        <svg className="c-header__mark" width="28" height="28" viewBox="0 0 56 56" fill="none" aria-hidden="true">
          <rect width="56" height="56" rx="14" fill="#DC2626"/>
          <path d="M14 20C14 17.8 15.8 16 18 16H26C29.3 16 32 18.7 32 22C32 23.5 31.4 24.9 30.4 25.9C32.5 26.9 34 29.1 34 31.6C34 35.1 31.1 38 27.6 38H18C15.8 38 14 36.2 14 34V20Z" fill="white"/>
          <circle cx="38" cy="22" r="6" fill="white" fillOpacity="0.35"/>
          <path d="M20 24H25C26.7 24 28 22.7 28 21C28 19.3 26.7 18 25 18H20V24Z" fill="#DC2626"/>
          <path d="M20 32H27C28.7 32 30 30.7 30 29C30 27.3 28.7 26 27 26H20V32Z" fill="#DC2626"/>
        </svg>
        <div className="c-header__titles">
          <span className="c-header__cafe">Bingnondo</span>
          <span className="c-header__role">Cashier Station</span>
        </div>
      </div>

      {/* Center: view tabs */}
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
            <line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
          My Transactions
        </button>
      </nav>

      {/* Right: user info + logout */}
      <div className="c-header__user">
        <div className="c-header__avatar" aria-hidden="true">
          {user?.full_name?.[0]?.toUpperCase() || 'C'}
        </div>
        <div className="c-header__user-info">
          <span className="c-header__user-name">{user?.full_name || 'Cashier'}</span>
          <span className="c-header__user-role">Cashier</span>
        </div>
        <button
          className="c-header__logout"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </header>
  );
}