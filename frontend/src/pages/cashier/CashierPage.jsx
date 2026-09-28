import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { menuAPI, ordersAPI, paymentsAPI } from '../../services/cashierApi';
import { connectSocket, disconnectSocket } from '../../services/socket';
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
  const [draft, setDraft]                 = useState([]);        // [{ ...item, qty, note }]
  const [search, setSearch]               = useState('');
  const [menuLoading, setMenuLoading]     = useState(true);
  const [menuError, setMenuError]         = useState('');
  const [paymentModal, setPaymentModal]   = useState(null);      // { orderId, orderNumber, total, draft } | null
  const [placingOrder, setPlacingOrder]   = useState(false);
  const [toastMsg, setToastMsg]           = useState('');
  const toastRef = useRef(null);

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
  const addItem = (item) => {
    if (!item.is_available) return;
    setDraft((prev) => {
      const existing = prev.find((d) => d.id === item.id);
      if (existing) return prev.map((d) => d.id === item.id ? { ...d, qty: d.qty + 1 } : d);
      return [...prev, { ...item, qty: 1, note: '' }];
    });
  };

  const removeItem    = (id) => setDraft((prev) => prev.filter((d) => d.id !== id));
  const updateQty     = (id, qty) => { if (qty < 1) { removeItem(id); return; } setDraft((prev) => prev.map((d) => d.id === id ? { ...d, qty } : d)); };
  const updateNote    = (id, note) => setDraft((prev) => prev.map((d) => d.id === id ? { ...d, note } : d));
  const clearDraft    = () => { setDraft([]); setConfirmedOrder(null); };
  const draftTotal    = draft.reduce((sum, d) => sum + d.price * d.qty, 0);

  // ─── Draft changed since last confirm? ───────────────────────────
  // Simple check: compare sorted item ids+qty+note against the snapshot.
  const draftChangedSinceConfirm = () => {
    if (!confirmedOrder) return true; // never confirmed yet → treat as changed
    const snap  = confirmedOrder.snapshotDraft;
    if (snap.length !== draft.length) return true;
    return draft.some((d) => {
      const s = snap.find((x) => x.id === d.id);
      return !s || s.qty !== d.qty || s.note !== d.note;
    });
  };

  // ─── Place / Update Order ─────────────────────────────────────────
  const placeOrder = async () => {
    if (draft.length === 0) return;
    setPlacingOrder(true);
    try {
      const items = draft.map(({ id, qty, note }) => ({ menu_item_id: id, quantity: qty, notes: note }));

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
          // 409 = kitchen already acknowledged, items are locked
          if (patchErr?.status === 409) {
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
          <div className="cashier-workspace">
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