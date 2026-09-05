import '../../../styles/MenuGrid.css';

export default function MenuGrid({ items, loading, error, onAdd, onRetry, draft }) {
  if (loading) return <MenuSkeleton />;

  if (error) {
    return (
      <div className="menu-state menu-state--error">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>{error}</p>
        <button className="menu-retry-btn" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="menu-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
        </svg>
        <p>Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div className="menu-grid" role="list" aria-label="Menu items">
      {items.map((item) => (
        <MenuCard key={item.id} item={item} onAdd={onAdd} draft={draft} />
      ))}
    </div>
  );
}

function MenuCard({ item, onAdd, draft }) {
  const inCart = draft.find((d) => d.id === item.id);
  const qty = inCart?.qty || 0;
  const unavailable = !item.is_available;

  return (
    <article
      className={`menu-card${unavailable ? ' menu-card--unavailable' : ''}${qty > 0 ? ' menu-card--in-cart' : ''}`}
      role="listitem"
    >
      {/* Image area */}
      <div className="menu-card__img-wrap">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="menu-card__img"
            loading="lazy"
          />
        ) : (
          <div className="menu-card__img-placeholder" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 8C8 10 5.9 16.17 3.82 19.43"/>
              <path d="M10.29 4.21 10 12 6.62 14.56c-.39.3-.54.81-.37 1.27L7 17"/>
              <path d="M3 3c.83 4.26 2.28 7.15 5 9"/>
              <path d="M9 5c.83 4.26 2.28 7.15 5 9"/>
              <path d="M15 7c.83 4.26 2.28 7.15 5 9"/>
            </svg>
          </div>
        )}

        {unavailable && (
          <div className="menu-card__unavail-overlay" aria-label="Unavailable">
            <span>Unavailable</span>
          </div>
        )}

        {qty > 0 && (
          <div className="menu-card__qty-badge" aria-label={`${qty} in order`}>
            {qty}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="menu-card__body">
        <p className="menu-card__name">{item.name}</p>
        {item.description && (
          <p className="menu-card__desc">{item.description}</p>
        )}
        <div className="menu-card__footer">
          <span className="menu-card__price">
            ₱{Number(item.price).toFixed(2)}
          </span>
          <button
            className="menu-card__add"
            onClick={() => onAdd(item)}
            disabled={unavailable}
            aria-label={`Add ${item.name} to order`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}

function MenuSkeleton() {
  return (
    <div className="menu-grid" aria-busy="true" aria-label="Loading menu">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="menu-card menu-card--skeleton">
          <div className="menu-card__img-wrap skeleton-block" />
          <div className="menu-card__body">
            <div className="skeleton-line skeleton-line--md" />
            <div className="skeleton-line skeleton-line--sm" />
            <div className="menu-card__footer">
              <div className="skeleton-line skeleton-line--sm" style={{ width: '4rem' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}