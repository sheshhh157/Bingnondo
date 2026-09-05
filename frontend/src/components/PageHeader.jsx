// PageHeader — consistent page title + subtitle + optional action buttons.
export default function PageHeader({ title, sub, actions = [] }) {
  return (
    <div className="ui-pageheader">
      <div>
        <h1 className="ui-pageheader__title">{title}</h1>
        {sub && <p className="ui-pageheader__sub">{sub}</p>}
      </div>
      {actions.length > 0 && (
        <div className="ui-pageheader__actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={a.className || 'ui-btn'}
              onClick={a.onClick}
              aria-label={a.ariaLabel || a.label}
              disabled={a.disabled}
              aria-busy={a.busy}
            >
              {a.icon && <span aria-hidden="true">{a.icon}</span>}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
