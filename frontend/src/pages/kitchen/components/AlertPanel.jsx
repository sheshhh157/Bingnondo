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
    <aside
      className="kp-alerts"
      role="complementary"
      aria-label={`${active.length} kitchen alert${active.length > 1 ? 's' : ''}`}
      aria-live="assertive"
    >
      <div className="kp-alerts__header">
        <div className="kp-alerts__pulse" aria-hidden="true" />
        <span className="kp-alerts__title">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M6.5 1a4 4 0 00-4 4v2.5L1 9.5h11L10.5 7.5V5a4 4 0 00-4-4zM5 10.5a1.5 1.5 0 003 0"
              stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
          Incoming Alerts
        </span>
        <span className="kp-alerts__count">{active.length}</span>
      </div>

      <ul className="kp-alerts__list">
        {active.map((alert) => (
          <li key={alert.id} className="kp-alerts__item">
            <div className="kp-alerts__item-info">
              <p className="kp-alerts__item-label">
                New Order — #{alert.order?.order_number || alert.order_id}
              </p>
              {alert.esp32_device && (
                <p className="kp-alerts__item-device">{alert.esp32_device.location_label}</p>
              )}
            </div>
            <button
              className="kp-btn kp-btn--ack"
              onClick={() => handleAck(alert.id)}
              disabled={ackLoading === alert.id}
              aria-label={`Acknowledge alert for order ${alert.order?.order_number || alert.order_id}`}
            >
              {ackLoading === alert.id
                ? <span className="kp-spin-sm" aria-hidden="true" />
                : 'Acknowledge'}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}