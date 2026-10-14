import { NAV_ITEMS } from '../cashierNav';
import '../../../styles/CashierBottomNav.css';

// Phone-only bottom navigation. Rendered from the shared NAV_ITEMS list so it
// always matches the sidebar. Hidden by CSS at >=768px (sidebar takes over).
export default function CashierBottomNav({ view, onNav, draftCount = 0 }) {
  return (
    <nav className="cashier-bottomnav" aria-label="Cashier navigation">
      {NAV_ITEMS.map(({ id, label, icon }) => {
        const active = view === id;
        const showBadge = id === 'order' && draftCount > 0 && !active;
        return (
          <button
            key={id}
            type="button"
            className={`cashier-bottomnav__item${active ? ' cashier-bottomnav__item--active' : ''}`}
            onClick={() => onNav(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={showBadge ? `${label} (${draftCount} in progress)` : label}
          >
            <span className="cashier-bottomnav__icon" aria-hidden="true">
              {icon}
              {showBadge && <span className="cashier-bottomnav__badge">{draftCount}</span>}
            </span>
            <span className="cashier-bottomnav__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
