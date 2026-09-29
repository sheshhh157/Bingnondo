import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { menuAPI } from '../../services/managerApi';
import useLiveData from '../../hooks/useLiveData';
import { currency, menuAvailVariant } from '../../utils/format';
import { MENU_EVENTS, outOfStockIngredients } from './managerData';
import LiveControls from './LiveControls';
import PageSkeleton from '../../components/PageSkeleton';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import ErrorBanner from '../../components/ErrorBanner';
import '../../styles/MenuPage.css';

export default function MenuPage() {
  const { data: items, loading, error, lastUpdated, refresh, refreshing } = useLiveData({
    fetchFn: async () => (await menuAPI.getStaffMenu()).data,
    events: MENU_EVENTS,
    pollMs: 15000,
  });

  const [search, setSearch] = useState('');
  const [showAvailable, setShowAvailable] = useState(false);
  const query = search.trim().toLowerCase();

  const unavailableCount = useMemo(() => items.filter((i) => !i.is_available).length, [items]);

  const groups = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (query && !item.name.toLowerCase().includes(query)) continue;
      if (showAvailable && !item.is_available) continue;
      const key = item.category_name || 'Uncategorized';
      (map[key] ||= []).push(item);
    }
    return Object.entries(map);
  }, [items, query, showAvailable]);

  return (
    <div className="menu-root">
      <PageHeader
        title="Menu — Live"
        sub="Item availability across the catalog (read-only, auto-refreshes every 15s)"
      />

      {error && (
        <ErrorBanner>
          Couldn't load this view.
          <button type="button" className="ui-error__retry" onClick={() => refresh()}>Retry</button>
        </ErrorBanner>
      )}

      <div className="menu-stats">
        <StatCard label="Menu Items" value={items.length} />
        <StatCard label="Available" value={items.length - unavailableCount} />
        <StatCard label="Unavailable" value={unavailableCount} />
      </div>

      <LiveControls lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={() => refresh(true)} label="Refresh menu availability" />

      <div className="menu-toolbar">
        <div className="menu-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items…"
            className="menu-search__input"
            aria-label="Search menu items"
          />
        </div>
        <button
          type="button"
          className={`menu-toggle${showAvailable ? ' menu-toggle--on' : ''}`}
          onClick={() => setShowAvailable((v) => !v)}
          aria-pressed={showAvailable}
        >
          Available only
        </button>
      </div>

      {loading ? (
        <PageSkeleton stats={3} wide />
      ) : items.length === 0 ? (
        <EmptyState message="No menu items yet." />
      ) : groups.length === 0 ? (
        <EmptyState message="No items match your filters." />
      ) : (
        <div className="menu-groups">
          {groups.map(([category, list]) => (
            <section key={category} className="menu-group" aria-label={category}>
              <div className="menu-group__head">
                <h2 className="menu-group__title">{category}</h2>
                <span className="menu-group__count">{list.length}</span>
              </div>
              <MenuStrip label={category}>
                {list.map((item) => {
                  const blockers = outOfStockIngredients(item);
                  const shortages = (item.ingredients || []).filter((ing) => {
                    const have = Number(ing.current_stock);
                    const need = Number(ing.quantity_required);
                    return need > 0 && have > 0 && have < need;
                  });
                  const runningLow = (item.ingredients || []).filter((ing) => {
                    const have = Number(ing.current_stock);
                    const need = Number(ing.quantity_required);
                    return need > 0 && have >= need && have < need * 2;
                  });
                  const stockLeft = (ing) => `${Number(ing.current_stock)}${ing.unit || ''} left`;
                  return (
                    <article key={item.id} className={`menu-card${item.is_available ? '' : ' menu-card--off'}`}>
                      <MenuCardPhoto item={item} />
                      <div className="menu-card__body">
                        <div className="menu-card__top">
                          <span className="menu-card__name">{item.name}</span>
                          <Badge variant={menuAvailVariant(item.is_available)}>
                            {item.is_available ? 'Available' : 'Unavailable'}
                          </Badge>
                        </div>
                        <div className="menu-card__meta">
                          <span className="menu-card__price">{currency(item.price)}</span>
                          {blockers.length > 0 && (
                            <span className="menu-card__hint">Out of stock: {blockers.join(', ')}</span>
                          )}
                          {shortages.length > 0 && (
                            <span className="menu-card__hint menu-card__hint--critical">
                              Shortfall: {shortages.map((s) => `${s.name} (${stockLeft(s)})`).join(', ')}
                            </span>
                          )}
                          {runningLow.length > 0 && (
                            <span className="menu-card__hint menu-card__hint--low">
                              Low stock: {runningLow.map((s) => `${s.name} (${stockLeft(s)})`).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </MenuStrip>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Per-category horizontal strip with prev/next chevrons. Arrows appear only
 * when there is more to scroll on that side, and they vanish on touch-only
 * devices where swipe/scroll is natural. Scrolling respects reduced motion.
 */
function MenuStrip({ label, children }) {
  const listRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanPrev(scrollLeft > 1);
    setCanNext(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  const nudge = (dir) => {
    const el = listRef.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: dir * Math.round(el.clientWidth * 0.8),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update]);

  return (
    <div className="menu-strip">
      <div className="menu-group__list" ref={listRef}>
        {children}
      </div>
      <button
        type="button"
        className="menu-strip__nav menu-strip__nav--prev"
        onClick={() => nudge(-1)}
        disabled={!canPrev}
        tabIndex={canPrev ? 0 : -1}
        aria-label={`Scroll ${label} left`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <button
        type="button"
        className="menu-strip__nav menu-strip__nav--next"
        onClick={() => nudge(1)}
        disabled={!canNext}
        tabIndex={canNext ? 0 : -1}
        aria-label={`Scroll ${label} right`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
    </div>
  );
}

/**
 * Full-width photo header for a menu card. Renders the item's image when one
 * is set (falling back to this placeholder if the URL breaks), otherwise the
 * icon placeholder itself. Keeps its own state so a failed load flips once
 * instead of on every render.
 */
function MenuCardPhoto({ item }) {
  const [failed, setFailed] = useState(false);
  const hasPhoto = item.image_url && !failed;

  return hasPhoto ? (
    <img
      src={item.image_url}
      alt={item.name}
      className="menu-card__photo-img"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="menu-card__photo-ph" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 8C8 10 5.9 16.17 3.82 19.43"/>
        <path d="M10.29 4.21 10 12 6.62 14.56c-.39.3-.54.81-.37 1.27L7 17"/>
        <path d="M3 3c.83 4.26 2.28 7.15 5 9"/>
        <path d="M9 5c.83 4.26 2.28 7.15 5 9"/>
        <path d="M15 7c.83 4.26 2.28 7.15 5 9"/>
      </svg>
    </div>
  );
}