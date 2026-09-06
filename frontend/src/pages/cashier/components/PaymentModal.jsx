import { useState, useEffect, useRef } from 'react';
import { paymentsAPI } from '../../../services/api';
import '../../../styles/PaymentModal.css';

const fmt = (n) => `₱${Number(n).toFixed(2)}`;

export default function PaymentModal({ orderId, orderNumber, total, draft, onClose, onSuccess }) {
  const [method, setMethod] = useState(''); // 'cash' | 'gcash'
  const [cashGiven, setCashGiven] = useState('');
  const [step, setStep] = useState('select'); // 'select' | 'receipt'
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  const change = parseFloat(cashGiven || 0) - total;
  const cashValid = parseFloat(cashGiven || 0) >= total;

  // Focus trap and ESC key
  useEffect(() => {
    const el = dialogRef.current;
    if (el) el.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePayment = async () => {
    if (!method) { setError('Please select a payment method.'); return; }
    if (method === 'cash' && !cashValid) { setError('Cash given must be at least the total amount.'); return; }

    setProcessing(true);
    setError('');
    try {
      await paymentsAPI.process({
        order_id: orderId,
        method,
        amount: total,
        cash_given: method === 'cash' ? parseFloat(cashGiven) : undefined,
      });
      setStep('receipt');
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="pm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pm-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="pm-panel"
        ref={dialogRef}
        tabIndex={-1}
      >
        {step === 'select' ? (
          <>
            {/* Select + confirm step */}
            <div className="pm-head">
              <div className="pm-head__left">
                <span className="pm-head__label">Order #{orderNumber}</span>
                <h2 id="pm-title" className="pm-head__title">Process Payment</h2>
              </div>
              <button className="pm-close" onClick={onClose} aria-label="Close payment">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Order summary */}
            <div className="pm-summary">
              <div className="pm-summary__items">
                {draft.map((item) => (
                  <div key={item.id} className="pm-summary__row">
                    <span className="pm-summary__name">{item.name} <span className="pm-summary__qty">×{item.qty}</span></span>
                    <span className="pm-summary__val">{fmt(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="pm-summary__total">
                <span>Total</span>
                <span className="pm-summary__total-val">{fmt(total)}</span>
              </div>
            </div>

            {/* Method selection */}
            <div className="pm-methods">
              <p className="pm-methods__label">Payment method</p>
              <div className="pm-methods__grid">
                <PayMethodCard
                  id="method-cash"
                  value="cash"
                  label="Cash"
                  description="Customer pays in cash"
                  selected={method === 'cash'}
                  onSelect={() => { setMethod('cash'); setError(''); }}
                  icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="20" height="12" rx="2"/>
                      <circle cx="12" cy="12" r="2"/>
                      <path d="M6 12h.01M18 12h.01"/>
                    </svg>
                  }
                />
                <PayMethodCard
                  id="method-gcash"
                  value="gcash"
                  label="GCash"
                  description="PayMongo QR checkout"
                  selected={method === 'gcash'}
                  onSelect={() => { setMethod('gcash'); setError(''); }}
                  icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="2"/>
                      <line x1="12" y1="18" x2="12.01" y2="18"/>
                      <path d="M9 7h6M9 11h4"/>
                    </svg>
                  }
                />
              </div>
            </div>

            {/* Cash-given field */}
            {method === 'cash' && (
              <div className="pm-cash">
                <label className="pm-cash__label" htmlFor="cash-given">Cash given by customer</label>
                <div className="pm-cash__row">
                  <span className="pm-cash__prefix">₱</span>
                  <input
                    id="cash-given"
                    className="pm-cash__input"
                    type="number"
                    min={total}
                    step="1"
                    placeholder="0.00"
                    value={cashGiven}
                    onChange={(e) => { setCashGiven(e.target.value); setError(''); }}
                    autoFocus
                  />
                </div>
                {cashValid && parseFloat(cashGiven) > 0 && (
                  <p className="pm-cash__change">
                    Change: <strong>{fmt(change)}</strong>
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="pm-error" role="alert">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </p>
            )}

            <div className="pm-actions">
              <button className="pm-actions__cancel" onClick={onClose}>Cancel</button>
              <button
                className="pm-actions__confirm"
                onClick={handlePayment}
                disabled={processing || !method || (method === 'cash' && !cashValid && cashGiven !== '')}
                aria-busy={processing}
              >
                {processing ? (
                  <span className="pm-spinner" aria-label="Processing…" />
                ) : (
                  <>
                    {method === 'gcash' ? 'Generate QR' : 'Mark as Paid'}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* Receipt step */
          <Receipt
            orderNumber={orderNumber}
            draft={draft}
            total={total}
            method={method}
            cashGiven={method === 'cash' ? parseFloat(cashGiven) : null}
            change={method === 'cash' ? change : null}
            onDone={() => { onSuccess(method); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}

function PayMethodCard({ id, label, description, selected, onSelect, icon }) {
  return (
    <button
      id={id}
      className={`pm-method-card${selected ? ' pm-method-card--selected' : ''}`}
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
    >
      <span className="pm-method-card__icon">{icon}</span>
      <span className="pm-method-card__label">{label}</span>
      <span className="pm-method-card__desc">{description}</span>
      {selected && (
        <span className="pm-method-card__check" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
      )}
    </button>
  );
}

function Receipt({ orderNumber, draft, total, method, cashGiven, change, onDone }) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="pm-receipt">
      <div className="pm-receipt__success">
        <div className="pm-receipt__check-wrap" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="pm-receipt__title">Payment Confirmed</h2>
        <p className="pm-receipt__sub">Order #{orderNumber} — {method === 'cash' ? 'Cash' : 'GCash'}</p>
      </div>

      <div className="pm-receipt__paper">
        <div className="pm-receipt__store">Bingnondo Cafe</div>
        <div className="pm-receipt__meta">{dateStr} · {timeStr}</div>

        <div className="pm-receipt__divider" aria-hidden="true" />

        {draft.map((item) => (
          <div key={item.id} className="pm-receipt__line">
            <span>{item.name} <span className="pm-receipt__qty">×{item.qty}</span></span>
            <span>₱{Number(item.price * item.qty).toFixed(2)}</span>
          </div>
        ))}

        <div className="pm-receipt__divider" aria-hidden="true" />

        <div className="pm-receipt__line pm-receipt__line--bold">
          <span>Total</span>
          <span>₱{Number(total).toFixed(2)}</span>
        </div>

        {method === 'cash' && cashGiven !== null && (
          <>
            <div className="pm-receipt__line">
              <span>Cash given</span>
              <span>₱{Number(cashGiven).toFixed(2)}</span>
            </div>
            <div className="pm-receipt__line pm-receipt__line--accent">
              <span>Change</span>
              <span>₱{Number(change).toFixed(2)}</span>
            </div>
          </>
        )}

        <div className="pm-receipt__footer-text">Thank you for dining with us!</div>
      </div>

      <button className="pm-receipt__done" onClick={onDone}>
        New Order
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  );
}