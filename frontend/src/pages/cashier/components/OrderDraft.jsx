import { useState, useEffect, useRef } from 'react';
import '../../../styles/OrderDraft.css';

const fmt = (n) => `₱${Number(n).toFixed(2)}`;

const TrashIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const NoteIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

export default function OrderDraft({
  draft,
  total,
  onUpdateQty,
  onUpdateNote,
  onClear,
  onConfirm,
  onClose,
  confirmLabel = 'Confirm Order',
  loading,
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [openNoteId, setOpenNoteId] = useState(null);   // only one note editor at a time
  const clearBtnRef = useRef(null);
  const clearPanelRef = useRef(null);
  const itemCount = draft.reduce((s, d) => s + d.qty, 0);

  // Close the open note editor if its item was removed or the cart was cleared.
  // Adjusting state during render is React's recommended pattern for this.
  if (openNoteId != null && !draft.some((d) => d.id === openNoteId)) {
    setOpenNoteId(null);
  }

  const closeConfirm = (restoreFocus = true) => {
    setConfirmClear(false);
    if (restoreFocus) requestAnimationFrame(() => clearBtnRef.current?.focus?.());
  };

  const handleClear = () => {
    onClear();
    setConfirmClear(false);
  };

  // Clear-confirmation dialog: lock page scroll and move focus inside.
  useEffect(() => {
    if (!confirmClear) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    clearPanelRef.current?.querySelector('.cdr-modal__cancel')?.focus?.();
    return () => { document.body.style.overflow = prevOverflow; };
  }, [confirmClear]);

  // Escape + focus trap, handled locally so it never bubbles to the sheet.
  const onDialogKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeConfirm(); return; }
    if (e.key !== 'Tab') return;
    const panel = clearPanelRef.current;
    if (!panel) return;
    const f = Array.from(panel.querySelectorAll(
      'button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex="-1"])'
    ));
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="cdr-root">
      {onClose && <div className="cdr-sheet-handle" aria-hidden="true" />}

      <header className="cdr-header">
        <div className="cdr-header__heading">
          <h2 className="cdr-header__title">Current Order</h2>
          {itemCount > 0 && (
            <span className="cdr-header__count">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {draft.length > 0 && (
          <button
            ref={clearBtnRef}
            className="cdr-clear-btn"
            onClick={() => setConfirmClear(true)}
          >
            <TrashIcon size={13} />
            Clear
          </button>
        )}
      </header>

      <div className="cdr-items" aria-label="Order items" aria-live="polite">
        {draft.length === 0 ? (
          <div className="cdr-empty">
            <span className="cdr-empty__icon" aria-hidden="true">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="21" r="1"/>
                <circle cx="19" cy="21" r="1"/>
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
              </svg>
            </span>
            <p className="cdr-empty__title">Your order is empty</p>
            <p className="cdr-empty__text">Tap items on the menu to add them here.</p>
          </div>
        ) : (
          draft.map((item) => (
            <DraftItem
              key={item.id}
              item={item}
              noteOpen={openNoteId === item.id}
              onOpenNote={() => setOpenNoteId(item.id)}
              onCloseNote={() => setOpenNoteId(null)}
              onQty={(q) => onUpdateQty(item.id, q)}
              onNote={(n) => onUpdateNote(item.id, n)}
            />
          ))
        )}
      </div>

      {draft.length > 0 && (
        <footer className="cdr-footer">
          <div className="cdr-subtotal">
            <span className="cdr-subtotal__label">Subtotal</span>
            <span className="cdr-subtotal__value">{fmt(total)}</span>
          </div>
          <button
            className="cdr-confirm-btn"
            onClick={onConfirm}
            disabled={loading || draft.length === 0}
            aria-busy={loading}
          >
            {loading ? (
              <span className="cdr-spinner" aria-label="Placing order…" />
            ) : (
              <>
                {confirmLabel}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </>
            )}
          </button>
          {onClose && (
            <button className="cdr-back-btn" onClick={onClose}>
              Back to menu
            </button>
          )}
        </footer>
      )}

      {confirmClear && (
        <div
          className="cdr-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cdr-clear-title"
          onKeyDown={onDialogKeyDown}
          onClick={(e) => { if (e.target === e.currentTarget) closeConfirm(); }}
        >
          <div className="cdr-modal__panel" ref={clearPanelRef}>
            <div className="cdr-modal__icon" aria-hidden="true">
              <TrashIcon size={22} />
            </div>
            <h2 id="cdr-clear-title" className="cdr-modal__title">Clear this order?</h2>
            <p className="cdr-modal__text">
              This removes all {itemCount} item{itemCount === 1 ? '' : 's'} from the current
              order. This can&rsquo;t be undone.
            </p>
            <div className="cdr-modal__actions">
              <button className="cdr-modal__cancel" onClick={() => closeConfirm()}>Cancel</button>
              <button className="cdr-modal__confirm" onClick={handleClear}>Clear order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftItem({ item, noteOpen, onOpenNote, onCloseNote, onQty, onNote }) {
  const noteBtnRef = useRef(null);
  const textareaRef = useRef(null);
  const noteId = `cdr-note-${item.id}`;
  const hasNote = Boolean(item.note);

  const closeNote = () => {
    onCloseNote();
    requestAnimationFrame(() => noteBtnRef.current?.focus?.());
  };

  const toggleNote = () => {
    if (noteOpen) closeNote();
    else onOpenNote();
  };

  // Focus the editor (cursor at end) as soon as it opens; keep it visible on
  // phones so the on-screen keyboard can't cover it.
  useEffect(() => {
    if (!noteOpen) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const end = ta.value.length;
    try { ta.setSelectionRange(end, end); } catch { /* not supported */ }
    if (window.matchMedia('(max-width: 767px)').matches) {
      requestAnimationFrame(() => ta.scrollIntoView({ block: 'nearest' }));
    }
  }, [noteOpen]);

  const onNoteKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    closeNote();
  };

  return (
    <article className="cdr-item">
      <div className="cdr-item__top">
        <div className="cdr-item__meta">
          <p className="cdr-item__name">{item.name}</p>
          <p className="cdr-item__unit">{fmt(item.price)} each</p>
        </div>
        <span className="cdr-item__line-total">{fmt(item.price * item.qty)}</span>
      </div>

      <div className="cdr-item__bottom">
        <div className="cdr-item__stepper">
          <button
            className="cdr-item__qty-btn"
            onClick={() => onQty(item.qty - 1)}
            disabled={item.qty <= 1}
            aria-label={`Decrease ${item.name} quantity`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <span className="cdr-item__qty" aria-label={`Quantity: ${item.qty}`}>{item.qty}</span>
          <button
            className="cdr-item__qty-btn"
            onClick={() => onQty(item.qty + 1)}
            aria-label={`Increase ${item.name} quantity`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        <div className="cdr-item__actions">
          <button
            ref={noteBtnRef}
            type="button"
            className={`cdr-item__note-btn${hasNote ? ' cdr-item__note-btn--active' : ''}`}
            onClick={toggleNote}
            aria-label={hasNote ? `Edit note for ${item.name}` : `Add note for ${item.name}`}
            title={hasNote ? 'Edit note' : 'Add note'}
            aria-expanded={noteOpen}
            aria-controls={noteId}
          >
            <NoteIcon size={15} />
            {hasNote && <span className="cdr-item__note-dot" aria-hidden="true" />}
          </button>

          <button
            className="cdr-item__remove"
            onClick={() => onQty(0)}
            aria-label={`Remove ${item.name}`}
            title="Remove item"
          >
            <TrashIcon size={15} />
          </button>
        </div>
      </div>

      {hasNote && !noteOpen && (
        <button
          type="button"
          className="cdr-item__note-preview"
          onClick={onOpenNote}
          aria-label={`Edit note for ${item.name}`}
          title={item.note}
        >
          <span className="cdr-item__note-preview-icon" aria-hidden="true">
            <NoteIcon size={12} />
          </span>
          <span className="cdr-item__note-text">{item.note}</span>
        </button>
      )}

      <div className={`cdr-item__note-collapse${noteOpen ? ' cdr-item__note-collapse--open' : ''}`}>
        <div className="cdr-item__note-collapse-inner">
          <div
            id={noteId}
            className="cdr-item__note-edit"
            role="group"
            aria-label={`Note for ${item.name}`}
            onKeyDown={onNoteKeyDown}
            inert={!noteOpen}
          >
            <div className="cdr-item__note-head">
              <span className="cdr-item__note-label">Note</span>
              <button
                type="button"
                className="cdr-item__note-done"
                onClick={closeNote}
              >
                Done
              </button>
            </div>
            <div className="cdr-item__note-field">
              <textarea
                ref={textareaRef}
                className="cdr-item__note-input"
                rows={2}
                placeholder="e.g. no onions, extra spicy…"
                value={item.note}
                onChange={(e) => onNote(e.target.value)}
                maxLength={120}
                aria-label={`Note for ${item.name}`}
              />
              <span className="cdr-item__note-count" aria-hidden="true">{item.note.length}/120</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
