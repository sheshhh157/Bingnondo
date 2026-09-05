import { useState } from 'react';
import '../../../styles/OrderDraft.css';

const fmt = (n) => `₱${Number(n).toFixed(2)}`;

export default function OrderDraft({
  draft,
  total,
  onUpdateQty,
  onRemove,
  onUpdateNote,
  onClear,
  onConfirm,
  loading,
}) {
  const itemCount = draft.reduce((s, d) => s + d.qty, 0);

  return (
    <div className="od-root">
      {/* Header */}
      <div className="od-header">
        <div className="od-header__left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <span>Current Order</span>
          {itemCount > 0 && <span className="od-header__count">{itemCount}</span>}
        </div>
        {draft.length > 0 && (
          <button
            className="od-clear-btn"
            onClick={onClear}
            aria-label="Clear order"
          >
            Clear
          </button>
        )}
      </div>

      {/* Items list */}
      <div className="od-items" aria-label="Order items" aria-live="polite">
        {draft.length === 0 ? (
          <div className="od-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="21" r="1"/>
              <circle cx="19" cy="21" r="1"/>
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
            </svg>
            <p>Tap items on the menu<br />to add them here.</p>
          </div>
        ) : (
          draft.map((item) => (
            <DraftItem
              key={item.id}
              item={item}
              onQty={(q) => onUpdateQty(item.id, q)}
              onRemove={() => onRemove(item.id)}
              onNote={(n) => onUpdateNote(item.id, n)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {draft.length > 0 && (
        <div className="od-footer">
          <div className="od-subtotal">
            <span>Subtotal</span>
            <span className="od-subtotal__value">{fmt(total)}</span>
          </div>
          <button
            className="od-confirm-btn"
            onClick={onConfirm}
            disabled={loading || draft.length === 0}
            aria-busy={loading}
          >
            {loading ? (
              <span className="od-spinner" aria-label="Placing order…" />
            ) : (
              <>
                Confirm Order
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function DraftItem({ item, onQty, onRemove, onNote }) {
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div className="od-item">
      <div className="od-item__main">
        <div className="od-item__info">
          <p className="od-item__name">{item.name}</p>
          <p className="od-item__unit">₱{Number(item.price).toFixed(2)} each</p>
        </div>

        <div className="od-item__controls">
          <button
            className="od-item__qty-btn"
            onClick={() => onQty(item.qty - 1)}
            aria-label={`Decrease ${item.name} quantity`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <span className="od-item__qty" aria-label={`Quantity: ${item.qty}`}>{item.qty}</span>
          <button
            className="od-item__qty-btn"
            onClick={() => onQty(item.qty + 1)}
            aria-label={`Increase ${item.name} quantity`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="od-item__right">
          <span className="od-item__line-total">{fmt(item.price * item.qty)}</span>
          <div className="od-item__actions">
            <button
              className={`od-item__note-btn${noteOpen || item.note ? ' od-item__note-btn--active' : ''}`}
              onClick={() => setNoteOpen((v) => !v)}
              aria-label={`${noteOpen ? 'Hide' : 'Add'} note for ${item.name}`}
              title="Add note"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <line x1="10" y1="9" x2="8" y2="9"/>
              </svg>
            </button>
            <button
              className="od-item__remove-btn"
              onClick={onRemove}
              aria-label={`Remove ${item.name} from order`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Note input (collapsible) */}
      {noteOpen && (
        <div className="od-item__note-wrap">
          <input
            className="od-item__note-input"
            type="text"
            placeholder="e.g. no onions, extra spicy…"
            value={item.note}
            onChange={(e) => onNote(e.target.value)}
            maxLength={120}
            aria-label={`Note for ${item.name}`}
          />
        </div>
      )}
    </div>
  );
}