// Shared formatting/status helpers for the manager dashboard.

export function currency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function stockStatus(current, reorder) {
  if (current <= 0) return 'out';
  if (current <= reorder) return 'low';
  return 'ok';
}

export const STATUS_LABEL = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  preparing: 'Preparing',
  confirmed: 'Confirmed',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  pending: 'Pending',
};

// Delivery status → Badge variant
export function deliveryBadgeVariant(status) {
  switch (status) {
    case 'delivered': return 'success';
    case 'out_for_delivery': return 'info';
    case 'ready': return 'success';
    case 'preparing': return 'gold';
    default: return 'muted';
  }
}

// Inventory status → Badge variant
export function stockBadgeVariant(status) {
  switch (status) {
    case 'ok': return 'success';
    case 'low': return 'warning';
    case 'out': return 'danger';
    default: return 'muted';
  }
}

// Kitchen order status → Badge variant
export function kitchenBadgeVariant(status) {
  return status === 'preparing' ? 'success' : 'gold';
}

// Normalize a live `order:new` socket payload (kitchen-order shape with
// `order_items: [{ quantity, menu_item: { name } }]`, no payment/total)
// into the `orders` array shape (`items`, `payment_method`, `total_amount`)
// so new live orders render correctly in charts, tables, and drill-downs.
// Payloads already in order shape pass through untouched.
export function normalizeLiveOrder(p) {
  if (!p || typeof p !== 'object') return null;
  if (Array.isArray(p.items)) return p;
  const items = (p.order_items || []).map((it) => ({
    name: it?.menu_item?.name || it?.name || 'Unknown',
    quantity: it?.quantity || 1,
    unit_price: it?.unit_price ?? null,
  }));
  return {
    ...p,
    items,
    payment_method: p.payment_method || 'cash',
    total_amount: p.total_amount ?? p.order_total ?? 0,
  };
}
