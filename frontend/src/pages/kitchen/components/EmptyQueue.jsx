export default function EmptyQueue({ filter }) {
  return (
    <div className="kp-empty" role="status" aria-live="polite">
      <svg className="kp-empty__icon" width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <rect x="12" y="32" width="48" height="28" rx="6" stroke="var(--color-muted-foreground)" strokeWidth="2.5"/>
        <path d="M22 32V25a14 14 0 0128 0v7" stroke="var(--color-muted-foreground)" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M29 47h14M36 43v8" stroke="var(--color-muted-foreground)" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="36" cy="14" r="3.5" stroke="var(--color-muted-foreground)" strokeWidth="2"/>
        <path d="M25 20c0-3.5 3-5 3-8M47 20c0-3.5-3-5-3-8" stroke="var(--color-muted-foreground)" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <p className="kp-empty__heading">
        {filter === 'all' ? 'No orders in queue' : `No ${filter} orders`}
      </p>
      <p className="kp-empty__sub">New orders will appear here in real time</p>
    </div>
  );
}