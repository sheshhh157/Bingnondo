import '../styles/Pagination.css';

// Compact windowed page list: always shows first/last, ±1 around the current
// page, and an ellipsis for the gaps.
function pageList(current, total) {
  const pages = [];
  const delta = 1;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }
  return pages;
}

/**
 * Shared pagination control.
 *   page / totalPages — current page + number of pages
 *   total / from / to — for the "X–Y of N" summary
 *   onPage(page)      — request a page change
 */
export default function Pagination({
  page = 1,
  totalPages = 1,
  total = 0,
  from = 0,
  to = 0,
  onPage,
  label = 'Pagination',
}) {
  if (total <= 0) return null;
  const pages = pageList(page, totalPages);

  return (
    <nav className="cp-pag" aria-label={label}>
      <span className="cp-pag__info">{from}–{to} of {total}</span>

      {totalPages > 1 && (
        <div className="cp-pag__controls">
          <button
            type="button"
            className="cp-pag__btn"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          {pages.map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} className="cp-pag__ellipsis" aria-hidden="true">…</span>
              : (
                <button
                  key={p}
                  type="button"
                  className={`cp-pag__btn cp-pag__btn--num${p === page ? ' cp-pag__btn--active' : ''}`}
                  onClick={() => onPage(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              )
          )}

          <button
            type="button"
            className="cp-pag__btn"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}
    </nav>
  );
}
