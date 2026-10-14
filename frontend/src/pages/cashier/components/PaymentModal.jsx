import { useState, useEffect, useRef } from 'react';
import { ordersAPI } from '../../../services/cashierApi';
import '../../../styles/PaymentModal.css';

const fmt   = (n) => `₱${Number(n).toFixed(2)}`;
const fmtK  = (d) => d >= 1000 ? `₱${d / 1000}k` : `₱${d}`;

const BILLS = [1000, 500, 200, 100, 50, 20];
const COINS = [10, 5, 1];
const ALL_DENOMS = [...BILLS, ...COINS];

function computeTotal(counts) {
  return ALL_DENOMS.reduce((sum, d) => sum + d * (counts[d] || 0), 0);
}

// ─── Denomination Keyboard ────────────────────────────────────────────────────
function DenomKeyboard({ counts, total, onChange }) {
  const cashGiven = computeTotal(counts);
  const remaining = Math.round((total - cashGiven) * 100) / 100;
  const canAdd = (d) => cashGiven === 0 || d <= remaining;
  const add = (d) => {
    if (!canAdd(d)) return;
    onChange({ ...counts, [d]: (counts[d] || 0) + 1 });
  };
  const remove = (d) => {
    const next = (counts[d] || 0) - 1;
    const updated = { ...counts };
    if (next <= 0) delete updated[d]; else updated[d] = next;
    onChange(updated);
  };
  const clear = () => onChange({});

  // Active denominations (those with qty > 0)
  const active = ALL_DENOMS.filter((d) => (counts[d] || 0) > 0);

  return (
    <div className="pm-kbd">
      {/* Active chips row */}
      {active.length > 0 && (
        <div className="pm-kbd__chips">
          {active.map((d) => (
            <div key={d} className="pm-kbd__chip">
              <span className="pm-kbd__chip-label">{fmtK(d)}</span>
              <span className="pm-kbd__chip-qty">×{counts[d]}</span>
              <button
                className="pm-kbd__chip-x"
                onClick={() => remove(d)}
                type="button"
                aria-label={`Remove one ₱${d}`}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
          <button className="pm-kbd__clear" onClick={clear} type="button">Clear</button>
        </div>
      )}

      {/* Bills */}
      <div className="pm-kbd__section-label">Bills</div>
      <div className="pm-kbd__row">
        {BILLS.map((d) => (
          <button
            key={d}
            className={`pm-kbd__key${(counts[d] || 0) > 0 ? ' pm-kbd__key--active' : ''}`}
            onClick={() => add(d)}
            disabled={!canAdd(d)}
            title={!canAdd(d) ? `Only ${fmt(remaining)} left due` : undefined}
            type="button"
            aria-label={`Add ₱${d} bill`}
          >
            {fmtK(d)}
            {(counts[d] || 0) > 0 && <span className="pm-kbd__key-badge">{counts[d]}</span>}
          </button>
        ))}
      </div>

      {/* Coins */}
      <div className="pm-kbd__section-label">Coins</div>
      <div className="pm-kbd__row pm-kbd__row--coins">
        {COINS.map((d) => (
          <button
            key={d}
            className={`pm-kbd__key pm-kbd__key--coin${(counts[d] || 0) > 0 ? ' pm-kbd__key--active' : ''}`}
            onClick={() => add(d)}
            disabled={!canAdd(d)}
            title={!canAdd(d) ? `Only ${fmt(remaining)} left due` : undefined}
            type="button"
            aria-label={`Add ₱${d} coin`}
          >
            {fmtK(d)}
            {(counts[d] || 0) > 0 && <span className="pm-kbd__key-badge">{counts[d]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function PaymentModal({ items, total, draft, onClose, onSuccess }) {
  const [method, setMethod]           = useState('');
  const [denomCounts, setDenomCounts] = useState({});
  const [step, setStep]               = useState('select');
  const [processing, setProcessing]   = useState(false);
  const [error, setError]             = useState('');
  const [placedOrderNumber, setPlacedOrderNumber] = useState(null);
  const [placedOrder, setPlacedOrder]             = useState(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  const cashGiven = computeTotal(denomCounts);
  const change    = cashGiven - total;
  const cashValid = cashGiven >= total;

  useEffect(() => {
    const el = dialogRef.current;
    openerRef.current = document.activeElement;
    if (el) el.focus();

    // Lock background scroll while the dialog is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () => el
      ? Array.from(el.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        ))
      : [];
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      // Restore focus to whatever opened the modal.
      openerRef.current?.focus?.();
    };
  }, [onClose]);

  const handlePayment = async () => {
    if (!method) { setError('Please select a payment method.'); return; }
    if (method === 'cash' && cashGiven === 0) { setError('Please tap the bills and coins given by the customer.'); return; }
    if (method === 'cash' && !cashValid) { setError(`Cash given (${fmt(cashGiven)}) is less than the total (${fmt(total)}).`); return; }

    setProcessing(true);
    setError('');
    try {
      // Nothing is written to the DB until this call — the order is created
      // together with its 'paid' payment in one transaction.
      const { data } = await ordersAPI.checkout({
        items,
        method,
        cash_given: method === 'cash' ? cashGiven : undefined,
      });
      setPlacedOrder(data);
      setPlacedOrderNumber(data.order_number);
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
      <div className="pm-panel" ref={dialogRef} tabIndex={-1}>
        {step === 'select' ? (
          <>
            {/* ── Header ── */}
            <div className="pm-head">
              <div className="pm-head__titles">
                <span className="pm-head__eyebrow">Counter Sale</span>
                <h2 id="pm-title" className="pm-head__title">Process Payment</h2>
              </div>
              <button className="pm-close" onClick={onClose} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* ── Two-column body ── */}
            <div className="pm-body">

              {/* LEFT — order summary + totals + method */}
              <div className="pm-left">

                {/* Order items */}
                <div className="pm-summary">
                  <div className="pm-summary__items">
                    {draft.map((item) => (
                      <div key={item.id} className="pm-summary__row">
                        <span className="pm-summary__name">
                          {item.name}
                          <span className="pm-summary__qty"> ×{item.qty}</span>
                        </span>
                        <span className="pm-summary__val">{fmt(item.price * item.qty)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Total + cash given / change */}
                  <div className="pm-summary__footer">
                    <div className="pm-summary__foot-row">
                      <span>Total</span>
                      <span className="pm-summary__foot-total">{fmt(total)}</span>
                    </div>
                    {method === 'cash' && cashGiven > 0 && (
                      <>
                        <div className="pm-summary__foot-row">
                          <span>Cash given</span>
                          <span>{fmt(cashGiven)}</span>
                        </div>
                        <div className={`pm-summary__foot-row pm-summary__foot-row--change${cashValid ? '' : ' pm-summary__foot-row--short'}`}>
                          <span>{cashValid ? 'Change' : 'Short by'}</span>
                          <span>{fmt(Math.abs(change))}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payment method */}
                <div className="pm-methods">
                  <p className="pm-methods__label">Payment method</p>
                  <div className="pm-methods__grid">
                    <PayMethodCard
                      id="method-cash" value="cash" label="Cash"
                      description="Customer pays in cash"
                      selected={method === 'cash'}
                      onSelect={() => { setMethod('cash'); setError(''); }}
                      icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="6" width="20" height="12" rx="2"/>
                          <circle cx="12" cy="12" r="2"/>
                          <path d="M6 12h.01M18 12h.01"/>
                        </svg>
                      }
                    />
                    <PayMethodCard
                      id="method-gcash" value="gcash" label="GCash"
                      description="PayMongo QR checkout"
                      selected={method === 'gcash'}
                      onSelect={() => { setMethod('gcash'); setError(''); }}
                      icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="2" width="14" height="20" rx="2"/>
                          <line x1="12" y1="18" x2="12.01" y2="18"/>
                          <path d="M9 7h6M9 11h4"/>
                        </svg>
                      }
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT — denomination keyboard (only for cash) */}
              {method === 'cash' && (
                <div className="pm-right">
                  <DenomKeyboard
                    counts={denomCounts}
                    total={total}
                    onChange={(c) => { setDenomCounts(c); setError(''); }}
                  />
                </div>
              )}
            </div>

            {/* ── Error ── */}
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

            {/* ── Actions ── */}
            <div className="pm-actions">
              <button className="pm-actions__cancel" onClick={onClose}>Cancel</button>
              <button
                className="pm-actions__confirm"
                onClick={handlePayment}
                disabled={processing || !method || (method === 'cash' && !cashValid)}
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
          <Receipt
            order={placedOrder}
            orderNumber={placedOrderNumber}
            draft={draft}
            total={total}
            method={method}
            cashGiven={method === 'cash' ? cashGiven : null}
            change={method === 'cash' ? change : null}
            onDone={() => { onSuccess(placedOrder); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── PayMethodCard ────────────────────────────────────────────────────────────
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

// ─── Receipt ──────────────────────────────────────────────────────────────────
function Receipt({ order, orderNumber, draft, total, method, cashGiven, change, onDone }) {
  // Prefer the authoritative response from checkout; fall back to props.
  const items      = order?.items?.length ? order.items : draft;
  const sum        = order?.total_amount != null ? order.total_amount : total;
  const ref        = orderNumber || order?.order_number;
  const payMethod  = (order?.payment?.method) || method;
  const paidGiven  = cashGiven;
  const paidChange = change;
  const now        = new Date();
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
        <p className="pm-receipt__sub">Order #{ref} — {payMethod === 'cash' ? 'Cash' : 'GCash'}</p>
      </div>

      <div className="pm-receipt__paper">
        <div className="pm-receipt__store">Bingnondo Cafe</div>
        <div className="pm-receipt__meta">{dateStr} · {timeStr}</div>
        <div className="pm-receipt__divider" aria-hidden="true" />

        {items.map((item) => (
          <div key={item.id} className="pm-receipt__line">
            <span>{item.name} <span className="pm-receipt__qty">×{item.quantity ?? item.qty}</span></span>
            <span>₱{Number((item.unit_price ?? item.price) * (item.quantity ?? item.qty)).toFixed(2)}</span>
          </div>
        ))}

        <div className="pm-receipt__divider" aria-hidden="true" />

        <div className="pm-receipt__line pm-receipt__line--bold">
          <span>Total</span>
          <span>₱{Number(sum).toFixed(2)}</span>
        </div>

        {payMethod === 'cash' && paidGiven !== null && (
          <>
            <div className="pm-receipt__line">
              <span>Cash given</span>
              <span>₱{Number(paidGiven).toFixed(2)}</span>
            </div>
            <div className="pm-receipt__line pm-receipt__line--accent">
              <span>Change</span>
              <span>₱{Number(paidChange).toFixed(2)}</span>
            </div>
          </>
        )}

        <div className="pm-receipt__footer-text">Thank you for dining with us!</div>
      </div>

      <div className="pm-receipt__actions">
        <button className="pm-receipt__print" onClick={() => window.print()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print Receipt
        </button>
        <button className="pm-receipt__done" onClick={onDone}>
          New Order
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  );
}