import { useState, useEffect, useCallback } from 'react';
import { deliveryAPI } from '../../services/api';
import '../../styles/OversightDelivery.css';

const STATUS_LABEL = {
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
};

const STEPS = ['preparing', 'ready', 'out_for_delivery', 'delivered'];

export default function OversightDelivery() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await deliveryAPI.getAll();
      setDeliveries(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = deliveries.filter((d) => d.status !== 'delivered');
  const completed = deliveries.filter((d) => d.status === 'delivered');

  return (
    <div className="odl-root">
      <div className="odl-header">
        <div>
          <h1 className="odl-title">Delivery — Read-Only</h1>
          <p className="odl-sub">Track rider deliveries from preparation to drop-off (viewing only)</p>
        </div>
      </div>

      <div className="odl-stats">
        <div className="odl-stat"><span className="odl-stat__label">Awaiting / In transit</span><span className="odl-stat__value">{active.length}</span></div>
        <div className="odl-stat"><span className="odl-stat__label">Delivered</span><span className="odl-stat__value odl-stat__value--ok">{completed.length}</span></div>
      </div>

      {loading ? (
        <div className="odl-loading" role="status" aria-live="polite">
          <div className="odl-loader"><div /><div /><div /></div>
          <span>Loading deliveries…</span>
        </div>
      ) : deliveries.length === 0 ? (
        <div className="odl-empty">No deliveries yet.</div>
      ) : (
        <div className="odl-list">
          {deliveries.map((d) => (
            <article key={d.id} className="odl-card">
              <div className="odl-card__top">
                <div>
                  <span className="odl-card__order">#{d.order_number}</span>
                  <span className="odl-card__customer">{d.customer}</span>
                </div>
                <span className={`odl-status odl-status--${d.status}`}>
                  <span className="odl-status__dot" aria-hidden="true" />
                  {STATUS_LABEL[d.status] || d.status}
                </span>
              </div>
              <div className="odl-card__meta">
                <span className="odl-meta"><RiderIcon /> {d.rider}</span>
                <span className="odl-meta"><ClockIcon /> {d.eta}</span>
              </div>
              <div className="odl-progress">
                {STEPS.map((step, i) => {
                  const idx = STEPS.indexOf(d.status);
                  const done = i <= idx;
                  return (
                    <div key={step} className="odl-step">
                      <span className={`odl-step__dot${done ? ' odl-step__dot--done' : ''}`} aria-hidden="true" />
                      {i < STEPS.length - 1 && <span className={`odl-step__line${i < idx ? ' odl-step__line--done' : ''}`} aria-hidden="true" />}
                      <span className={`odl-step__label${done ? ' odl-step__label--done' : ''}`}>{STATUS_LABEL[step]}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function RiderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7" r="3"/><path d="M2 21v-1a5 5 0 0 1 5-5 4 4 0 0 1 1.5.29M17 11l4 4v4h-4M17 11l-3 3M20 15l-4-4v3M17 18h.01"/>
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  );
}
