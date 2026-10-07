import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../styles/RiderLayout.css';
import riderCat from '../../assets/rider_cat.png';

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function IconDelivery({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
      <rect x="9" y="11" width="14" height="10" rx="1"/>
      <circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
    </svg>
  );
}
function IconHistory({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}
function IconProfile({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}
function IconLogout({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
function IconMotorbike({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5.5" cy="17.5" r="3.5"/>
      <circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M15 6H9l-3 6 3 3h9l-3-6z"/>
      <path d="M9 6l1.5-4h5L17 6"/>
    </svg>
  );
}

const NAV_ITEMS = [
  { to: '/rider/active',  label: 'Active',  Icon: IconDelivery },
  { to: '/rider/history', label: 'History', Icon: IconHistory  },
  { to: '/rider/profile', label: 'Profile', Icon: IconProfile  },
];

export default function RiderLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initial = user?.full_name?.charAt(0)?.toUpperCase() || 'R';

  return (
    <div className="rl-root">

      {/* ── Mobile top bar (<768px) ─────────────────────────────── */}
      <header className="rl-top-bar" aria-label="Rider top bar">
        <div className="rl-top-bar__brand">
          <img src={riderCat} alt="" className="rl-top-bar__cat-icon" aria-hidden="true" />
          <div className="rl-top-bar__brand-text">
            <span className="rl-top-bar__brand-name">Bingnondo</span>
            <span className="rl-top-bar__brand-sub">Rider</span>
          </div>
        </div>
        <div className="rl-top-bar__rider">
          <div className="rl-top-bar__avatar" aria-label={`Logged in as ${user?.full_name || 'Rider'}`}>
            {initial}
          </div>
        </div>
      </header>

      {/* ── Sidebar (768px+) ────────────────────────────────────── */}
      <aside className="rl-sidebar" aria-label="Rider navigation">
        <div className="rl-sidebar__brand">
          <img src={riderCat} alt="" className="rl-sidebar__cat-icon" aria-hidden="true" />
          <div className="rl-sidebar__brand-text">
            <span className="rl-sidebar__brand-name">Bingnondo</span>
            <span className="rl-sidebar__brand-role">Rider</span>
          </div>
        </div>

        <div className="rl-sidebar__rider-card">
          <div className="rl-sidebar__avatar" aria-hidden="true">{initial}</div>
          <div className="rl-sidebar__rider-info">
            <span className="rl-sidebar__rider-name">{user?.full_name || 'Rider'}</span>
            <span className="rl-sidebar__rider-status">
              <span className="rl-status-dot" aria-hidden="true" />
              On duty
            </span>
          </div>
        </div>

        <nav className="rl-sidebar__nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `rl-sidebar__link${isActive ? ' rl-sidebar__link--active' : ''}`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button className="rl-sidebar__logout" onClick={handleLogout} aria-label="Sign out">
          <IconLogout size={16} />
          <span>Sign out</span>
        </button>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="rl-main" id="main-content">
        <Outlet />
      </main>

      {/* ── Bottom nav (<768px) ─────────────────────────────────── */}
      <nav className="rl-bottom-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `rl-bottom-nav__item${isActive ? ' rl-bottom-nav__item--active' : ''}`
            }
          >
            <Icon size={22} />
            <span className="rl-bottom-nav__label">{label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  );
}