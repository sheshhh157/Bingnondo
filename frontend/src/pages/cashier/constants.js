// Shared cashier view identifiers. Kept in its own module so both
// CashierPage.jsx and CashierHeader.jsx can import it without a circular
// dependency (CashierPage imports the header component).
export const VIEWS = { ORDER: 'order', ONLINE: 'online' };

// Sub-tabs inside the Counter Orders view (the nav owns the top-level views).
export const COUNTER_TABS = { ORDER: 'order', HISTORY: 'history' };
