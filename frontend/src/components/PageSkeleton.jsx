// PageSkeleton — shimmer placeholder matching a page's rough layout while
// its first fetch is in flight. Counts mirror the page's stat row, chart
// grid, module cards and table blocks. Reuses the shared osk-shimmer motion.
export default function PageSkeleton({ stats = 0, cards = 0, charts = 0, rows = 0, wide = false }) {
  return (
    <div className="ui-skel-root" role="status" aria-label="Loading…">
      {stats > 0 && (
        <div className="ui-skel__stats" style={{ '--ui-skel-cols': stats }}>
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="ui-skel ui-skel--card" aria-hidden="true">
              <span className="ui-skel ui-skel--label" />
              <span className="ui-skel ui-skel--value" />
              <span className="ui-skel ui-skel--sub" />
            </div>
          ))}
        </div>
      )}
      {charts > 0 && (
        <div className="ui-skel__charts">
          {Array.from({ length: charts }).map((_, i) => (
            <div key={i} className="ui-skel ui-skel--chart" aria-hidden="true" />
          ))}
        </div>
      )}
      {cards > 0 && (
        <div className="ui-skel__cards">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="ui-skel ui-skel--module" aria-hidden="true" />
          ))}
        </div>
      )}
      {wide && <div className="ui-skel ui-skel--wide" aria-hidden="true" />}
      {rows > 0 && (
        <div className="ui-skel__table" aria-hidden="true">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="ui-skel ui-skel--row" />
          ))}
        </div>
      )}
    </div>
  );
}