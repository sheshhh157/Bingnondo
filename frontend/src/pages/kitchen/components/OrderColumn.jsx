import OrderCard from './OrderCard';

export default function OrderColumn({ lane, label, icon, orders, onStatusChange }) {
  return (
    <section
      className={`kp-col kp-col--${lane}`}
      aria-label={`${label}: ${orders.length} order${orders.length !== 1 ? 's' : ''}`}
    >
      {/* Column header */}
      <div className="kp-col__header">
        <span className="kp-col__icon" aria-hidden="true">{icon}</span>
        <h2 className="kp-col__title">{label}</h2>
        <span
          className={`kp-col__count ${orders.length > 0 ? `kp-col__count--${lane}` : ''}`}
          aria-label={`${orders.length} orders`}
        >
          {orders.length}
        </span>
      </div>

      {/* Orders or empty */}
      {orders.length === 0 ? (
        <div className="kp-col__empty" role="status">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
            <rect x="7" y="19" width="30" height="18" rx="4" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M13 19V15a9 9 0 0118 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M18 29h8M22 26v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <p>No {label.toLowerCase()}</p>
        </div>
      ) : (
        <div className="kp-col__list">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              lane={lane}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}