// ─── Manager Backend — Mutable Data Store with Simulated Events ──────────────
// Provides read-only accessors (for REST) and mutators (for write endpoints +
// socket-driven simulated events). Data is in-memory and resets on restart.
//
// One shared delivery store feeds two views:
//   - /api/deliveries (staff)      → rich shape  { id, status, order: {...} }
//   - /api/manager/deliveries      → flat shape  { id, order_number, customer, ... }

const today = new Date();
const hrsAgo = (h) => new Date(today.getTime() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d, h = 12) => new Date(today.getTime() - d * 24 * 60 * 60 * 1000 - h * 60 * 60 * 1000).toISOString();
const minsAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

let nextOrderId = 4100;
let nextDeliveryId = 6;
let nextLineId = 1;
let nextMenuItemId = 24;

// ─── Menu ────────────────────────────────────────────────────────────────────
const menuCategories = [
  { id: 1, name: 'Silog Meals' },
  { id: 2, name: 'Rice Meals' },
  { id: 3, name: 'Merienda' },
  { id: 4, name: 'Drinks' },
  { id: 5, name: 'Add-ons' },
];

const menuItems = [
  // Silog Meals
  { id: 1,  category_id: 1, name: 'Tapsilog',      description: 'Beef tapa, sinangag, itlog',      price: 120, is_available: true,  image_url: null },
  { id: 2,  category_id: 1, name: 'Longsilog',     description: 'Longganisa, sinangag, itlog',     price: 110, is_available: true,  image_url: null },
  { id: 3,  category_id: 1, name: 'Tocilog',       description: 'Tocino, sinangag, itlog',         price: 110, is_available: true,  image_url: null },
  { id: 4,  category_id: 1, name: 'Bangsilog',     description: 'Bangus, sinangag, itlog',         price: 130, is_available: true,  image_url: null },
  { id: 5,  category_id: 1, name: 'Spamsilog',     description: 'Spam, sinangag, itlog',           price: 140, is_available: false, image_url: null },
  { id: 6,  category_id: 1, name: 'Cornsilog',     description: 'Corned beef, sinangag, itlog',    price: 115, is_available: true,  image_url: null },

  // Rice Meals
  { id: 7,  category_id: 2, name: 'Adobo Rice',    description: 'Chicken adobo with steamed rice', price: 105, is_available: true,  image_url: null },
  { id: 8,  category_id: 2, name: 'Sinigang Set',  description: 'Pork sinigang with rice',         price: 150, is_available: true,  image_url: null },
  { id: 9,  category_id: 2, name: 'Fried Chicken', description: 'Crispy fried chicken with rice',  price: 135, is_available: true,  image_url: null },
  { id: 10, category_id: 2, name: 'Bistek Rice',   description: 'Beef bistek with steamed rice',   price: 145, is_available: false, image_url: null },

  // Merienda
  { id: 11, category_id: 3, name: 'Pancit Bihon',     description: 'Stir-fried rice noodles',         price: 75,  is_available: true,  image_url: null },
  { id: 12, category_id: 3, name: 'Lumpiang Shanghai', description: '5 pcs with sweet chili sauce',    price: 65,  is_available: true,  image_url: null },
  { id: 13, category_id: 3, name: 'Goto',               description: 'Rice congee with beef tripe',     price: 85,  is_available: true,  image_url: null },
  { id: 14, category_id: 3, name: 'Arroz Caldo',        description: 'Chicken congee with ginger',      price: 80,  is_available: true,  image_url: null },

  // Drinks
  { id: 15, category_id: 4, name: 'Coke Regular',    description: '12oz bottle',       price: 40,  is_available: true,  image_url: null },
  { id: 16, category_id: 4, name: 'Coke Zero',       description: '12oz bottle',       price: 40,  is_available: true,  image_url: null },
  { id: 17, category_id: 4, name: 'Iced Tea',        description: 'House blend, 16oz', price: 45,  is_available: true,  image_url: null },
  { id: 18, category_id: 4, name: 'Bottled Water',   description: '500ml',             price: 25,  is_available: true,  image_url: null },
  { id: 19, category_id: 4, name: 'Pineapple Juice', description: 'Fresh, 16oz',       price: 55,  is_available: true,  image_url: null },
  { id: 20, category_id: 4, name: 'Hot Coffee',      description: 'Brewed coffee',     price: 60,  is_available: true,  image_url: null },

  // Add-ons
  { id: 21, category_id: 5, name: 'Extra Rice',  description: '', price: 20, is_available: true, image_url: null },
  { id: 22, category_id: 5, name: 'Extra Egg',   description: '', price: 20, is_available: true, image_url: null },
  { id: 23, category_id: 5, name: 'Extra Sauce', description: '', price: 10, is_available: true, image_url: null },
];

// ─── Orders / sales ────────────────────────────────────────────────────────
const orders = [
  { id: 1001, order_number: 'ORD-1001', status: 'completed', payment_method: 'cash',  total_amount: 240, created_at: hrsAgo(1),  items: [{ name: 'Tapsilog', quantity: 1, unit_price: 120 }, { name: 'Iced Tea', quantity: 1, unit_price: 45 }, { name: 'Extra Rice', quantity: 1, unit_price: 20 }, { name: 'Coke Regular', quantity: 1, unit_price: 40 }] },
  { id: 1002, order_number: 'ORD-1002', status: 'completed', payment_method: 'gcash', total_amount: 175, created_at: hrsAgo(2),  items: [{ name: 'Longsilog', quantity: 1, unit_price: 110 }, { name: 'Bottled Water', quantity: 1, unit_price: 25 }, { name: 'Extra Egg', quantity: 1, unit_price: 20 }] },
  { id: 1003, order_number: 'ORD-1003', status: 'preparing', payment_method: 'cash',  total_amount: 285, created_at: hrsAgo(0.25), items: [{ name: 'Sinigang Set', quantity: 1, unit_price: 150 }, { name: 'Iced Tea', quantity: 1, unit_price: 45 }, { name: 'Lumpiang Shanghai', quantity: 1, unit_price: 65 }] },
  { id: 1004, order_number: 'ORD-1004', status: 'completed', payment_method: 'cash',  total_amount: 130, created_at: hrsAgo(3),  items: [{ name: 'Goto', quantity: 1, unit_price: 85 }, { name: 'Extra Rice', quantity: 1, unit_price: 20 }, { name: 'Hot Coffee', quantity: 1, unit_price: 60 }] },
  { id: 1005, order_number: 'ORD-1005', status: 'cancelled', payment_method: 'cash',  total_amount: 110, created_at: hrsAgo(4),  items: [{ name: 'Tocilog', quantity: 1, unit_price: 110 }] },

  { id: 2001, order_number: 'ORD-2001', status: 'completed', payment_method: 'cash',  total_amount: 320, created_at: daysAgo(1),  items: [{ name: 'Sinigang Set', quantity: 2, unit_price: 150 }, { name: 'Iced Tea', quantity: 1, unit_price: 45 }] },
  { id: 2002, order_number: 'ORD-2002', status: 'completed', payment_method: 'gcash', total_amount: 190, created_at: daysAgo(1, 16), items: [{ name: 'Bangsilog', quantity: 1, unit_price: 130 }, { name: 'Extra Rice', quantity: 1, unit_price: 20 }, { name: 'Pineapple Juice', quantity: 1, unit_price: 55 }] },
  { id: 2003, order_number: 'ORD-2003', status: 'completed', payment_method: 'cash',  total_amount: 240, created_at: daysAgo(2),  items: [{ name: 'Fried Chicken', quantity: 1, unit_price: 135 }, { name: 'Pancit Bihon', quantity: 1, unit_price: 75 }, { name: 'Coke Regular', quantity: 1, unit_price: 40 }] },
  { id: 2004, order_number: 'ORD-2004', status: 'completed', payment_method: 'cash',  total_amount: 150, created_at: daysAgo(2, 15), items: [{ name: 'Spamsilog', quantity: 1, unit_price: 140 }, { name: 'Bottled Water', quantity: 1, unit_price: 25 }] },
  { id: 2005, order_number: 'ORD-2005', status: 'completed', payment_method: 'gcash', total_amount: 265, created_at: daysAgo(3),  items: [{ name: 'Adobo Rice', quantity: 2, unit_price: 105 }, { name: 'Iced Tea', quantity: 1, unit_price: 45 }, { name: 'Extra Egg', quantity: 1, unit_price: 20 }] },
  { id: 2006, order_number: 'ORD-2006', status: 'completed', payment_method: 'cash',  total_amount: 210, created_at: daysAgo(4),  items: [{ name: 'Lumpiang Shanghai', quantity: 2, unit_price: 65 }, { name: 'Sinigang Set', quantity: 1, unit_price: 150 }] },
  { id: 2007, order_number: 'ORD-2007', status: 'completed', payment_method: 'cash',  total_amount: 180, created_at: daysAgo(5),  items: [{ name: 'Goto', quantity: 1, unit_price: 85 }, { name: 'Tapsilog', quantity: 1, unit_price: 120 }] },
  { id: 2008, order_number: 'ORD-2008', status: 'completed', payment_method: 'gcash', total_amount: 300, created_at: daysAgo(6),  items: [{ name: 'Bistek Rice', quantity: 1, unit_price: 145 }, { name: 'Arroz Caldo', quantity: 1, unit_price: 80 }, { name: 'Coke Zero', quantity: 1, unit_price: 40 }] },
];

// ─── Inventory ──────────────────────────────────────────────────────────────
const inventory = [
  { id: 1,  name: 'Beef Tapa',       unit: 'g',   current_stock: 2400, reorder_level: 500  },
  { id: 2,  name: 'Longganisa',      unit: 'pcs', current_stock: 80,   reorder_level: 20   },
  { id: 3,  name: 'Tocino',          unit: 'g',   current_stock: 1800, reorder_level: 400  },
  { id: 4,  name: 'Bangus',          unit: 'pcs', current_stock: 12,   reorder_level: 10   },
  { id: 5,  name: 'Spam',            unit: 'can', current_stock: 4,    reorder_level: 6    },
  { id: 6,  name: 'Corned Beef',     unit: 'can', current_stock: 18,   reorder_level: 6    },
  { id: 7,  name: 'Chicken',         unit: 'g',   current_stock: 3200, reorder_level: 800  },
  { id: 8,  name: 'Pork',            unit: 'g',   current_stock: 0,    reorder_level: 600  },
  { id: 9,  name: 'Eggs',            unit: 'pcs', current_stock: 55,   reorder_level: 24   },
  { id: 10, name: 'Jasmine Rice',    unit: 'kg',  current_stock: 22,   reorder_level: 5    },
  { id: 11, name: 'Garlic',          unit: 'g',   current_stock: 350,  reorder_level: 150  },
  { id: 12, name: 'Cooking Oil',     unit: 'ml',  current_stock: 1200, reorder_level: 500  },
  { id: 13, name: 'Soy Sauce',       unit: 'ml',  current_stock: 800,  reorder_level: 300  },
  { id: 14, name: 'Calamansi',       unit: 'pcs', current_stock: 30,   reorder_level: 20   },
  { id: 15, name: 'Tamarind',        unit: 'g',   current_stock: 0,    reorder_level: 100  },
  { id: 16, name: 'Rice Noodles',    unit: 'g',   current_stock: 900,  reorder_level: 250  },
  { id: 17, name: 'Spring Roll Wrap',unit: 'pcs', current_stock: 60,   reorder_level: 30   },
  { id: 18, name: 'Ground Pork',     unit: 'g',   current_stock: 1100, reorder_level: 300  },
  { id: 19, name: 'Ginger',          unit: 'g',   current_stock: 180,  reorder_level: 80   },
  { id: 20, name: 'Brewed Coffee',   unit: 'g',   current_stock: 450,  reorder_level: 100  },
];

// ─── Kitchen (confirmed/preparing queue) ────────────────────────────────────
const kitchenOrders = [
  { id: 2001, order_number: 'ORD-2001', status: 'confirmed', order_channel: 'counter',   created_at: minsAgo(2),  order_items: [{ id: 1, quantity: 2, notes: '',            menu_item: { name: 'Tapsilog' } }, { id: 3, quantity: 1, notes: '',            menu_item: { name: 'Iced Tea' } }] },
  { id: 2003, order_number: 'ORD-2003', status: 'preparing', order_channel: 'counter',   created_at: minsAgo(7),  order_items: [{ id: 7, quantity: 3, notes: 'no garlic', menu_item: { name: 'Longsilog' } }, { id: 8, quantity: 2, notes: '',          menu_item: { name: 'Extra Rice' } }] },
  { id: 2005, order_number: 'ORD-2005', status: 'confirmed', order_channel: 'counter',   created_at: minsAgo(4),  order_items: [{ id: 11, quantity: 1, notes: '', menu_item: { name: 'Adobo Rice' } }, { id: 12, quantity: 1, notes: '', menu_item: { name: 'Coke Regular' } }] },
  { id: 2002, order_number: 'ORD-2002', status: 'preparing', order_channel: 'mobile_app', created_at: minsAgo(9),  order_items: [{ id: 4, quantity: 1, notes: '', menu_item: { name: 'Sinigang Set' } }, { id: 5, quantity: 2, notes: '', menu_item: { name: 'Iced Tea' } }] },
  { id: 2004, order_number: 'ORD-2004', status: 'confirmed', order_channel: 'mobile_app', created_at: minsAgo(3),  order_items: [{ id: 9, quantity: 1, notes: '',       menu_item: { name: 'Bangsilog' } }, { id: 11, quantity: 1, notes: '',       menu_item: { name: 'Extra Egg' } }] },
  { id: 2006, order_number: 'ORD-2006', status: 'confirmed', order_channel: 'mobile_app', created_at: minsAgo(8),  order_items: [{ id: 13, quantity: 2, notes: 'extra sauce', menu_item: { name: 'Tapsilog' } }, { id: 14, quantity: 2, notes: '',            menu_item: { name: 'Coke Zero' } }] },
];

// ─── Kitchen alerts ─────────────────────────────────────────────────────────
const kitchenAlerts = [
  { id: 301, order_id: 2001, acknowledged_at: null, order: { order_number: 'ORD-2001' }, esp32_device: { location_label: 'Table 4' } },
  { id: 302, order_id: 2004, acknowledged_at: null, order: { order_number: 'ORD-2004' }, esp32_device: { location_label: 'Table 7' } },
];

// ─── Delivery (rich staff shape) ─────────────────────────────────────────────
const deliveries = [
  {
    id: 1, order_id: 3001, status: 'out_for_delivery', delivery_preference: 'own',
    rider_name: 'Rider Marco', rider_contact: '09171234567', lalamove_booking_id: null, eta: '~15 min',
    order: { order_number: 'ORD-3001', created_at: minsAgo(18), customer_name: 'Juan Dela Cruz', customer_address: 'Ongpin St., Binondo, Manila', order_items: [{ quantity: 2, menu_item: { name: 'Tapsilog' } }] },
  },
  {
    id: 2, order_id: 3002, status: 'assigned', delivery_preference: 'lalamove',
    rider_name: null, rider_contact: null, lalamove_booking_id: 'LLM-20248801', eta: '~12 min',
    order: { order_number: 'ORD-3002', created_at: minsAgo(12), customer_name: 'Maria Santos', customer_address: 'Quintin Paredes St., Binondo, Manila', order_items: [{ quantity: 1, menu_item: { name: 'Sinigang Set' } }, { quantity: 2, menu_item: { name: 'Iced Tea' } }] },
  },
  {
    id: 3, order_id: 3003, status: 'pending_assignment', delivery_preference: 'own',
    rider_name: null, rider_contact: null, lalamove_booking_id: null, eta: 'awaiting',
    order: { order_number: 'ORD-3003', created_at: minsAgo(6), customer_name: 'Pedro Bautista', customer_address: 'Yuchengco St., Binondo, Manila', order_items: [{ quantity: 1, menu_item: { name: 'Fried Chicken' } }] },
  },
  {
    id: 4, order_id: 3004, status: 'delivered', delivery_preference: 'own',
    rider_name: 'Rider Niko', rider_contact: '09189876543', lalamove_booking_id: null, eta: 'Delivered',
    order: { order_number: 'ORD-3004', created_at: minsAgo(46), customer_name: 'Ana Reyes', customer_address: 'Rizal Ave., Binondo, Manila', order_items: [{ quantity: 3, menu_item: { name: 'Adobo Rice' } }] },
  },
];

const rawToManagerStatus = { pending_assignment: 'preparing', assigned: 'ready' };
function toManagerStatus(s) { return rawToManagerStatus[s] || s; }
function toManagerView(d) {
  return {
    id: d.id,
    order_number: d.order?.order_number || `ORD-${d.id}`,
    customer: d.order?.customer_name || 'Customer',
    rider: d.rider_name || (d.lalamove_booking_id ? `# ${d.lalamove_booking_id}` : 'Unassigned'),
    status: toManagerStatus(d.status),
    eta: (d.status === 'delivered' || d.status === 'cancelled') ? (d.eta || d.status) : (d.eta || '~20 min'),
    created_at: d.order?.created_at || d.created_at,
  };
}

// ─── Sample items for new order/delivery generation ─────────────────────────
const sampleItems = [
  { name: 'Tapsilog', unit_price: 120 },
  { name: 'Longsilog', unit_price: 110 },
  { name: 'Sinigang Set', unit_price: 150 },
  { name: 'Bangsilog', unit_price: 130 },
  { name: 'Tocilog', unit_price: 110 },
  { name: 'Goto', unit_price: 85 },
  { name: 'Adobo Rice', unit_price: 105 },
  { name: 'Fried Chicken', unit_price: 135 },
  { name: 'Spamsilog', unit_price: 140 },
  { name: 'Bistek Rice', unit_price: 145 },
  { name: 'Iced Tea', unit_price: 45 },
  { name: 'Coke Regular', unit_price: 40 },
  { name: 'Coke Zero', unit_price: 40 },
  { name: 'Extra Rice', unit_price: 20 },
  { name: 'Extra Egg', unit_price: 20 },
  { name: 'Pineapple Juice', unit_price: 55 },
  { name: 'Hot Coffee', unit_price: 60 },
  { name: 'Lumpiang Shanghai', unit_price: 65 },
];

const riderNames = ['Rider Marco', 'Rider Liza', 'Rider Niko', 'Rider Carlo'];
const customerNames = ['Juan Dela Cruz', 'Maria Santos', 'Pedro Bautista', 'Ana Reyes', 'Jose Ramirez', 'Lisa Mendoza', 'Carlo Reyes'];
const deliveryAddresses = [
  'Ongpin St., Binondo, Manila',
  'Quintin Paredes St., Binondo, Manila',
  'Yuchengco St., Binondo, Manila',
  'Rizal Ave., Binondo, Manila',
  'Carvajal St., Binondo, Manila',
];

// ─── Read-only accessors (REST API) ─────────────────────────────────────────
function getMenu() {
  const items = menuItems.map((item) => ({
    ...item,
    category_name: menuCategories.find((c) => c.id === item.category_id)?.name || '—',
  }));
  return { categories: menuCategories, items };
}
function getOrders() { return orders; }
function getOrder(id) { return orders.find((o) => o.id === Number(id)); }
function getInventory() { return inventory; }
function getKitchenOrders() { return kitchenOrders.filter((o) => ['confirmed', 'preparing'].includes(o.status)); }
function getKitchenAlerts() { return kitchenAlerts; }
function getDeliveries() { return deliveries; }
function getManagerDeliveries() { return deliveries.map(toManagerView); }

// ─── Mutators (write endpoints + socket-driven simulated events) ────────────

// ── Orders ──────────────────────────────────────────────────────────────
function createOrder(body = {}) {
  const { order_type = 'counter', items = [] } = body;
  if (!Array.isArray(items) || items.length === 0) return { error: 'Order must include at least one item.' };

  const id = nextOrderId++;
  const orderNumber = `ORD-${id}`;
  const created_at = new Date().toISOString();
  const orderChannel = order_type === 'mobile_app' || order_type === 'online' ? 'mobile_app' : 'counter';

  const order_items = [];
  const salesItems = [];
  let total = 0;
  for (const line of items) {
    const menuItem = menuItems.find((m) => m.id === Number(line?.menu_item_id));
    if (!menuItem) return { error: `Menu item id ${line?.menu_item_id} not found.` };
    const qty = Math.max(1, Number(line.quantity) || 1);
    total += menuItem.price * qty;
    order_items.push({ id: nextLineId++, quantity: qty, notes: line.notes || '', menu_item: { name: menuItem.name } });
    salesItems.push({ name: menuItem.name, quantity: qty, unit_price: menuItem.price });
  }

  const order = { id, order_number: orderNumber, status: 'confirmed', payment_method: null, total_amount: total, created_at, items: salesItems };
  const kitchenOrder = { id, order_number: orderNumber, status: 'confirmed', order_channel: orderChannel, created_at, total_amount: total, order_items };
  orders.unshift(order);
  kitchenOrders.unshift(kitchenOrder);

  return { order, events: [{ type: 'order:new', payload: kitchenOrder }] };
}

function processPayment(orderId, body = {}) {
  const order = orders.find((o) => o.id === Number(orderId));
  if (!order) return null;
  order.status = 'completed';
  order.payment_method = body.method || 'cash';
  return { events: [{ type: 'order:status', payload: { orderId: order.id, status: 'completed', orderNumber: order.order_number } }] };
}

// ── Kitchen ─────────────────────────────────────────────────────────────
function setKitchenStatus(orderId, status) {
  const order = kitchenOrders.find((o) => o.id === Number(orderId));
  if (!order) return { error: 'Kitchen order not found.' };
  if (!['preparing', 'ready'].includes(status)) return { error: 'Invalid status.' };

  order.status = status;
  if (status === 'ready') {
    const idx = kitchenOrders.indexOf(order);
    kitchenOrders.splice(idx, 1);
    return { events: [{ type: 'order:ready', payload: { orderId: order.id, orderNumber: order.order_number } }] };
  }
  return { events: [{ type: 'order:status', payload: { orderId: order.id, status, orderNumber: order.order_number } }] };
}

// ── Inventory ────────────────────────────────────────────────────────────
function updateInventory(itemId, body = {}) {
  const item = inventory.find((i) => i.id === Number(itemId));
  if (!item) return null;
  const qty = Number(body.quantity) || 0;
  if (body.change_type === 'restock') item.current_stock += qty;
  else if (body.change_type === 'adjustment') item.current_stock = qty;
  item.current_stock = Math.max(0, item.current_stock);
  return { events: [{ type: 'inventory:update', payload: { itemId: item.id, currentStock: item.current_stock, reorderLevel: item.reorder_level, name: item.name } }] };
}

// ── Delivery ─────────────────────────────────────────────────────────────
function deliveryEvents(delivery) {
  return [
    { type: 'delivery:update', payload: { deliveryId: delivery.id, status: toManagerStatus(delivery.status), orderNumber: delivery.order?.order_number } },
    { type: 'delivery_update', payload: delivery },
  ];
}

function assignDelivery(id, body = {}) {
  const delivery = deliveries.find((d) => d.id === Number(id));
  if (!delivery) return { error: 'Delivery not found.' };
  if (delivery.status !== 'pending_assignment') return { error: 'Delivery is already assigned.' };

  const preference = body.delivery_preference || delivery.delivery_preference || 'own';
  delivery.delivery_preference = preference;
  delivery.status = 'assigned';
  if (preference === 'lalamove') {
    delivery.lalamove_booking_id = `LLM-${Date.now().toString().slice(-8)}`;
    delivery.rider_name = null;
    delivery.rider_contact = null;
  } else {
    delivery.rider_name = body.rider_name || 'Unnamed Rider';
    delivery.rider_contact = body.rider_contact || '';
    delivery.lalamove_booking_id = null;
  }
  delivery.eta = '~15 min';
  return { delivery, events: deliveryEvents(delivery) };
}

function updateDeliveryStatus(id, status) {
  const delivery = deliveries.find((d) => d.id === Number(id));
  if (!delivery) return { error: 'Delivery not found.' };
  if (status === 'cancelled') {
    delivery.status = 'cancelled';
    delivery.eta = 'Cancelled';
    return { delivery, events: deliveryEvents(delivery) };
  }
  const allowed = { assigned: 'out_for_delivery', out_for_delivery: 'delivered' };
  if (allowed[delivery.status] !== status) return { error: `Invalid transition (${delivery.status} → ${status}).` };
  delivery.status = status;
  delivery.eta = status === 'delivered' ? 'Delivered' : '~10 min';
  return { delivery, events: deliveryEvents(delivery) };
}

// ── Menu mutations ─────────────────────────────────────────────────────────
function menuItemView(item) {
  return {
    ...item,
    category_name: menuCategories.find((c) => c.id === item.category_id)?.name || '—',
  };
}

function createMenuItem(body = {}) {
  const name = (body.name || '').trim();
  if (!name) return { error: 'Item name is required.' };
  const price = Number(body.price);
  if (!price || price <= 0) return { error: 'Enter a valid price.' };

  const item = {
    id: nextMenuItemId++,
    category_id: Number(body.category_id) || 1,
    name,
    description: body.description || '',
    price,
    is_available: body.is_available ?? true,
    image_url: body.image_url || null,
  };
  menuItems.push(item);
  return { item, events: [{ type: 'menu_update', payload: item }] };
}

function updateMenuItem(id, body = {}) {
  const idx = menuItems.findIndex((i) => i.id === Number(id));
  if (idx === -1) return { error: 'Menu item not found.' };
  const current = menuItems[idx];
  const name = (body.name ?? current.name).trim();
  const price = body.price !== undefined ? Number(body.price) : current.price;
  if (!name) return { error: 'Item name is required.' };
  if (price <= 0) return { error: 'Enter a valid price.' };

  const item = {
    ...current,
    name,
    price,
    description: body.description ?? current.description,
    category_id: Number(body.category_id) || current.category_id,
    is_available: body.is_available ?? current.is_available,
    image_url: body.image_url ?? current.image_url,
  };
  menuItems[idx] = item;
  return { item, events: [{ type: 'menu_update', payload: item }] };
}

function setMenuItemAvailability(id, isAvailable) {
  const item = menuItems.find((i) => i.id === Number(id));
  if (!item) return { error: 'Menu item not found.' };
  item.is_available = !!isAvailable;
  return { item, events: [{ type: 'menu_update', payload: item }] };
}

function removeMenuItem(id) {
  const idx = menuItems.findIndex((i) => i.id === Number(id));
  if (idx === -1) return { error: 'Menu item not found.' };
  const [removed] = menuItems.splice(idx, 1);
  return { item: removed, events: [{ type: 'menu_update', payload: { id: removed.id } }] };
}

// ── Kitchen alerts ──────────────────────────────────────────────────────────
function acknowledgeAlert(id) {
  const alert = kitchenAlerts.find((a) => a.id === Number(id));
  if (!alert) return { error: 'Alert not found.' };
  alert.acknowledged_at = new Date().toISOString();
  return { alert };
}

// ─── Admin store (accounts / settings / devices / audit / restrictions) ─────
const staffAccounts = [
  { id: 101, full_name: 'Maria Santos',   email: 'maria@bingnondo.com',  role: 'cashier',       status: 'active',   created_at: daysAgo(10) },
  { id: 102, full_name: 'Juan Dela Cruz', email: 'juan@bingnondo.com',   role: 'kitchen_staff', status: 'active',   created_at: daysAgo(20) },
  { id: 103, full_name: 'Ana Reyes',      email: 'ana@bingnondo.com',    role: 'staff',         status: 'inactive', created_at: daysAgo(30) },
  { id: 104, full_name: 'Pedro Bautista', email: 'pedro@bingnondo.com',  role: 'cashier',       status: 'active',   created_at: daysAgo(5)  },
  { id: 105, full_name: 'Rosa Mendoza',   email: 'rosa@bingnondo.com',   role: 'owner',         status: 'active',   created_at: daysAgo(60) },
];
let staffAccountCounter = 200;

const settings = {
  paymongo_key:    '',
  openai_key:      '',
  gemini_key:      '',
  business_hours:  {
    Monday:    { open: '07:00', close: '22:00', closed: false },
    Tuesday:   { open: '07:00', close: '22:00', closed: false },
    Wednesday: { open: '07:00', close: '22:00', closed: false },
    Thursday:  { open: '07:00', close: '22:00', closed: false },
    Friday:    { open: '07:00', close: '23:00', closed: false },
    Saturday:  { open: '08:00', close: '23:00', closed: false },
    Sunday:    { open: '08:00', close: '21:00', closed: false },
  },
  menu_categories: ['Silog Meals', 'Rice Meals', 'Merienda', 'Drinks', 'Add-ons'],
};

const devices = [
  { id: 1, device_code: 'ESP32-KITCHEN-01', location_label: 'Main Kitchen', is_online: true  },
  { id: 2, device_code: 'ESP32-TABLE-01',   location_label: 'Table Counter', is_online: false },
];
let deviceCounter = 10;

const auditLog = [
  { id: 1, actor_id: 1, actor_name: 'System Admin', actor_role: 'admin', action: 'create',          target_type: 'staff_account', target_id: 101, details: { role: 'cashier' },            created_at: daysAgo(10) },
  { id: 2, actor_id: 1, actor_name: 'System Admin', actor_role: 'admin', action: 'register_device', target_type: 'esp32_device',  target_id: 1,   details: { label: 'Main Kitchen' },        created_at: daysAgo(8)  },
  { id: 3, actor_id: 1, actor_name: 'System Admin', actor_role: 'admin', action: 'update_settings', target_type: 'settings',       target_id: null, details: { field: 'business_hours' },    created_at: daysAgo(5)  },
  { id: 4, actor_id: 1, actor_name: 'System Admin', actor_role: 'admin', action: 'deactivate',      target_type: 'staff_account', target_id: 103, details: { reason: 'resignation' },       created_at: daysAgo(2)  },
  { id: 5, actor_id: 1, actor_name: 'System Admin', actor_role: 'admin', action: 'reset_password',  target_type: 'staff_account', target_id: 104, details: {},                             created_at: minsAgo(60) },
];
let auditCounter = 100;

function addAuditEntry(action, targetType, targetId, details = {}) {
  auditLog.unshift({
    id: ++auditCounter, actor_id: 1, actor_name: 'System Admin', actor_role: 'admin',
    action, target_type: targetType, target_id: targetId, details,
    created_at: new Date().toISOString(),
  });
}

function paginate(arr, page = 1, limit = 10) {
  const start = (page - 1) * limit;
  return { data: arr.slice(start, start + limit), totalPages: Math.max(1, Math.ceil(arr.length / limit)), total: arr.length };
}

function listStaffAccounts({ page = 1, limit = 10, search, role, status } = {}) {
  let result = [...staffAccounts];
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((a) => a.full_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }
  if (role) result = result.filter((a) => a.role === role);
  if (status) result = result.filter((a) => a.status === status);
  return paginate(result, page, limit);
}

function createStaffAccount(data = {}) {
  const account = {
    id: ++staffAccountCounter,
    full_name: data.full_name || '',
    email: data.email || '',
    role: data.role || 'staff',
    status: 'active',
    created_at: new Date().toISOString(),
  };
  staffAccounts.push(account);
  addAuditEntry('create', 'staff_account', account.id, { role: account.role });
  return account;
}

function updateStaffStatus(id, status) {
  const account = staffAccounts.find((a) => a.id === Number(id));
  if (!account) return { error: 'Account not found.' };
  account.status = status;
  addAuditEntry(status === 'active' ? 'reactivate' : 'deactivate', 'staff_account', Number(id), {});
  return { account };
}

function resetStaffPassword(id) {
  const account = staffAccounts.find((a) => a.id === Number(id));
  if (!account) return { error: 'Account not found.' };
  addAuditEntry('reset_password', 'staff_account', Number(id), {});
  return { account };
}

function getSettings() { return { ...settings }; }

function updateSettings(updates = {}) {
  Object.assign(settings, updates);
  const field = Object.keys(updates)[0] || 'settings';
  addAuditEntry('update_settings', 'settings', null, { field });
  return { settings };
}

function listDevices() { return [...devices]; }

function registerDevice(data = {}) {
  const device = {
    id: ++deviceCounter,
    device_code: data.device_code || '',
    location_label: data.location_label || '',
    is_online: false,
  };
  devices.push(device);
  addAuditEntry('register_device', 'esp32_device', device.id, { label: device.location_label });
  return device;
}

function removeDevice(id) {
  const device = devices.find((d) => d.id === Number(id));
  if (!device) return { error: 'Device not found.' };
  devices.splice(devices.indexOf(device), 1);
  addAuditEntry('remove_device', 'esp32_device', Number(id), { label: device.location_label });
  return { device };
}

function getAuditLog({ page = 1, limit = 20, actor_id, action, from, to } = {}) {
  let result = [...auditLog];
  if (actor_id) result = result.filter((e) => String(e.actor_id) === String(actor_id));
  if (action)   result = result.filter((e) => e.action === action);
  if (from)     result = result.filter((e) => new Date(e.created_at) >= new Date(from));
  if (to)       result = result.filter((e) => new Date(e.created_at) <= new Date(`${to}T23:59:59`));
  return paginate(result, page, limit);
}

const customerRestrictions = [
  { customer_id: 1001, customer_name: 'Jose Rizal',       customer_email: 'jose@gmail.com',      restriction_level: 'suspended',      violation_count: 4, reason: 'Repeated no-show after 3rd order in 30 days.', updated_by: 1, updated_by_name: 'System Admin', updated_at: daysAgo(2)  },
  { customer_id: 1002, customer_name: 'Maria Clara',      customer_email: 'mclara@yahoo.com',     restriction_level: 'cod_restricted', violation_count: 3, reason: 'Third cancellation within 30-day window.',  updated_by: null, updated_by_name: null, updated_at: daysAgo(5)  },
  { customer_id: 1003, customer_name: 'Andres Bonifacio', customer_email: 'andres@mail.ph',       restriction_level: 'warned',         violation_count: 2, reason: null,                            updated_by: null, updated_by_name: null, updated_at: daysAgo(1)  },
  { customer_id: 1004, customer_name: 'Gabriela Silang',  customer_email: 'gsilang@hotmail.com',  restriction_level: 'none',           violation_count: 1, reason: null,                            updated_by: null, updated_by_name: null, updated_at: null         },
  { customer_id: 1005, customer_name: 'Apolinario Mabini', customer_email: 'sublimeparalytico@ph.net', restriction_level: 'suspended', violation_count: 5, reason: 'Persistent no-show. Admin review required.', updated_by: 1, updated_by_name: 'System Admin', updated_at: daysAgo(10) },
];

const customerViolations = {
  1001: [
    { id: 101, order_id: 5011, violation_type: 'no_show',              created_at: daysAgo(3)  },
    { id: 102, order_id: 4892, violation_type: 'cancelled_after_prep', created_at: daysAgo(10) },
    { id: 103, order_id: 4701, violation_type: 'cancelled_before_prep', created_at: daysAgo(18) },
    { id: 104, order_id: 4500, violation_type: 'no_show',              created_at: daysAgo(25) },
  ],
  1002: [
    { id: 201, order_id: 5100, violation_type: 'cancelled_before_prep', created_at: daysAgo(5)  },
    { id: 202, order_id: 4980, violation_type: 'cancelled_before_prep', created_at: daysAgo(12) },
    { id: 203, order_id: 4810, violation_type: 'cancelled_before_prep', created_at: daysAgo(20) },
  ],
  1003: [
    { id: 301, order_id: 5050, violation_type: 'cancelled_after_prep', created_at: daysAgo(1) },
    { id: 302, order_id: 4920, violation_type: 'no_show',              created_at: daysAgo(8) },
  ],
  1004: [
    { id: 401, order_id: 5200, violation_type: 'cancelled_before_prep', created_at: daysAgo(2) },
  ],
  1005: [
    { id: 501, order_id: 5300, violation_type: 'no_show',              created_at: daysAgo(1)  },
    { id: 502, order_id: 5280, violation_type: 'no_show',              created_at: daysAgo(7)  },
    { id: 503, order_id: 5200, violation_type: 'cancelled_after_prep', created_at: daysAgo(14) },
    { id: 504, order_id: 5150, violation_type: 'cancelled_before_prep', created_at: daysAgo(21) },
    { id: 505, order_id: 5000, violation_type: 'no_show',              created_at: daysAgo(28) },
  ],
};

function listCustomerRestrictions({ page = 1, limit = 12, search, restriction_level } = {}) {
  let result = [...customerRestrictions];
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((c) => c.customer_name.toLowerCase().includes(q) || c.customer_email.toLowerCase().includes(q));
  }
  if (restriction_level) result = result.filter((c) => c.restriction_level === restriction_level);
  return paginate(result, page, limit);
}

function getCustomerViolations(customerId) {
  return customerViolations[Number(customerId)] || [];
}

function overrideCustomerRestriction(customerId, { restriction_level, reason } = {}) {
  const customer = customerRestrictions.find((c) => c.customer_id === Number(customerId));
  if (!customer) return { error: 'Customer not found.' };
  customer.restriction_level = restriction_level;
  customer.reason = reason;
  customer.updated_by = 1;
  customer.updated_by_name = 'System Admin';
  customer.updated_at = new Date().toISOString();
  addAuditEntry('override_restriction', 'customer', Number(customerId), { restriction_level, reason });
  return { customer };
}

// ─── Support chat store ──────────────────────────────────────────────────────
const chatThreads = [
  { id: 1, customer_id: 101, customer_name: 'Maria Santos',   customer_email: 'maria.santos@email.com', status: 'unlocked', last_message_text: 'Kamusta na yung order ko? Matagal na eh', last_message_at: hrsAgo(0.08), active_order_number: 'ORD-1003', active_orders: [{ id: 1003, order_number: 'ORD-1003', status: 'out_for_delivery', items: [{ quantity: 1, name: 'Tapsilog', price: 120 }, { quantity: 2, name: 'Iced Tea', price: 45 }] }] },
  { id: 2, customer_id: 102, customer_name: 'Jose Reyes',     customer_email: 'jose.reyes@email.com',   status: 'unlocked', last_message_text: 'Hi! May extra chili ba kayo?',          last_message_at: hrsAgo(0.25), active_order_number: 'ORD-1004', active_orders: [{ id: 1004, order_number: 'ORD-1004', status: 'preparing', items: [{ quantity: 1, name: 'Sinigang Set', price: 150 }, { quantity: 1, name: 'Extra Rice', price: 20 }] }] },
  { id: 3, customer_id: 103, customer_name: 'Ana Cruz',       customer_email: 'ana.cruz@email.com',     status: 'unlocked', last_message_text: 'Okay lang siya, salamat!',             last_message_at: hrsAgo(0.5),  active_order_number: 'ORD-1005', active_orders: [{ id: 1005, order_number: 'ORD-1005', status: 'assigned', items: [{ quantity: 2, name: 'Longsilog', price: 110 }] }] },
  { id: 4, customer_id: 104, customer_name: 'Pedro Lim',      customer_email: 'pedro.lim@email.com',    status: 'unlocked', last_message_text: 'Pwede bang baguhin yung address?',       last_message_at: hrsAgo(1),    active_order_number: 'ORD-1006', active_orders: [{ id: 1006, order_number: 'ORD-1006', status: 'confirmed', items: [{ quantity: 1, name: 'Fried Chicken', price: 135 }, { quantity: 1, name: 'Coke Regular', price: 40 }] }] },
  { id: 5, customer_id: 105, customer_name: 'Rosa Villanueva', customer_email: 'rosa.v@email.com',      status: 'locked',   last_message_text: 'Okay, salamat po! Masarap talaga.',     last_message_at: hrsAgo(2.5),  active_order_number: null, active_orders: [] },
  { id: 6, customer_id: 106, customer_name: 'Tony Uy',        customer_email: 'tony.uy@email.com',      status: 'locked',   last_message_text: 'Sige po, noted. Salamat!',              last_message_at: hrsAgo(5),    active_order_number: null, active_orders: [] },
];

const chatMessages = {
  1: [
    { id: 1,  chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Hello po! May order po ako.',           related_order_number: 'ORD-1003', sent_at: hrsAgo(0.5)  },
    { id: 2,  chat_id: 1, sender_type: 'staff',    sender_name: 'Staff',        message_text: 'Hello Maria! Noted po ang order mo. Ilalabas na namin agad.', related_order_number: null, sent_at: hrsAgo(0.45) },
    { id: 3,  chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Sige po, salamat! Gaano katagal?',     related_order_number: null,        sent_at: hrsAgo(0.3)  },
    { id: 4,  chat_id: 1, sender_type: 'staff',    sender_name: 'Staff',        message_text: 'Mga 20-30 minutes po, naka-assign na ang rider.', related_order_number: 'ORD-1003', sent_at: hrsAgo(0.25) },
    { id: 5,  chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Kamusta na yung order ko? Matagal na eh', related_order_number: 'ORD-1003', sent_at: hrsAgo(0.08) },
  ],
  2: [{ id: 6, chat_id: 2, sender_type: 'customer', sender_name: 'Jose Reyes', message_text: 'Hi! May extra chili ba kayo?', related_order_number: 'ORD-1004', sent_at: hrsAgo(0.25) }],
  3: [
    { id: 7,  chat_id: 3, sender_type: 'customer', sender_name: 'Ana Cruz', message_text: 'Pwede bang magpalit ng item?',      related_order_number: 'ORD-1005', sent_at: hrsAgo(1)   },
    { id: 8,  chat_id: 3, sender_type: 'staff',    sender_name: 'Staff',   message_text: 'Hi Ana! Pasensya na po, naka-prepare na kasi. Hindi na ma-change.', related_order_number: 'ORD-1005', sent_at: hrsAgo(0.9) },
    { id: 9,  chat_id: 3, sender_type: 'customer', sender_name: 'Ana Cruz', message_text: 'Okay lang siya, salamat!',         related_order_number: null,       sent_at: hrsAgo(0.5) },
  ],
  4: [{ id: 10, chat_id: 4, sender_type: 'customer', sender_name: 'Pedro Lim', message_text: 'Pwede bang baguhin yung address?', related_order_number: 'ORD-1006', sent_at: hrsAgo(1) }],
  5: [
    { id: 11, chat_id: 5, sender_type: 'customer', sender_name: 'Rosa Villanueva', message_text: 'Natanggap ko na yung order ko!', related_order_number: null, sent_at: hrsAgo(3)   },
    { id: 12, chat_id: 5, sender_type: 'staff',    sender_name: 'Staff',           message_text: 'Salamat po Rosa! Ulit ulit po kayo.', related_order_number: null, sent_at: hrsAgo(2.8) },
    { id: 13, chat_id: 5, sender_type: 'customer', sender_name: 'Rosa Villanueva', message_text: 'Okay, salamat po! Masarap talaga.', related_order_number: null, sent_at: hrsAgo(2.5) },
  ],
  6: [
    { id: 14, chat_id: 6, sender_type: 'customer', sender_name: 'Tony Uy', message_text: 'Pwede bang i-cancel?',     related_order_number: null, sent_at: hrsAgo(6)   },
    { id: 15, chat_id: 6, sender_type: 'staff',    sender_name: 'Staff',   message_text: 'Hi Tony! Na-cancel na po. Pasensya sa abala.', related_order_number: null, sent_at: hrsAgo(5.5) },
    { id: 16, chat_id: 6, sender_type: 'customer', sender_name: 'Tony Uy', message_text: 'Sige po, noted. Salamat!', related_order_number: null, sent_at: hrsAgo(5)   },
  ],
};

let chatMsgCounter = 17;

function getChatThreads() { return [...chatThreads]; }

function getChatMessages(chatId) {
  return chatMessages[Number(chatId)] || [];
}

function sendChatMessage({ chat_id, message_text, sender_type = 'staff', related_order_id } = {}) {
  const thread = chatThreads.find((t) => t.id === Number(chat_id));
  if (!thread) return { error: 'Thread not found.' };
  if (thread.status === 'locked') return { error: 'Thread is locked.' };
  const text = (message_text || '').trim();
  if (!text) return { error: 'Message cannot be empty.' };

  const message = {
    id: chatMsgCounter++,
    chat_id: Number(chat_id),
    sender_type,
    sender_name: sender_type === 'customer' ? thread.customer_name : 'Staff',
    message_text: text,
    related_order_number: related_order_id
      ? thread.active_orders?.find((o) => o.id === Number(related_order_id))?.order_number || null
      : null,
    sent_at: new Date().toISOString(),
  };

  if (!chatMessages[message.chat_id]) chatMessages[message.chat_id] = [];
  chatMessages[message.chat_id].push(message);

  thread.last_message_text = text;
  thread.last_message_at = message.sent_at;

  return { message, events: [{ type: 'chat:update', payload: { chatId: message.chat_id, message } }] };
}

// ── Simulated live events ────────────────────────────────────────────────────
function advanceKitchenOrder() {
  const candidates = kitchenOrders.filter((o) => o.status === 'confirmed' || o.status === 'preparing');
  if (candidates.length === 0) return null;
  const order = candidates[Math.floor(Math.random() * candidates.length)];

  if (order.status === 'confirmed') {
    order.status = 'preparing';
    return { events: [{ type: 'order:status', payload: { orderId: order.id, status: 'preparing', orderNumber: order.order_number } }] };
  }
  const idx = kitchenOrders.indexOf(order);
  kitchenOrders.splice(idx, 1);
  return { events: [{ type: 'order:ready', payload: { orderId: order.id, orderNumber: order.order_number } }] };
}

function addNewKitchenOrder() {
  const id = nextOrderId++;
  const orderNumber = `ORD-${id}`;
  const isCounter = Math.random() < 0.5;
  const channel = isCounter ? 'counter' : 'mobile_app';
  const itemCount = 1 + Math.floor(Math.random() * 3);
  const items = [];
  const picked = new Set();
  for (let i = 0; i < itemCount; i++) {
    let item;
    do { item = sampleItems[Math.floor(Math.random() * sampleItems.length)]; } while (picked.has(item.name) && picked.size < sampleItems.length);
    picked.add(item.name);
    items.push({ id: nextLineId++, quantity: 1 + Math.floor(Math.random() * 2), notes: '', menu_item: { name: item.name } });
  }
  const totalAmount = items.reduce((s, it) => s + it.quantity * (sampleItems.find((si) => si.name === it.menu_item.name)?.unit_price || 100), 0);

  const order = {
    id,
    order_number: orderNumber,
    status: 'confirmed',
    order_channel: channel,
    created_at: new Date().toISOString(),
    total_amount: totalAmount,
    order_items: items,
  };
  kitchenOrders.unshift(order);

  orders.unshift({
    id,
    order_number: orderNumber,
    status: 'confirmed',
    payment_method: Math.random() < 0.5 ? 'cash' : 'gcash',
    total_amount: totalAmount,
    created_at: order.created_at,
    items: items.map((it) => ({ name: it.menu_item.name, quantity: it.quantity, unit_price: sampleItems.find((si) => si.name === it.menu_item.name)?.unit_price || 100 })),
  });

  return { events: [{ type: 'order:new', payload: order }] };
}

function adjustInventory() {
  const item = inventory[Math.floor(Math.random() * inventory.length)];
  const delta = Math.floor(Math.random() * 40) - 25;
  item.current_stock = Math.max(0, item.current_stock + delta);
  return { events: [{ type: 'inventory:update', payload: { itemId: item.id, currentStock: item.current_stock, reorderLevel: item.reorder_level, name: item.name } }] };
}

function advanceDelivery() {
  const transitions = { pending_assignment: 'assigned', assigned: 'out_for_delivery', out_for_delivery: 'delivered' };
  const candidates = deliveries.filter((d) => transitions[d.status]);
  if (candidates.length === 0) return null;
  const delivery = candidates[Math.floor(Math.random() * candidates.length)];
  if (delivery.status === 'pending_assignment') {
    delivery.rider_name = riderNames[Math.floor(Math.random() * riderNames.length)];
    delivery.rider_contact = '0917' + String(Math.floor(1000000 + Math.random() * 8999999));
    delivery.eta = '~15 min';
  }
  delivery.status = transitions[delivery.status];
  delivery.eta = delivery.status === 'delivered' ? 'Delivered' : delivery.eta || '~15 min';
  return { events: deliveryEvents(delivery) };
}

function maybeAddDelivery() {
  if (deliveries.length >= 12 || Math.random() > 0.3) return null;
  const id = nextDeliveryId++;
  const orderId = 3000 + id;
  const orderNumber = `ORD-${orderId}`;
  const isLalamove = Math.random() < 0.4;
  const rider = isLalamove ? null : riderNames[Math.floor(Math.random() * riderNames.length)];
  const delivery = {
    id,
    order_id: orderId,
    status: 'pending_assignment',
    delivery_preference: isLalamove ? 'lalamove' : 'own',
    rider_name: rider,
    rider_contact: rider ? '0917' + String(Math.floor(1000000 + Math.random() * 8999999)) : null,
    lalamove_booking_id: isLalamove ? `LLM-${id}${Date.now().toString().slice(-6)}` : null,
    eta: 'awaiting assignment',
    order: {
      order_number: orderNumber,
      created_at: new Date().toISOString(),
      customer_name: customerNames[Math.floor(Math.random() * customerNames.length)],
      customer_address: deliveryAddresses[Math.floor(Math.random() * deliveryAddresses.length)],
      order_items: [{ quantity: 1 + Math.floor(Math.random() * 2), menu_item: { name: sampleItems[Math.floor(Math.random() * sampleItems.length)].name } }],
    },
  };
  deliveries.unshift(delivery);
  return { events: [
    { type: 'delivery:new', payload: toManagerView(delivery) },
    { type: 'delivery_new', payload: delivery },
  ] };
}

module.exports = {
  getMenu,
  getOrders,
  getOrder,
  getInventory,
  getKitchenOrders,
  getKitchenAlerts,
  getDeliveries,
  getManagerDeliveries,

  createOrder,
  processPayment,
  setKitchenStatus,
  updateInventory,
  assignDelivery,
  updateDeliveryStatus,

  createMenuItem,
  updateMenuItem,
  setMenuItemAvailability,
  removeMenuItem,
  acknowledgeAlert,

  listStaffAccounts,
  createStaffAccount,
  updateStaffStatus,
  resetStaffPassword,
  getSettings,
  updateSettings,
  listDevices,
  registerDevice,
  removeDevice,
  getAuditLog,
  listCustomerRestrictions,
  getCustomerViolations,
  overrideCustomerRestriction,

  getChatThreads,
  getChatMessages,
  sendChatMessage,

  advanceKitchenOrder,
  addNewKitchenOrder,
  adjustInventory,
  advanceDelivery,
  maybeAddDelivery,
};