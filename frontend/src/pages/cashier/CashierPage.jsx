import { useState, useEffect, useRef, useCallback } from 'react';
import { menuAPI } from '../../services/cashierApi';
import { connectSocket } from '../../services/socket';
import { currency } from '../../utils/format';
import MenuGrid from './components/MenuGrid';
import OrderDraft from './components/OrderDraft';
import PaymentModal from './components/PaymentModal';
import CashierHeader from './components/CashierHeader';
import TransactionHistory from './components/TransactionHistory';
import OnlineOrdersPage from './OnlineOrdersPage';
import Pagination from '../../components/Pagination';
import { VIEWS, COUNTER_TABS } from './constants';
import '../../styles/CashierPage.css';

// Matches the `@container (min-width: 720px)` rule in CashierPage.css (query
// container is `.cashier-main`). Keep both values in sync.
const TWO_PANE_MIN_WIDTH = 720;
const MENU_PAGE_SIZE = 12;

export default function CashierPage({ view, onToggleSidebar, sidebarOpen, onOpenDrawer, drawerOpen }) {
  // ─── State ────────────────────────────────────────────────────────
  const [categories, setCategories]       = useState([]);
  const [menuItems, setMenuItems]         = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [draft, setDraft]                 = useState([]);        // [{ ...item, qty, note }]
  const [search, setSearch]               = useState('');
  const [menuLoading, setMenuLoading]     = useState(true);
  const [menuError, setMenuError]         = useState('');
  const [paymentModal, setPaymentModal]   = useState(null);      // { items, total, draft } | null
  const [toastMsg, setToastMsg]           = useState('');
  const toastRef = useRef(null);
  const workspaceRef = useRef(null);
  const orderPanelRef = useRef(null);
  const [twoPane, setTwoPane] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [counterTab, setCounterTab] = useState(COUNTER_TABS.ORDER);
  const [menuPage, setMenuPage] = useState(1);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  // ─── Toast helper ─────────────────────────────────────────────────
  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastMsg(''), 3000);
  };

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
      setActiveCategory((prev) => (prev == null && cats.length > 0 ? cats[0].id : prev));
    } catch {
      setMenuError('Failed to load menu. Please refresh.');
    } finally {
      setMenuLoading(false);
    }
  }, []);

  // Fetch once on mount. fetchMenu is stable (no deps), so it runs a single
  // time; the synchronous setMenuLoading inside it is intentional.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { fetchMenu(); }, [fetchMenu]);

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

  // ─── Workspace width → two-pane vs. bottom-sheet cart ────────────────
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      setTwoPane(width >= TWO_PANE_MIN_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // ─── Cart sheet: close when the layout becomes two-pane or cart empties
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (twoPane || draft.length === 0) setCartOpen(false);
  }, [twoPane, draft.length]);

  // ─── Cart sheet: focus trap, body scroll lock, Escape to close ────────
  useEffect(() => {
    if (!cartOpen) return undefined;
    const panel = orderPanelRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () => panel
      ? Array.from(panel.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        ))
      : [];
    focusables()[0]?.focus();

    const onKey = (e) => {
      if (e.defaultPrevented) return;   // already handled (e.g. an open note editor)
      if (e.key === 'Escape') { setCartOpen(false); return; }
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
    };
  }, [cartOpen]);

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
  const clearDraft    = () => setDraft([]);
  const draftTotal    = draft.reduce((sum, d) => sum + d.price * d.qty, 0);
  const draftCount    = draft.reduce((sum, d) => sum + d.qty, 0);

  // ─── Confirm Order ────────────────────────────────────────────────
  // Opening the payment modal writes NOTHING. The order is created (and paid)
  // only when the cashier completes payment in PaymentModal → ordersAPI.checkout.
  const placeOrder = () => {
    if (draft.length === 0) return;
    const items = draft.map(({ id, qty, note }) => ({ menu_item_id: id, quantity: qty, notes: note }));
    setPaymentModal({ items, total: draftTotal, draft: [...draft] });
  };

  // ─── Payment success → order was created paid; clear everything ──
  // `order` is the full checkout response (order_number, items, payment…),
  // which also feeds the printable receipt inside the modal.
  const handlePaymentSuccess = (order) => {
    const number = order?.order_number;
    const method = order?.payment?.method;
    showToast(number ? `Order #${number} paid via ${method}.` : `Payment confirmed.`);
    setPaymentModal(null);
    clearDraft(); // payment is done — safe to clear
  };

  // ─── Close modal without paying → nothing was written; keep draft ─
  const handleModalClose = () => {
    setPaymentModal(null);
    // draft intentionally left intact — no DB row exists yet
  };

  // ─── Filtered items ───────────────────────────────────────────────
  const visibleItems = menuItems.filter((item) => {
    const matchCat    = activeCategory ? item.category_id === activeCategory : true;
    const matchSearch = search.trim() ? item.name.toLowerCase().includes(search.trim().toLowerCase()) : true;
    const matchAvail  = showAvailableOnly ? item.is_available : true;
    return matchCat && matchSearch && matchAvail;
  });

  // Availability filter: clicking the active option again is a no-op.
  const setAvailabilityFilter = (availableOnly) => {
    setShowAvailableOnly(availableOnly);
    setMenuPage(1);
  };

  // Client-side pagination of the menu grid.
  const menuTotalPages = Math.max(1, Math.ceil(visibleItems.length / MENU_PAGE_SIZE));
  const menuSafePage   = Math.min(menuPage, menuTotalPages);
  const menuStart      = (menuSafePage - 1) * MENU_PAGE_SIZE;
  const pagedMenuItems = visibleItems.slice(menuStart, menuStart + MENU_PAGE_SIZE);

  return (
    <div className="cashier-root">
      <CashierHeader
        view={view}
        onToggleSidebar={onToggleSidebar}
        sidebarOpen={sidebarOpen}
        onOpenDrawer={onOpenDrawer}
        drawerOpen={drawerOpen}
      />

      <main className="cashier-main">
        {view === VIEWS.ORDER && (
          <div className="cashier-subtabs" role="tablist" aria-label="Counter orders sections">
            <button
              type="button"
              role="tab"
              aria-selected={counterTab === COUNTER_TABS.ORDER}
              className={`cashier-subtab${counterTab === COUNTER_TABS.ORDER ? ' cashier-subtab--active' : ''}`}
              onClick={() => setCounterTab(COUNTER_TABS.ORDER)}
            >
              New Order
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={counterTab === COUNTER_TABS.HISTORY}
              className={`cashier-subtab${counterTab === COUNTER_TABS.HISTORY ? ' cashier-subtab--active' : ''}`}
              onClick={() => setCounterTab(COUNTER_TABS.HISTORY)}
            >
              My Transactions
            </button>
          </div>
        )}

        <div className="cashier-content">
          {view === VIEWS.ORDER ? (
            counterTab === COUNTER_TABS.HISTORY ? (
              <TransactionHistory />
            ) : (
              <div
                className={`cashier-workspace${!twoPane && draft.length > 0 ? ' cashier-workspace--has-cart' : ''}`}
                ref={workspaceRef}
              >
            {/* Left: Menu */}
            <section className="cashier-menu-panel" aria-label="Menu">
              <div className="cashier-menu-toolbar">
                <div className="cashier-menu-toolbar__row">
                  <div className="cashier-search-wrap">
                    <svg className="cashier-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input
                      className="cashier-search"
                      type="search"
                      placeholder="Search menu…"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setActiveCategory(null); setMenuPage(1); }}
                      aria-label="Search menu items"
                    />
                  </div>

                  <div className="cashier-avail-toggle" role="group" aria-label="Filter menu by availability">
                    <button
                      type="button"
                      className={`cashier-avail-toggle__btn${!showAvailableOnly ? ' cashier-avail-toggle__btn--active' : ''}`}
                      onClick={() => setAvailabilityFilter(false)}
                      aria-pressed={!showAvailableOnly}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`cashier-avail-toggle__btn${showAvailableOnly ? ' cashier-avail-toggle__btn--active' : ''}`}
                      onClick={() => setAvailabilityFilter(true)}
                      aria-pressed={showAvailableOnly}
                    >
                      Available
                    </button>
                  </div>
                </div>

                {!search && categories.length > 0 && (
                  <nav className="cashier-categories" aria-label="Menu categories">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        className={`cashier-cat-btn${activeCategory === cat.id ? ' cashier-cat-btn--active' : ''}`}
                        onClick={() => { setActiveCategory(cat.id); setMenuPage(1); }}
                        aria-pressed={activeCategory === cat.id}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </nav>
                )}
              </div>

              <MenuGrid
                items={pagedMenuItems}
                loading={menuLoading}
                error={menuError}
                emptyMessage={showAvailableOnly ? 'No items available right now.' : 'Nothing here yet.'}
                onAdd={addItem}
                onRetry={fetchMenu}
                draft={draft}
              />

              {!menuLoading && !menuError && visibleItems.length > 0 && (
                <Pagination
                  label="Menu pagination"
                  page={menuSafePage}
                  totalPages={menuTotalPages}
                  total={visibleItems.length}
                  from={(menuSafePage - 1) * MENU_PAGE_SIZE + 1}
                  to={Math.min(menuSafePage * MENU_PAGE_SIZE, visibleItems.length)}
                  onPage={setMenuPage}
                />
              )}
            </section>

            {/* Narrow: sticky cart bar + backdrop for the order sheet */}
            {!twoPane && draft.length > 0 && (
              <button
                type="button"
                className="cashier-cart-bar"
                onClick={() => setCartOpen(true)}
                aria-label={`View order, ${draftCount} item(s), ${currency(draftTotal)}`}
              >
                <span className="cashier-cart-bar__cta">
                  <span className="cashier-cart-bar__count">{draftCount}</span>
                  View order
                </span>
                <span className="cashier-cart-bar__summary">
                  {draftCount} item{draftCount === 1 ? '' : 's'} • {currency(draftTotal)}
                </span>
              </button>
            )}

            {!twoPane && cartOpen && (
              <div
                className="cashier-cart-backdrop"
                onClick={() => setCartOpen(false)}
                aria-hidden="true"
              />
            )}

            {/* Right: Order Draft (two-pane) / bottom sheet (narrow) */}
            <aside
              className={`cashier-order-panel${cartOpen ? ' cashier-order-panel--open' : ''}`}
              aria-label="Current order"
              ref={orderPanelRef}
            >
              <OrderDraft
                draft={draft}
                total={draftTotal}
                onUpdateQty={updateQty}
                onUpdateNote={updateNote}
                onClear={clearDraft}
                onConfirm={placeOrder}
                onClose={!twoPane ? () => setCartOpen(false) : undefined}
              />
            </aside>
              </div>
            )
          ) : (
            <OnlineOrdersPage />
          )}
        </div>
      </main>

      {/* Payment Modal */}
      {paymentModal && (
        <PaymentModal
          items={paymentModal.items}
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