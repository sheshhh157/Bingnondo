import { useState } from 'react';
import { kitchenAPI } from '../../../services/api';

export default function AlertPanel({ alerts, onAcknowledge }) {
  const [ackLoading, setAckLoading] = useState(null);
  const active = alerts.filter((a) => !a.acknowledged_at);
  if (active.length === 0) return null;

  async function handleAck(alertId) {
    setAckLoading(alertId);
    try {
      await kitchenAPI.acknowledgeAlert(alertId);
      onAcknowledge(alertId);
    } catch (err) {
      console.error('Acknowledge failed:', err);
    } finally {
      setAckLoading(null);
    }
  }

  return (
    <aside className="kp-alerts" role="complementary" aria-label={`${active.length} kitchen alert${active.length > 1 ? 's' : ''}`} aria-live="assertive">
      <div className="kp-alerts__header">
        <div className="kp-alerts__pulse" aria-hidden="true" />
        <span className="kp-alerts__title">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1a4.5 4.5 0 00-4.5 4.5V8L1 10h12l-1.5-2V5.5A4.5 4.5 0 007 1zM5.5 11.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          </svg>
          Incoming Alerts
        </span>
        <span className="kp-alerts__count">{active.length}</span>
      </div>
      <ul className="kp-alerts__list">
        {active.map((alert) => (
          <li key={alert.id} className="kp-alerts__item">
            <div className="kp-alerts__item-info">
              <p className="kp-alerts__item-label">New Order — #{alert.order?.order_number || alert.order_id}</p>
              {alert.esp32_device && <p className="kp-alerts__item-device">{alert.esp32_device.location_label}</p>}
            </div>
            <button
              className="kp-btn kp-btn--ack"
              onClick={() => handleAck(alert.id)}
              disabled={ackLoading === alert.id}
            >
              {ackLoading === alert.id
                ? <span className="kp-spinner-sm" aria-label="Processing" />
                : 'Acknowledge'}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}