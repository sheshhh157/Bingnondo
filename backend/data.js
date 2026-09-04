// ─── Manager Backend — Read-Only Data Store ────────────────────────────────
// Mirrors the shape the Bingnondo frontend uses so the Manager Dashboard can
// consume real HTTP endpoints. All data is in-memory and read-only.

const today = new Date();
const hrsAgo = (h) => new Date(today.getTime() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d, h = 12) => new Date(today.getTime() - d * 24 * 60 * 60 * 1000 - h * 60 * 60 * 1000).toISOString();
const minsAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

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

// ─── Kitchen (read-only) ────────────────────────────────────────────────────
const kitchenOrders = [
  { id: 2001, order_number: 'ORD-2001', status: 'confirmed', order_channel: 'counter',   created_at: minsAgo(2),  order_items: [{ id: 1, quantity: 2, notes: '',            menu_item: { name: 'Tapsilog' } }, { id: 3, quantity: 1, notes: '',            menu_item: { name: 'Iced Tea' } }] },
  { id: 2003, order_number: 'ORD-2003', status: 'preparing', order_channel: 'counter',   created_at: minsAgo(7),  order_items: [{ id: 7, quantity: 3, notes: 'no garlic', menu_item: { name: 'Longsilog' } }, { id: 8, quantity: 2, notes: '',          menu_item: { name: 'Extra Rice' } }] },
  { id: 2005, order_number: 'ORD-2005', status: 'confirmed', order_channel: 'counter',   created_at: minsAgo(4),  order_items: [{ id: 11, quantity: 1, notes: '', menu_item: { name: 'Adobo Rice' } }, { id: 12, quantity: 1, notes: '', menu_item: { name: 'Coke Regular' } }] },
  { id: 2002, order_number: 'ORD-2002', status: 'preparing', order_channel: 'mobile_app', created_at: minsAgo(9),  order_items: [{ id: 4, quantity: 1, notes: '', menu_item: { name: 'Sinigang Set' } }, { id: 5, quantity: 2, notes: '', menu_item: { name: 'Iced Tea' } }] },
  { id: 2004, order_number: 'ORD-2004', status: 'confirmed', order_channel: 'mobile_app', created_at: minsAgo(3),  order_items: [{ id: 9, quantity: 1, notes: '',       menu_item: { name: 'Bangsilog' } }, { id: 11, quantity: 1, notes: '',       menu_item: { name: 'Extra Egg' } }] },
  { id: 2006, order_number: 'ORD-2006', status: 'confirmed', order_channel: 'mobile_app', created_at: minsAgo(8),  order_items: [{ id: 13, quantity: 2, notes: 'extra sauce', menu_item: { name: 'Tapsilog' } }, { id: 14, quantity: 2, notes: '',            menu_item: { name: 'Coke Zero' } }] },
];

// ─── Delivery (read-only) ───────────────────────────────────────────────────
const deliveries = [
  { id: 1, order_number: 'ORD-3001', customer: 'Juan Dela Cruz', rider: 'Rider Marco', status: 'out_for_delivery', eta: '~15 min', created_at: minsAgo(18) },
  { id: 2, order_number: 'ORD-3002', customer: 'Maria Santos',   rider: 'Rider Liza',  status: 'preparing',        eta: '~35 min', created_at: minsAgo(6) },
  { id: 3, order_number: 'ORD-3003', customer: 'Pedro Bautista', rider: 'Rider Marco', status: 'delivered',        eta: 'Delivered', created_at: minsAgo(46) },
  { id: 4, order_number: 'ORD-3004', customer: 'Ana Reyes',      rider: 'Rider Niko',  status: 'ready',            eta: 'Awaiting rider', created_at: minsAgo(12) },
  { id: 5, order_number: 'ORD-3005', customer: 'Jose Ramirez',   rider: 'Rider Liza',  status: 'out_for_delivery', eta: '~10 min', created_at: minsAgo(26) },
];

module.exports = {
  getOrders: () => orders,
  getOrder: (id) => orders.find((o) => o.id === Number(id)),
  getInventory: () => inventory,
  getKitchenOrders: () => kitchenOrders.filter((o) => ['confirmed', 'preparing'].includes(o.status)),
  getKitchenAlerts: () => [],
  getDeliveries: () => deliveries,
};
