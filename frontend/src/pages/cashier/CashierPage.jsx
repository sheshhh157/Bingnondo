import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { menuAPI, ordersAPI, paymentsAPI } from '../../services/api';
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
  const [view, setView] = useState(VIEWS.ORDER);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [draft, setDraft] = useState([]);          // [{...item, qty, note}]
  const [search, setSearch] = useState('');
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState('');
  const [paymentModal, setPaymentModal] = useState(null); // { orderId } | null
  const [placingOrder, setPlacingOrder] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastRef = useRef(null);

  // ─── Fetch menu ───────────────────────────────────────────────────
  const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError('');
    try {
      const { data } = await menuAPI.getAll();
      // data expected: { categories: [...], items: [...] }
      // or flat array — handle both shapes
      const cats = data.categories || [];
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

  useEffect(() => {
    fetchMenu();
  }, []);

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
    return () => {
      socket.off('menu_update');
    };
  }, []);

  // ─── Toast helper ──────────────────────────────────────────────────
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

  const removeItem = (id) => setDraft((prev) => prev.filter((d) => d.id !== id));

  const updateQty = (id, qty) => {
    if (qty < 1) { removeItem(id); return; }
    setDraft((prev) => prev.map((d) => d.id === id ? { ...d, qty } : d));
  };

  const updateNote = (id, note) => setDraft((prev) => prev.map((d) => d.id === id ? { ...d, note } : d));

  const clearDraft = () => setDraft([]);

  const draftTotal = draft.reduce((sum, d) => sum + d.price * d.qty, 0);

  // ─── Place Order (§2.2) ────────────────────────────────────────────
  const placeOrder = async () => {
    if (draft.length === 0) return;
    setPlacingOrder(true);
    try {
      const payload = {
        order_type: 'counter',
        cashier_id: user.id,
        items: draft.map(({ id, qty, note }) => ({ menu_item_id: id, quantity: qty, notes: note })),
      };
      const { data } = await ordersAPI.create(payload);
      showToast(`Order #${data.order_number || data.id} sent to kitchen!`);
      setPaymentModal({ orderId: data.id, orderNumber: data.order_number || data.id, total: draftTotal, draft: [...draft] });
      clearDraft();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to place order. Try again.';
      showToast(msg);
    } finally {
      setPlacingOrder(false);
    }
  };

  // ─── Filtered items ───────────────────────────────────────────────
  const visibleItems = menuItems.filter((item) => {
    const matchCat = activeCategory ? item.category_id === activeCategory : true;
    const matchSearch = search ? item.name.toLowerCase().includes(search.toLowerCase()) : true;
    return matchCat && matchSearch;
  });

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
                loading={placingOrder}
              />
            </aside>
          </div>
        ) : (
          <TransactionHistory />
        )}
      </main>

      {/* Payment Modal (§2.3) */}
      {paymentModal && (
        <PaymentModal
          orderId={paymentModal.orderId}
          orderNumber={paymentModal.orderNumber}
          total={paymentModal.total}
          draft={paymentModal.draft}
          onClose={() => setPaymentModal(null)}
          onSuccess={(method) => {
            showToast(`Payment via ${method} confirmed.`);
            setPaymentModal(null);
          }}
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