import { useAuth } from '../../../context/AuthContext';

export default function KitchenHeader({ counterCount, onlineCount }) {
  const { user, logout } = useAuth();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <header className="kp-header" role="banner">
      {/* Brand */}
      <div className="kp-header__brand">
        <svg className="kp-header__logo" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="Bingnondo Kitchen">
          <rect width="32" height="32" rx="7" fill="var(--color-primary)"/>
          <path d="M8 9h10a5 5 0 013.5 1.5 4 4 0 010 6A5 5 0 0118 22H8V9z" fill="#FDF6EC" fillRule="evenodd" clipRule="evenodd"/>
          <path d="M8 15.5h10" stroke="var(--color-primary)" strokeWidth="2"/>
        </svg>
        <div className="kp-header__brand-text">
          <span className="kp-header__name">Bingnondo</span>
          <span className="kp-header__role">
            <span className="kp-header__role-dot" aria-hidden="true" />
            Kitchen Display
          </span>
        </div>
      </div>

      {/* Live queue summary */}
      <div className="kp-header__summary" role="status" aria-live="polite" aria-label="Order queue summary">
        <div className="kp-summary-chip kp-summary-chip--counter">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="1" y="4" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M3 4V3.5a3 3 0 016 0V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Counter
          <span className="kp-summary-chip__count">{counterCount}</span>
        </div>
        <div className="kp-header__summary-div" aria-hidden="true" />
        <div className="kp-summary-chip kp-summary-chip--online">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <ellipse cx="6" cy="6" rx="2" ry="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M1.5 6h9M2 4h8M2 8h8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          Online
          <span className="kp-summary-chip__count">{onlineCount}</span>
        </div>
      </div>

      {/* Clock + user */}
      <div className="kp-header__right">
        <div className="kp-header__clock" aria-label={`Time: ${timeStr}`}>
          <span className="kp-header__time">{timeStr}</span>
          <span className="kp-header__date">{dateStr}</span>
        </div>
        <div className="kp-header__user">
          <span className="kp-header__username">
            {user?.full_name || user?.name || 'Kitchen'}
          </span>
          <button
            className="kp-header__logout"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M5.5 2H3a1 1 0 00-1 1v9a1 1 0 001 1h2.5M9.5 10.5L12.5 7.5 9.5 4.5M12.5 7.5H5.5"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}