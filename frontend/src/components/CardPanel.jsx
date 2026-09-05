// CardPanel — generic card container with optional title.
export default function CardPanel({ title, wide = false, className = '', children, style }) {
  return (
    <div className={`ui-card${wide ? ' ui-card--wide' : ''} ${className}`.trim()} style={style}>
      {title && <h2 className="ui-card__title">{title}</h2>}
      {children}
    </div>
  );
}
