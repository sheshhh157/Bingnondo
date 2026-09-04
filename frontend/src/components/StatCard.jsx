// StatCard — KPI/summary tile. accent: 'alert' | 'queue' | 'none'
export default function StatCard({ label, value, sub, accent = 'none' }) {
  return (
    <div className={`ui-stat${accent === 'alert' ? ' ui-stat--alert' : accent === 'queue' ? ' ui-stat--queue' : ''}`}>
      <span className="ui-stat__label">{label}</span>
      <span className="ui-stat__value">{value}</span>
      {sub && <span className="ui-stat__sub">{sub}</span>}
    </div>
  );
}
