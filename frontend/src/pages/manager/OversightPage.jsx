import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { kitchenAPI, inventoryAPI, deliveryAPI } from '../../services/api';
import '../../styles/OversightPage.css';

export default function OversightPage() {
  const [kitchen, setKitchen] = useState([]);
  const [stock, setStock] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [k, s, d] = await Promise.all([
          kitchenAPI.getOrders(),
          inventoryAPI.getAll(),
          deliveryAPI.getAll(),
        ]);
        if (!cancelled) {
          setKitchen(k.data);
          setStock(s.data.items || s.data);
          setDeliveries(d.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const out = stock.filter((i) => i.current_stock <= 0).length;
  const low = stock.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level).length;
  const counter = kitchen.filter((o) => o.order_channel !== 'mobile_app').length;
  const online = kitchen.filter((o) => o.order_channel === 'mobile_app').length;
  const activeDeliveries = deliveries.filter((d) => d.status === 'out_for_delivery').length;

  const modules = [
    {
      to: '/manager/oversight/kitchen',
      title: 'Kitchen',
      desc: 'Live mirror of the Kitchen Dashboard — counter & online queues, order status and urgency.',
      stat: `${kitchen.length} in queue · ${counter} counter / ${online} online`,
      icon: <KitchenIcon />,
    },
    {
      to: '/manager/oversight/stocks',
      title: 'Stocks',
      desc: 'Current inventory levels with reorder thresholds and status badges.',
      stat: `${out} out · ${low} low`,
      icon: <StocksIcon />,
      alert: (out + low) > 0,
    },
    {
      to: '/manager/oversight/delivery',
      title: 'Delivery',
      desc: 'Track rider deliveries from preparing, ready, out-for-delivery to delivered.',
      stat: `${activeDeliveries} out for delivery`,
      icon: <DeliveryIcon />,
    },
  ];

  return (
    <div className="ov-root">
      <div className="ov-header">
        <div>
          <h1 className="ov-title">Operational Oversight</h1>
          <p className="ov-sub">Read-only live views across the operation</p>
        </div>
      </div>

      {loading ? (
        <div className="ov-loading" role="status" aria-live="polite">
          <div className="ov-loader"><div /><div /><div /></div>
          <span>Loading oversight…</span>
        </div>
      ) : (
        <div className="ov-grid">
          {modules.map((m) => (
            <Link key={m.to} to={m.to} className={`ov-module${m.alert ? ' ov-module--alert' : ''}`}>
              <div className="ov-module__icon" aria-hidden="true">{m.icon}</div>
              <div className="ov-module__body">
                <h2 className="ov-module__title">{m.title}</h2>
                <p className="ov-module__desc">{m.desc}</p>
                <span className="ov-module__stat">{m.stat}</span>
              </div>
              <svg className="ov-module__arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function KitchenIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
      <path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
    </svg>
  );
}
function StocksIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  );
}
function DeliveryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
      <rect width="13" height="8" x="9" y="11" rx="1"/>
      <circle cx="11" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
    </svg>
  );
}
