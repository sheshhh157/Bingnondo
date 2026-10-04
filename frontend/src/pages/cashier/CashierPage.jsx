import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { menuAPI, ordersAPI } from '../../services/cashierApi';
import { connectSocket } from '../../services/socket';
import MenuGrid from './components/MenuGrid';
import OrderDraft from './components/OrderDraft';
import PaymentModal from './components/PaymentModal';
import CashierHeader from './components/CashierHeader';
import TransactionHistory from './components/TransactionHistory';
import '../../styles/CashierPage.css';

export const VIEWS = { ORDER: 'order', HISTORY: 'history' };

export default function CashierPage() {
  const { user, logout } = useAuth();

  // ─── State ────────────────────────────────────────────────────────
  const [view, setView]                   = useState(VIEWS.ORDER);
  const [categories, setCategories]       = useState([]);
  const [menuItems, setMenuItems]         = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [draft, setDraft]                 = useState([]);        // [{ ...item, lineKey, menu_item_option_id, optionName, price, qty, note }]
  const [variantPick, setVariantPick]   = useState(null);      // { item, options } while choosing a variant
  const [search, setSearch]               = useState('');
  const [menuLoading, setMenuLoading]     = useState(true);
  const [menuError, setMenuError]         = useState('');
  const [paymentModal, setPaymentModal]   = useState(null);      // { orderId, orderNumber, total, draft } | null
  const [placingOrder, setPlacingOrder]   = useState(false);
  const [toastMsg, setToastMsg]           = useState('');
  const toastRef = useRef(null);
  const activeCategoryRef = useRef(null);
  // Below 1024px the menu and the order draft cannot share the screen
  // side by side, so exactly one of them is shown and this decides which.
  // Above that the CSS ignores it and shows both, as before.
  const [pane, setPane]                     = useState('menu');   // 'menu' | 'cart'

  // Track the last confirmed order so we can PATCH it instead of creating a new one
  const [confirmedOrder, setConfirmedOrder] = useState(null); // { id, orderNumber, snapshotDraft }
  // snapshotDraft = the draft at the moment the order was last sent to backend,
  // used to detect whether the cashier changed anything before re-confirming.

  // ─── Fetch menu ───────────────────────────────────────────────────
  const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError('');
    try {
      const { data } = await menuAPI.getAll();
      const cats  = data.categories || [];
      const items = data.items || (Array.isArray(data) ? data : []);
      setCategories(cats);
      setMenuItems(items);
      if (cats.length > 0 && !activeCategory) setActiveCategory(cats[0].id);
    } catch {
      setMenuError('Failed to load menu. Please refresh.');
    } finally {
      setMenuLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => { fetchMenu(); }, []);

  // Keep the selected category visible in the narrow, horizontally scrolling
  // tab row. On wider layouts the row does not overflow, so this is a no-op.
  useEffect(() => {
    if (!activeCategory) return;
    const node = activeCategoryRef.current;
    if (!node) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeCategory]);

  // ─── Socket: real-time menu updates ──────────────────────────────
  useEffect(() => {
    const socket = connectSocket();
    socket.on('menu_update', (updated) => {
      setMenuItems((prev) =>
        prev.map((item) =>
          item.id === updated.id ? { ...item, is_available: updated.is_available } : item
        )
      );
    });
    return () => { socket.off('menu_update'); };
  }, []);

  // ─── Toast helper ─────────────────────────────────────────────────
  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastMsg(''), 3000);
  };

  // ─── Cart operations ──────────────────────────────────────────────
  // A line is identified by the item AND the variant chosen for it, so
  // "Solo Tapsilog x1" and "Sharing Tapsilog x2" stay separate lines. Keying
  // on item id alone merged them and quietly charged one price for both.
  const lineKeyFor = (itemId, variantId, flavorId) =>
    [itemId, variantId, flavorId].filter((x) => x != null).join(':');

  // Clicking a variant-bearing item opens the picker instead of adding
  // straight away: there is no single price to fall back on.
  const addItem = (item, selection) => {
    if (!item.is_available) return;
    const options = item.options || [];
    const hasVariants = options.some((o) => o.option_kind !== 'flavor');
    const hasFlavors = options.some((o) => o.option_kind === 'flavor');
    if (selection === undefined && (hasVariants || hasFlavors)) {
      setVariantPick({ item });
      return;
    }
    const variant = selection?.variant || null;
    const flavor = selection?.flavor || null;
    const lineKey = lineKeyFor(item.id, variant?.id ?? null, flavor?.id ?? null);
    setVariantPick(null);
    setDraft((prev) => {
      const existing = prev.find((d) => d.lineKey === lineKey);
      if (existing) return prev.map((d) => (d.lineKey === lineKey ? { ...d, qty: d.qty + 1 } : d));
      return [...prev, {
        ...item,
        lineKey,
        menu_item_option_id: variant?.id ?? null,
        menu_item_flavor_id: flavor?.id ?? null,
        optionName: variant?.name ?? null,
        flavorName: flavor?.name ?? null,
        price: (variant ? Number(variant.price) : Number(item.price)) + (flavor ? Number(flavor.price) : 0),
        qty: 1,
        note: '',
      }];
    });
  };

  const removeItem    = (lineKey) => setDraft((prev) => prev.filter((d) => d.lineKey !== lineKey));
  const updateQty     = (lineKey, qty) => { if (qty < 1) { removeItem(lineKey); return; } setDraft((prev) => prev.map((d) => (d.lineKey === lineKey ? { ...d, qty } : d))); };
  const updateNote    = (lineKey, note) => setDraft((prev) => prev.map((d) => (d.lineKey === lineKey ? { ...d, note } : d)));
  const clearDraft    = () => { setDraft([]); setConfirmedOrder(null); setVariantPick(null); };
  const draftTotal    = draft.reduce((sum, d) => sum + d.price * d.qty, 0);
  // Total units, not lines: "3 items" should read 3 when one line is qty 3.
  const draftQty     = draft.reduce((sum, d) => sum + d.qty, 0);

  //  ─── Draft changed since last confirm? ───────────────────────────
  // Simple check: compare sorted line keys+qty+note against the snapshot.
  // lineKey, not id: switching a variant (Solo to Sharing, Hot to Iced) is a
  // different line, so it has to count as a change or the PATCH would be
  // skipped and the kitchen would make the item the cashier had just replaced.
  const draftChangedSinceConfirm = () => {
    if (!confirmedOrder) return true; // never confirmed yet → treat as changed
    const snap  = confirmedOrder.snapshotDraft;
    if (snap.length !== draft.length) return true;
    return draft.some((d) => {
      const s = snap.find((x) => x.lineKey === d.lineKey);
      return !s || s.qty !== d.qty || s.note !== d.note;
    });
  };

  // ─── Place / Update Order ─────────────────────────────────────────
  const placeOrder = async () => {
    if (draft.length === 0) return;
    setPlacingOrder(true);
    try {
      const items = draft.map(({ id, menu_item_option_id, menu_item_flavor_id, qty, note }) => ({
      menu_item_id: id,
      menu_item_option_id: menu_item_option_id ?? null,
      menu_item_flavor_id: menu_item_flavor_id ?? null,
      quantity: qty,
      notes: note,
    }));

      let orderId, orderNumber;

      if (confirmedOrder && !draftChangedSinceConfirm()) {
        // Nothing changed — just re-open the payment modal for the same order
        orderId     = confirmedOrder.id;
        orderNumber = confirmedOrder.orderNumber;
      } else if (confirmedOrder && draftChangedSinceConfirm()) {
        // Draft was edited — PATCH the existing order's items
        try {
          await ordersAPI.updateItems(confirmedOrder.id, items);
          orderId     = confirmedOrder.id;
          orderNumber = confirmedOrder.orderNumber;
          setConfirmedOrder({ id: orderId, orderNumber, snapshotDraft: [...draft] });
          showToast(`Order #${orderNumber} updated!`);
        } catch (patchErr) {
          // 409 has two distinct meanings here, and conflating them is harmful:
          //
          //   a) the kitchen acknowledged the order -> items are locked, but the
          //      cashier still needs to settle it, so carrying on to payment is right;
          //   b) payment was already collected -> the money is taken and the price
          //      is settled. Telling the cashier to "proceed to payment" here is
          //      exactly wrong, and invites a second attempt at an already-paid order.
          //
          // The backend sends a specific message for each, so branch on it.
          const message = patchErr?.response?.data?.message || '';
          if (patchErr?.status === 409 && /payment has already been collected/i.test(message)) {
            // Price is settled by the money already taken. Drop the edits and
            // send the cashier straight back to the order as it stands.
            setDraft(confirmedOrder.snapshotDraft);
            showToast(message);
            setConfirmedOrder(null);
          } else if (patchErr?.status === 409) {
            showToast(`Kitchen already started #${confirmedOrder.orderNumber} — items are locked. Proceed to payment.`);
            orderId     = confirmedOrder.id;
            orderNumber = confirmedOrder.orderNumber;
            // Revert draft to the last confirmed snapshot so totals match
            setDraft(confirmedOrder.snapshotDraft);
          } else {
            throw patchErr;
          }
        }
      } else {
        // Brand new order — POST
        const { data } = await ordersAPI.create({ order_type: 'counter', cashier_id: user?.sub || user?.id, items });
        orderId     = data.id;
        orderNumber = data.order_number || data.id;
        setConfirmedOrder({ id: orderId, orderNumber, snapshotDraft: [...draft] });
        showToast(`Order #${orderNumber} sent to kitchen!`);
      }

      // Open the payment modal — draft stays intact so cashier can come back
      setPaymentModal({ orderId, orderNumber, total: draftTotal, draft: [...draft] });

    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to place order. Try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  // ─── Payment success → clear everything ──────────────────────────
  const handlePaymentSuccess = (method) => {
    showToast(`Payment via ${method} confirmed. `);
    setPaymentModal(null);
    clearDraft(); // now we clear — payment is done
    setPane('menu'); // on a phone the cart is the whole screen; go back to ordering
  };

  // ─── Close modal without paying → keep draft & confirmedOrder ────
  const handleModalClose = () => {
    setPaymentModal(null);
    // draft and confirmedOrder are intentionally left intact
  };

  // ─── Filtered items ───────────────────────────────────────────────
  const visibleItems = menuItems.filter((item) => {
    const matchCat    = activeCategory ? item.category_id === activeCategory : true;
    const matchSearch = search ? item.name.toLowerCase().includes(search.toLowerCase()) : true;
    return matchCat && matchSearch;
  });

  // ─── Confirm button label ─────────────────────────────────────────
  // Give the cashier a visual hint about what will happen on press.
  const confirmLabel = (() => {
    if (!confirmedOrder) return 'Confirm Order';
    if (draftChangedSinceConfirm()) return 'Update Order';
    return 'Open Payment'; // nothing changed, just reopen
  })();

  return (
    <div className="cashier-root">
      <CashierHeader
        user={user}
        view={view}
        onViewChange={setView}
        onLogout={logout}
        draftCount={draft.length}
      />

      <main className="cashier-main">
        {view === VIEWS.ORDER ? (
          <div className={`cashier-workspace cashier-workspace--${pane}`}>
            {/* Left: Menu */}
            <section className="cashier-menu-panel" aria-label="Menu">
              <div className="cashier-menu-toolbar">
                <div className="cashier-search-wrap">
                  <svg className="cashier-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    className="cashier-search"
                    type="search"
                    placeholder="Search menu…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setActiveCategory(null); }}
                    aria-label="Search menu items"
                  />
                </div>

                {!search && categories.length > 0 && (
                  <nav className="cashier-categories" aria-label="Menu categories">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        ref={activeCategory === cat.id ? activeCategoryRef : null}
                        className={`cashier-cat-btn${activeCategory === cat.id ? ' cashier-cat-btn--active' : ''}`}
                        onClick={() => setActiveCategory(cat.id)}
                        aria-pressed={activeCategory === cat.id}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </nav>
                )}
              </div>

              <MenuGrid
                items={visibleItems}
                loading={menuLoading}
                error={menuError}
                onAdd={addItem}
                onRetry={fetchMenu}
                draft={draft}
              />
            </section>

            {/* Right: Order Draft */}
            <aside className="cashier-order-panel" aria-label="Current order">
              <OrderDraft
                draft={draft}
                total={draftTotal}
                onUpdateQty={updateQty}
                onRemove={removeItem}
                onUpdateNote={updateNote}
                onClear={clearDraft}
                onConfirm={placeOrder}
                confirmLabel={confirmLabel}
                isConfirmed={!!confirmedOrder}
                loading={placingOrder}
              />
            </aside>
          </div>
        ) : (
          <TransactionHistory />
        )}
      </main>

      {/* Cart bar — narrow screens only, where the draft is a pane of its own.
          Carries the count and total so it is always one tap from the order. */}
      {view === VIEWS.ORDER && (
        <div className="cashier-cartbar">
          <button
            type="button"
            className="cashier-cartbar__btn"
            onClick={() => setPane(pane === 'menu' ? 'cart' : 'menu')}
            aria-label={pane === 'menu' ? 'Show current order' : 'Back to menu'}
          >
            <span className="cashier-cartbar__label">
              {pane === 'menu' ? 'View order' : 'Back to menu'}
            </span>
            {pane === 'menu' && (
              <span className="cashier-cartbar__meta">
                {draftQty} {draftQty === 1 ? 'item' : 'items'} · ₱{draftTotal.toFixed(2)}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Variant picker — Hot / Iced, Solo / Sharing and friends */}
      {variantPick && (
        <VariantPicker
          item={variantPick.item}
          onPick={(selection) => addItem(variantPick.item, selection)}
          onClose={() => setVariantPick(null)}
        />
      )}

      {/* Payment Modal */}
      {paymentModal && (
        <PaymentModal
          orderId={paymentModal.orderId}
          orderNumber={paymentModal.orderNumber}
          total={paymentModal.total}
          draft={paymentModal.draft}
          onClose={handleModalClose}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="cashier-toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// ─── Variant picker ────────────────────────────────────────────────────────
// Shown when the cashier taps an item that has options (Hot / Iced, Solo /
// Sharing, sizes, flavours). There is deliberately no preselected option: guessing one would
// quietly charge the wrong price, which is exactly what variants exist to
// prevent. The backend also refuses an optionless order for such an item, so
// this dialog is the only way through.
function VariantPicker({ item, onPick, onClose }) {
  const options  = item.options || [];
  const variants = options.filter((o) => o.option_kind !== 'flavor' && o.is_available !== false);
  const flavors  = options.filter((o) => o.option_kind === 'flavor' && o.is_available !== false);
  const [variant, setVariant] = useState(null);
  const [flavor,  setFlavor]  = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const needsVariant = variants.length > 0;
  const ready = !needsVariant || variant != null;
  // Flavor prices stack on top of the variant (or base) price — the preview
  // shows exactly what the line will charge.
  const total = (variant ? Number(variant.price) : Number(item.price)) + (flavor ? Number(flavor.price) : 0);

  // Only one decision to make (just a variant, or just a flavor): tapping the
  // choice adds the line straight away, like before. Two decisions need the
  // explicit Add button so the cashier can set both before committing.
  const singleDecision = (needsVariant && flavors.length === 0) || (!needsVariant && flavors.length > 0);

  const optionButton = (opt, kind) => (
    <button
      key={opt.id}
      type="button"
      className="cashier-variant__opt"
      onClick={() => {
        if (singleDecision) {
          onPick(kind === 'variant' ? { variant: opt, flavor: null } : { variant: null, flavor: opt });
        } else if (kind === 'variant') {
          setVariant(opt);
        } else {
          setFlavor(opt);
        }
      }}
    >
      <span className="cashier-variant__name">{opt.name}</span>
      <span className="cashier-variant__price">
        {kind === 'flavor' ? `+₱${Number(opt.price).toFixed(2)}` : `₱${Number(opt.price).toFixed(2)}`}
      </span>
    </button>
  );

  return (
    <div className="cashier-variant-overlay" onClick={onClose}>
      <div
        className="cashier-variant"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashier-variant-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="cashier-variant-title" className="cashier-variant__title">
          {item.name}
        </h3>

        {variants.length > 0 && (
          <>
            <p className="cashier-variant__hint">Choose {variants.map((v) => v.name).join(' or ')}</p>
            <div className="cashier-variant__list">
              {variants.map((v) => optionButton(v, 'variant'))}
            </div>
          </>
        )}

        {flavors.length > 0 && (
          <>
            <p className="cashier-variant__hint">Flavor {singleDecision ? '' : '(optional)'}</p>
            <div className="cashier-variant__list">
              {flavors.map((f) => optionButton(f, 'flavor'))}
              {!singleDecision && (
                <button type="button" className="cashier-variant__opt" onClick={() => setFlavor(null)}>
                  <span className="cashier-variant__name">No flavor</span>
                  <span className="cashier-variant__price">+₱0.00</span>
                </button>
              )}
              {!needsVariant && singleDecision && (
                <button type="button" className="cashier-variant__opt" onClick={() => onPick({ variant: null, flavor: null })}>
                  <span className="cashier-variant__name">No flavor</span>
                  <span className="cashier-variant__price">₱{Number(item.price).toFixed(2)}</span>
                </button>
              )}
            </div>
          </>
        )}

        {!singleDecision && (
          <>
            <p className="cashier-variant__hint">Total: ₱{total.toFixed(2)}</p>
            <button
              type="button"
              className="cashier-variant__cancel"
              disabled={!ready}
              onClick={() => onPick({ variant, flavor })}
            >
              Add{ready ? ` — ₱${total.toFixed(2)}` : ''}
            </button>
          </>
        )}

        <button type="button" className="cashier-variant__cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}