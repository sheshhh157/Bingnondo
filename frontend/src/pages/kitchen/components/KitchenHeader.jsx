import { useAuth } from '../../../context/AuthContext';

export default function KitchenHeader({ counts, filter, onFilterChange }) {
  const { user, logout } = useAuth();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <header className="kp-header" role="banner">
      <div className="kp-header__brand">
        <div className="kp-header__seal" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 4h7a4 4 0 013 1.5 3 3 0 010 5A4 4 0 0112 16H5V4z" fill="#FDF6EC" fillRule="evenodd" clipRule="evenodd"/>
            <path d="M5 10h7" stroke="#B91C1C" strokeWidth="1.5"/>
          </svg>
        </div>
        <div className="kp-header__brand-text">
          <span className="kp-header__name">Bingnondo</span>
          <span className="kp-header__role">Kitchen</span>
        </div>
      </div>

      <nav className="kp-header__nav" role="navigation" aria-label="Order filter">
        {[
          { key: 'all',       label: 'All',       count: counts.all },
          { key: 'confirmed', label: 'Incoming',  count: counts.confirmed },
          { key: 'preparing', label: 'Preparing', count: counts.preparing },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            className={`kp-tab ${filter === key ? 'kp-tab--active' : ''}`}
            onClick={() => onFilterChange(key)}
            aria-pressed={filter === key}
          >
            {label}
            {count > 0 && <span className="kp-tab__badge" aria-hidden="true">{count}</span>}
          </button>
        ))}
      </nav>

      <div className="kp-header__right">
        <div className="kp-header__clock" aria-label={`${timeStr}, ${dateStr}`}>
          <span className="kp-header__time">{timeStr}</span>
          <span className="kp-header__date">{dateStr}</span>
        </div>
        <div className="kp-header__user">
          <span className="kp-header__username">{user?.full_name || user?.name || 'Kitchen'}</span>
          <button
            className="kp-header__logout"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M5.5 2H3a1 1 0 00-1 1v9a1 1 0 001 1h2.5M9.5 10.5L12.5 7.5 9.5 4.5M12.5 7.5H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}