// Badge — status pill with color variants.
// variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'gold' | 'none'
// Optional `dot` renders a status dot before the label (e.g. for delivery statuses).
export default function Badge({ variant = 'muted', children, dot = false, className = '' }) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`.trim()}>
      {dot && <span className="ui-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
