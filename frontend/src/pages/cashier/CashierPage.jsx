import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { menuAPI, ordersAPI } from '../../services/cashierApi';
import { connectSocket } from '../../services/socket';
import MenuGrid from './components/MenuGrid';
import OrderDraft from './components/OrderDraft';
import PaymentModal from './components/PaymentModal';
import CashierHeader from './components/CashierHeader';
import TransactionHistory from './components/TransactionHistory';
import { VIEWS } from './constants';
import '../../styles/CashierPage.css';

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
  const [paymentModal, setPaymentModal]   = useState(null);      // { quote, total, draft } | null
  const [placingOrder, setPlacingOrder]   = useState(false);
  // The signed quote from the last confirm: { quote_token, total, items }.
  // Holds no order id, because no order exists until payment succeeds.
  const [quote, setQuote]                 = useState(null);
  const [toastMsg, setToastMsg]           = useState('');
  const toastRef = useRef(null);
  const activeCategoryRef = useRef(null);
  // Below 1024px the menu and the order draft cannot share the screen
  // side by side, so exactly one of them is shown and this decides which.
  // Above that the CSS ignores it and shows both, as before.
  const [pane, setPane]                     = useState('menu');   // 'menu' | 'cart'

  // There is deliberately no "confirmed order" state here any more. Confirming
  // only issues a quote, so there is no order id or snapshotDraft to track —
  // the draft and the quote survive a closed payment modal on their own.

  // ─── Fetch menu ───────────────────────────────────────────────────
  // Runs on mount and on retry. The initial category is chosen with a
  // functional update so `activeCategory` is never read here: depending on it
  // rebuilt this callback on every tab change, which then forced the mount
  // effect below to omit it from its dependencies to avoid refetching the whole
  // menu each time the cashier switched tabs.
  const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError('');
    try {
      const { data } = await menuAPI.getAll();
      const cats  = data.categories || [];
      const items = data.items || (Array.isArray(data) ? data : []);
      setCategories(cats);
      setMenuItems(items);
      setActiveCategory((prev) => (prev === null && cats.length > 0 ? cats[0].id : prev));
    } catch {
      setMenuError('Failed to load menu. Please refresh.');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

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
  const clearDraft    = () => { setDraft([]); setQuote(null); setVariantPick(null); };
  // Authoritative total from the last quote, not the client's running sum.
  // The two agree in practice; if they ever don't, the server's number is the
  // one the payment is settled against, so it is what the cashier must see.
  const draftTotal    = quote ? quote.total : draft.reduce((sum, d) => sum + d.price * d.qty, 0);
  // Total units, not lines: "3 items" should read 3 when one line is qty 3.
  const draftQty     = draft.reduce((sum, d) => sum + d.qty, 0);

  // ─── Price the cart and open payment ───────────────────────────────
  // Named for what it used to do (create or update an order). It now only
  // quotes: nothing is persisted until the payment succeeds.
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

      // Price it, but write nothing. There is no order row from here until the
      // payment succeeds, so a customer who walks away leaves nothing behind.
      // Every confirm re-quotes, which keeps the quote a fresh replay guard
      // rather than a long-lived price lock.
      const { data } = await ordersAPI.quote({ items });
      setQuote(data);
      showToast('Order ready. Take payment to send it to the kitchen.');

      // Open the payment modal — draft and quote stay intact so the cashier can
      // close, change their mind, and re-open without re-pricing from scratch.
      setPaymentModal({ quote: data, total: data.total, draft: [...draft] });

    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to price this order. Try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  // ─── Payment success → clear everything ──────────────────────────
  const handlePaymentSuccess = (method, orderNumber) => {
    showToast(`Payment via ${method} confirmed${orderNumber ? ` — order #${orderNumber}` : ''}.`);
    setPaymentModal(null);
    clearDraft(); // now we clear — payment is done
    setPane('menu'); // on a phone the cart is the whole screen; go back to ordering
  };

  // ─── Close modal without paying ───────────────────────────────────
  // Nothing was written when the quote was issued, so there is nothing to undo
  // here — this is the case that used to strand a 'pending' order row in the
  // database. The draft and quote are kept so the cashier can re-open payment.
  const handleModalClose = () => {
    setPaymentModal(null);
  };

  // ─── Filtered items ───────────────────────────────────────────────
  const visibleItems = menuItems.filter((item) => {
    const matchCat    = activeCategory ? item.category_id === activeCategory : true;
    const matchSearch = search ? item.name.toLowerCase().includes(search.toLowerCase()) : true;
    return matchCat && matchSearch;
  });

  // ─── Confirm button label ─────────────────────────────────────────
  // Give the cashier a visual hint about what will happen on press.
  // One action, always: price the cart and open payment. There is no separate
  // "update" step any more — nothing is persisted until the money is in, so
  // there is no existing order to amend.
  const confirmLabel = 'Confirm Order';

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
                isConfirmed={!!quote}
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
          quote={paymentModal.quote}
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