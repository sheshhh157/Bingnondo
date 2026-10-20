import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { currency } from '../../../utils/format';
import '../../../styles/MenuGrid.css';

export default function MenuGrid({ items, loading, error, onAdd, onRetry, draft, emptyMessage = 'Nothing here yet.' }) {
  if (loading) return <MenuSkeleton />;

  if (error) {
    return (
      <div className="cdm-state cdm-state--error">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>{error}</p>
        <button className="cdm-retry-btn" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="cdm-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
        </svg>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="cdm-grid" role="list" aria-label="Menu items">
      {items.map((item) => (
        <MenuCard key={item.id} item={item} onAdd={onAdd} draft={draft} />
      ))}
    </div>
  );
}

function MenuCard({ item, onAdd, draft }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const variants = Array.isArray(item.variants) ? item.variants : [];
  const hasVariants = variants.length > 0;
  const priceable = variants.filter((v) => v.is_available);
  const qty = draft.filter((d) => d.id === item.id).reduce((s, d) => s + d.qty, 0);
  const unavailable = !item.is_available || (hasVariants && priceable.length === 0);
  const fromPrice = hasVariants
    ? Math.min(...(priceable.length > 0 ? priceable : variants).map((v) => v.price))
    : item.price;
  const onAddClick = () => (hasVariants ? setPickerOpen(true) : onAdd(item));

  return (
    <article
      className={`cdm-card${unavailable ? ' cdm-card--unavailable' : ''}${qty > 0 ? ' cdm-card--in-cart' : ''}`}
      role="listitem"
    >
      {/* Image area */}
      <div className="cdm-card__img-wrap">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="cdm-card__img"
            loading="lazy"
          />
        ) : (
          <div className="cdm-card__img-placeholder" aria-hidden="true">
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
          <div className="cdm-card__unavail-overlay" aria-label="Sold out">
            <span>Sold out</span>
          </div>
        )}

        {qty > 0 && (
          <div className="cdm-card__qty-badge" aria-label={`${qty} in order`}>
            {qty}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="cdm-card__body">
        <p className="cdm-card__name">{item.name}</p>
        <div className="cdm-card__footer">
          <span className="cdm-card__price">
            {hasVariants ? `from ${currency(fromPrice)}` : currency(item.price)}
          </span>
          <button
            className="cdm-card__add"
            onClick={onAddClick}
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

      {pickerOpen && (
        <VariantPicker
          item={item}
          onPick={(variant) => onAdd(item, variant)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </article>
  );
}

function VariantPicker({ item, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="cdv-overlay" onClick={onClose}>
      <div
        className="cdv-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`cdv-title-${item.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cdv-head">
          <div>
            <p className="cdv-sub">Choose an option</p>
            <h3 id={`cdv-title-${item.id}`} className="cdv-title">{item.name}</h3>
          </div>
          <button className="cdv-close" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="cdv-list">
          {item.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`cdv-option${v.is_available ? '' : ' cdv-option--off'}`}
              disabled={!v.is_available}
              onClick={() => { onPick(v); onClose(); }}
            >
              <span className="cdv-option__name">{v.name}</span>
              <span className="cdv-option__meta">
                {v.is_available ? currency(v.price) : 'Sold out'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function MenuSkeleton() {
  return (
    <div className="cdm-grid" aria-busy="true" aria-label="Loading menu">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="cdm-card cdm-card--skeleton">
          <div className="cdm-card__img-wrap skeleton-block" />
          <div className="cdm-card__body">
            <div className="skeleton-line skeleton-line--md" />
            <div className="skeleton-line skeleton-line--sm" />
            <div className="cdm-card__footer">
              <div className="skeleton-line skeleton-line--sm" style={{ width: '4rem' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}