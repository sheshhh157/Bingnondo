// ─── MOCK DATA ────────────────────────────────────────────────────────────────
// Pansamantala lang ito habang wala pang backend.
// Palitan mo ito ng tunay na API calls pag ready na ang backend.
//
// Since the live backend landed, the order/kitchen/inventory/delivery APIs
// below try the real Express backend first (shared store + socket events) and
// fall back to these local mocks when the backend is offline.

import { httpGet, httpPost, httpPatch, httpDelete, orMock } from './http';

// Build a query string from defined (non-empty) params
const qs = (o = {}) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
  const s = p.toString();
  return s ? `?${s}` : '';
};

const MOCK_CATEGORIES = [
  { id: 1, name: 'Silog Meals' },
  { id: 2, name: 'Rice Meals' },
  { id: 3, name: 'Merienda' },
  { id: 4, name: 'Drinks' },
  { id: 5, name: 'Add-ons' },
];

let MOCK_MENU_ITEMS = [
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
  { id: 11, category_id: 3, name: 'Pancit Bihon',      description: 'Stir-fried rice noodles',         price: 75,  is_available: true,  image_url: null },
  { id: 12, category_id: 3, name: 'Lumpiang Shanghai',  description: '5 pcs with sweet chili sauce',    price: 65,  is_available: true,  image_url: null },
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

let menuItemCounter = 24;

// Mock transaction history — mga lumang orders para sa TransactionHistory tab
const today = new Date();
const hrsAgo = (h) => new Date(today.getTime() - h * 60 * 60 * 1000).toISOString();

let MOCK_ORDERS = [
  {
    id: 1001, order_number: 'ORD-1001', status: 'completed', payment_method: 'cash',
    total_amount: 240, created_at: hrsAgo(1),
    items: [
      { name: 'Tapsilog', quantity: 1, unit_price: 120 },
      { name: 'Iced Tea', quantity: 1, unit_price: 45 },
      { name: 'Extra Rice', quantity: 1, unit_price: 20 },
      { name: 'Coke Regular', quantity: 1, unit_price: 40 },
    ],
  },
  {
    id: 1002, order_number: 'ORD-1002', status: 'completed', payment_method: 'gcash',
    total_amount: 175, created_at: hrsAgo(2),
    items: [
      { name: 'Longsilog', quantity: 1, unit_price: 110 },
      { name: 'Bottled Water', quantity: 1, unit_price: 25 },
      { name: 'Extra Egg', quantity: 1, unit_price: 20 },
    ],
  },
  {
    id: 1003, order_number: 'ORD-1003', status: 'preparing', payment_method: 'cash',
    total_amount: 285, created_at: hrsAgo(0.25),
    items: [
      { name: 'Sinigang Set', quantity: 1, unit_price: 150 },
      { name: 'Iced Tea', quantity: 1, unit_price: 45 },
      { name: 'Lumpiang Shanghai', quantity: 1, unit_price: 65 },
    ],
  },
  {
    id: 1004, order_number: 'ORD-1004', status: 'completed', payment_method: 'cash',
    total_amount: 130, created_at: hrsAgo(3),
    items: [
      { name: 'Goto', quantity: 1, unit_price: 85 },
      { name: 'Extra Rice', quantity: 1, unit_price: 20 },
      { name: 'Hot Coffee', quantity: 1, unit_price: 60 },
    ],
  },
  {
    id: 1005, order_number: 'ORD-1005', status: 'cancelled', payment_method: 'cash',
    total_amount: 110, created_at: hrsAgo(4),
    items: [
      { name: 'Tocilog', quantity: 1, unit_price: 110 },
    ],
  },
];

let orderCounter = 1006;

// Mock inventory
let MOCK_INVENTORY = [
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

// ─── HELPER: simulate network delay ──────────────────────────────────────────
const delay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  staffLogin: async ({ email, password }) => {
    await delay();
    const accounts = [
      { id: 1, full_name: 'Cashier One',  email: 'cashier@bingnondo.com', password: 'cashier123', role: 'cashier' },
      { id: 2, full_name: 'Staff Member', email: 'staff@bingnondo.com',   password: 'staff123',   role: 'staff'   },
      { id: 3, full_name: 'Owner',        email: 'owner@bingnondo.com',   password: 'owner123',   role: 'owner'   },
      { id: 4, full_name: 'Kitchen Staff', email: 'kitchen@bingnondo.com', password: 'kitchen123', role: 'kitchen_staff' },
      { id: 5, email: 'admin@bingnondo.com', password: 'admin123', full_name: 'System Admin', role: 'admin' },
      { id: 6, full_name: 'Manager', email: 'manager@bingnondo.com', password: 'manager123', role: 'manager' }
    ];
    const user = accounts.find((a) => a.email === email && a.password === password);
    if (!user) throw { response: { data: { message: 'Invalid credentials. Try again.' } } };
    const { password: _, ...userData } = user;
    return { data: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: userData } };
  },
  logout: async () => { await delay(100); return { data: { message: 'Logged out.' } }; },
};

// ─── MENU (cashier read) ──────────────────────────────────────────────────────
export const menuAPI = {
  getAll: () => orMock(
    () => httpGet('/menu'),
    async () => {
      await delay(400);
      return { data: { categories: MOCK_CATEGORIES, items: MOCK_MENU_ITEMS } };
    },
  ),
};

// ─── ORDERS ───────────────────────────────────────────────────────────────────
export const ordersAPI = {
  create: (payload) => orMock(
    () => httpPost('/orders', payload),
    async () => {
      await delay(500);
      const newOrder = {
        id: orderCounter,
        order_number: `ORD-${orderCounter}`,
        status: 'confirmed',
        payment_method: null,
        total_amount: payload.items.reduce((sum, i) => {
          const menuItem = MOCK_MENU_ITEMS.find((m) => m.id === i.menu_item_id);
          return sum + (menuItem?.price || 0) * i.quantity;
        }, 0),
        created_at: new Date().toISOString(),
        items: payload.items.map((i) => {
          const menuItem = MOCK_MENU_ITEMS.find((m) => m.id === i.menu_item_id);
          return { name: menuItem?.name || 'Unknown', quantity: i.quantity, unit_price: menuItem?.price || 0 };
        }),
      };
      MOCK_ORDERS = [newOrder, ...MOCK_ORDERS];
      orderCounter++;
      return { data: newOrder };
    },
  ),

  getMyTransactions: () => orMock(
    () => httpGet('/orders'),
    async () => {
      await delay(400);
      return { data: MOCK_ORDERS };
    },
  ),
};

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  process: (payload) => orMock(
    () => httpPost(`/orders/${payload.order_id}/payment`, { method: payload.method, amount: payload.amount }),
    async () => {
      await delay(600);
      const order = MOCK_ORDERS.find((o) => o.id === Number(payload.order_id));
      if (order) {
        order.status = 'completed';
        order.payment_method = payload.method || 'cash';
      }
      return { data: { success: true, message: 'Payment processed.' } };
    },
  ),
};

// ─── INVENTORY (§4.1) ─────────────────────────────────────────────────────────
export const inventoryAPI = {
  getAll: () => orMock(
    () => httpGet('/inventory'),
    async () => {
      await delay(350);
      return { data: { items: [...MOCK_INVENTORY] } };
    },
  ),

  transaction: (id, payload) => orMock(
    () => httpPatch(`/inventory/${id}`, { change_type: payload.change_type, quantity: payload.quantity, note: payload.note }),
    async () => {
      await delay(400);
      const item = MOCK_INVENTORY.find((i) => i.id === id);
      if (!item) throw { response: { data: { message: 'Item not found.' } } };
      if (payload.change_type === 'restock') {
        item.current_stock += Number(payload.quantity);
      } else if (payload.change_type === 'adjustment') {
        item.current_stock = Number(payload.quantity);
      }
      return { data: { ...item } };
    },
  ),
};

// ─── STAFF MENU (§4.2) — full CRUD, separate from cashier read-only ───────────
export const staffMenuAPI = {
  getAll: () => orMock(
    () => httpGet('/menu'),
    async () => {
      await delay(350);
      // Enrich items with category_name
      const enriched = MOCK_MENU_ITEMS.map((item) => ({
        ...item,
        category_name: MOCK_CATEGORIES.find((c) => c.id === item.category_id)?.name || '—',
      }));
      return { data: { categories: MOCK_CATEGORIES, items: enriched } };
    },
  ),

  create: (payload) => orMock(
    () => httpPost('/menu/items', payload),
    async () => {
      await delay(500);
      const cat = MOCK_CATEGORIES.find((c) => c.id === Number(payload.category_id));
      const newItem = {
        id: menuItemCounter++,
        category_id: Number(payload.category_id),
        category_name: cat?.name || '—',
        name: payload.name,
        description: payload.description || '',
        price: Number(payload.price),
        is_available: payload.is_available ?? true,
        image_url: payload.image_url || null,
      };
      MOCK_MENU_ITEMS = [...MOCK_MENU_ITEMS, newItem];
      return { data: newItem };
    },
  ),

  update: (id, payload) => orMock(
    () => httpPatch(`/menu/items/${id}`, payload),
    async () => {
      await delay(450);
      const idx = MOCK_MENU_ITEMS.findIndex((i) => i.id === id);
      if (idx === -1) throw { response: { data: { message: 'Item not found.' } } };
      const cat = MOCK_CATEGORIES.find((c) => c.id === Number(payload.category_id));
      const updated = {
        ...MOCK_MENU_ITEMS[idx],
        ...payload,
        category_id: Number(payload.category_id),
        category_name: cat?.name || '—',
        price: Number(payload.price),
      };
      MOCK_MENU_ITEMS = MOCK_MENU_ITEMS.map((i) => (i.id === id ? updated : i));
      return { data: updated };
    },
  ),

  setAvailability: (id, is_available) => orMock(
    () => httpPatch(`/menu/items/${id}/availability`, { is_available }),
    async () => {
      await delay(250);
      MOCK_MENU_ITEMS = MOCK_MENU_ITEMS.map((i) =>
        i.id === id ? { ...i, is_available } : i
      );
      return { data: { id, is_available } };
    },
  ),

  remove: (id) => orMock(
    () => httpDelete(`/menu/items/${id}`),
    async () => {
      await delay(350);
      MOCK_MENU_ITEMS = MOCK_MENU_ITEMS.filter((i) => i.id !== id);
      return { data: { success: true } };
    },
  ),
};

// ─── KITCHEN ──────────────────────────────────────────────────────────────────
const minsAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

let MOCK_KITCHEN_ORDERS = [
  // ── COUNTER ──────────────────────────────────────────────────────────────
  {
    id: 2001, order_number: 'ORD-2001', status: 'confirmed', order_channel: 'counter',
    created_at: minsAgo(2),
    order_items: [
      { id: 1, quantity: 2, notes: '',            menu_item: { name: 'Tapsilog' } },
      { id: 2, quantity: 1, notes: 'extra spicy', menu_item: { name: 'Goto' } },
      { id: 3, quantity: 1, notes: '',            menu_item: { name: 'Iced Tea' } },
    ],
  },
  {
    id: 2003, order_number: 'ORD-2003', status: 'preparing', order_channel: 'counter',
    created_at: minsAgo(7),
    order_items: [
      { id: 7, quantity: 3, notes: 'no garlic', menu_item: { name: 'Longsilog' } },
      { id: 8, quantity: 2, notes: '',          menu_item: { name: 'Extra Rice' } },
    ],
  },
  {
    id: 2005, order_number: 'ORD-2005', status: 'confirmed', order_channel: 'counter',
    created_at: minsAgo(4),
    order_items: [
      { id: 11, quantity: 1, notes: '', menu_item: { name: 'Adobo Rice' } },
      { id: 12, quantity: 1, notes: '', menu_item: { name: 'Coke Regular' } },
    ],
  },
  {
    id: 2007, order_number: 'ORD-2007', status: 'preparing', order_channel: 'counter',
    created_at: minsAgo(10),
    order_items: [
      { id: 15, quantity: 2, notes: '', menu_item: { name: 'Fried Chicken' } },
      { id: 16, quantity: 2, notes: '', menu_item: { name: 'Extra Rice' } },
      { id: 17, quantity: 2, notes: '', menu_item: { name: 'Pineapple Juice' } },
    ],
  },
  {
    id: 2009, order_number: 'ORD-2009', status: 'confirmed', order_channel: 'counter',
    created_at: minsAgo(16),
    order_items: [
      { id: 19, quantity: 1, notes: 'less sugar', menu_item: { name: 'Arroz Caldo' } },
      { id: 20, quantity: 1, notes: '',           menu_item: { name: 'Hot Coffee' } },
    ],
  },
  {
    id: 2011, order_number: 'ORD-2011', status: 'confirmed', order_channel: 'counter',
    created_at: minsAgo(1),
    order_items: [
      { id: 23, quantity: 4, notes: '', menu_item: { name: 'Lumpiang Shanghai' } },
      { id: 24, quantity: 2, notes: '', menu_item: { name: 'Bottled Water' } },
    ],
  },
  // ── ONLINE ───────────────────────────────────────────────────────────────
  {
    id: 2002, order_number: 'ORD-2002', status: 'preparing', order_channel: 'mobile_app',
    created_at: minsAgo(9),
    order_items: [
      { id: 4, quantity: 1, notes: '', menu_item: { name: 'Sinigang Set' } },
      { id: 5, quantity: 2, notes: '', menu_item: { name: 'Iced Tea' } },
    ],
  },
  {
    id: 2004, order_number: 'ORD-2004', status: 'confirmed', order_channel: 'mobile_app',
    created_at: minsAgo(3),
    order_items: [
      { id: 9,  quantity: 1, notes: '',       menu_item: { name: 'Bangsilog' } },
      { id: 10, quantity: 1, notes: 'no ice', menu_item: { name: 'Pineapple Juice' } },
      { id: 11, quantity: 1, notes: '',       menu_item: { name: 'Extra Egg' } },
    ],
  },
  {
    id: 2006, order_number: 'ORD-2006', status: 'confirmed', order_channel: 'mobile_app',
    created_at: minsAgo(8),
    order_items: [
      { id: 13, quantity: 2, notes: 'extra sauce', menu_item: { name: 'Tapsilog' } },
      { id: 14, quantity: 2, notes: '',            menu_item: { name: 'Coke Zero' } },
    ],
  },
  {
    id: 2008, order_number: 'ORD-2008', status: 'preparing', order_channel: 'mobile_app',
    created_at: minsAgo(5),
    order_items: [
      { id: 18, quantity: 1, notes: '', menu_item: { name: 'Pancit Bihon' } },
      { id: 19, quantity: 1, notes: '', menu_item: { name: 'Goto' } },
      { id: 20, quantity: 1, notes: '', menu_item: { name: 'Hot Coffee' } },
    ],
  },
  {
    id: 2010, order_number: 'ORD-2010', status: 'confirmed', order_channel: 'mobile_app',
    created_at: minsAgo(20),
    order_items: [
      { id: 21, quantity: 2, notes: '', menu_item: { name: 'Bistek Rice' } },
      { id: 22, quantity: 2, notes: '', menu_item: { name: 'Iced Tea' } },
    ],
  },
  {
    id: 2012, order_number: 'ORD-2012', status: 'confirmed', order_channel: 'mobile_app',
    created_at: minsAgo(1),
    order_items: [
      { id: 25, quantity: 1, notes: 'well done', menu_item: { name: 'Tocilog' } },
      { id: 26, quantity: 1, notes: '',          menu_item: { name: 'Extra Rice' } },
      { id: 27, quantity: 1, notes: '',          menu_item: { name: 'Bottled Water' } },
    ],
  },
];

let MOCK_ALERTS = [
  {
    id: 301, order_id: 2001, acknowledged_at: null,
    order: { order_number: 'ORD-2001' },
    esp32_device: { location_label: 'Table 4' },
  },
  {
    id: 302, order_id: 2004, acknowledged_at: null,
    order: { order_number: 'ORD-2004' },
    esp32_device: { location_label: 'Table 7' },
  },
];
export const kitchenAPI = {
  getOrders: () => orMock(
    () => httpGet('/kitchen'),
    async () => {
      await delay(400);
      return { data: MOCK_KITCHEN_ORDERS.filter((o) => ['confirmed', 'preparing'].includes(o.status)) };
    },
  ),

  updateOrderStatus: (orderId, status) => orMock(
    () => httpPatch(`/kitchen/orders/${orderId}/status`, { status }),
    async () => {
      await delay(300);
      const order = MOCK_KITCHEN_ORDERS.find((o) => o.id === Number(orderId));
      if (order) order.status = status;
      return { data: { success: true } };
    },
  ),

  getAlerts: () => orMock(
    () => httpGet('/kitchen/alerts'),
    async () => {
      await delay(200);
      return { data: MOCK_ALERTS };
    },
  ),

  acknowledgeAlert: (alertId) => orMock(
    () => httpPatch(`/kitchen/alerts/${alertId}/acknowledge`),
    async () => {
      await delay(200);
      const alert = MOCK_ALERTS.find((a) => a.id === Number(alertId));
      if (alert) alert.acknowledged_at = new Date().toISOString();
      return { data: { success: true } };
    },
  ),
};

// ─── ADMIN API ─────────────────────────────────────────────────────────────────
// Mock data — replace with real API calls when backend is ready.

let MOCK_STAFF_ACCOUNTS = [
  { id: 101, full_name: 'Maria Santos',   email: 'maria@bingnondo.com',  role: 'cashier',       status: 'active',   created_at: new Date(Date.now()-86400000*10).toISOString() },
  { id: 102, full_name: 'Juan Dela Cruz', email: 'juan@bingnondo.com',   role: 'kitchen_staff', status: 'active',   created_at: new Date(Date.now()-86400000*20).toISOString() },
  { id: 103, full_name: 'Ana Reyes',      email: 'ana@bingnondo.com',    role: 'staff',         status: 'inactive', created_at: new Date(Date.now()-86400000*30).toISOString() },
  { id: 104, full_name: 'Pedro Bautista', email: 'pedro@bingnondo.com',  role: 'cashier',       status: 'active',   created_at: new Date(Date.now()-86400000*5).toISOString()  },
  { id: 105, full_name: 'Rosa Mendoza',   email: 'rosa@bingnondo.com',   role: 'owner',         status: 'active',   created_at: new Date(Date.now()-86400000*60).toISOString() },
];
let staffAccountCounter = 200;

let MOCK_SETTINGS = {
  paymongo_key:    '',
  openai_key:      '',
  gemini_key:      '',
  business_hours:  {
    Monday:    { open:'07:00', close:'22:00', closed:false },
    Tuesday:   { open:'07:00', close:'22:00', closed:false },
    Wednesday: { open:'07:00', close:'22:00', closed:false },
    Thursday:  { open:'07:00', close:'22:00', closed:false },
    Friday:    { open:'07:00', close:'23:00', closed:false },
    Saturday:  { open:'08:00', close:'23:00', closed:false },
    Sunday:    { open:'08:00', close:'21:00', closed:false },
  },
  menu_categories: ['Silog Meals','Rice Meals','Merienda','Drinks','Add-ons'],
};

let MOCK_DEVICES = [
  { id: 1, device_code: 'ESP32-KITCHEN-01', location_label: 'Main Kitchen', is_online: true  },
  { id: 2, device_code: 'ESP32-TABLE-01',   location_label: 'Table Counter', is_online: false },
];
let deviceCounter = 10;

let MOCK_AUDIT_LOG = [
  { id: 1, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'create',         target_type:'staff_account', target_id:101, details:{ role:'cashier' },              created_at: new Date(Date.now()-86400000*10).toISOString() },
  { id: 2, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'register_device',target_type:'esp32_device',  target_id:1,   details:{ label:'Main Kitchen' },        created_at: new Date(Date.now()-86400000*8).toISOString()  },
  { id: 3, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'update_settings',target_type:'settings',       target_id:null, details:{ field:'business_hours' },   created_at: new Date(Date.now()-86400000*5).toISOString()  },
  { id: 4, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'deactivate',     target_type:'staff_account', target_id:103, details:{ reason:'resignation' },        created_at: new Date(Date.now()-86400000*2).toISOString()  },
  { id: 5, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'reset_password', target_type:'staff_account', target_id:104, details:{},                              created_at: new Date(Date.now()-3600000).toISOString()     },
];
let auditCounter = 100;

function addAuditEntry(action, targetType, targetId, details={}) {
  MOCK_AUDIT_LOG.unshift({
    id: ++auditCounter, actor_id:1, actor_name:'System Admin', actor_role:'admin',
    action, target_type:targetType, target_id:targetId, details,
    created_at: new Date().toISOString(),
  });
}

function paginate(arr, page=1, limit=10) {
  const start = (page-1)*limit;
  return { data: arr.slice(start, start+limit), totalPages: Math.max(1, Math.ceil(arr.length/limit)), total: arr.length };
}

export const adminAPI = {
  // ── Staff Accounts ──────────────────────────────────────────────────
  listStaffAccounts: (opts = {}) => orMock(
    () => httpGet(`/accounts${qs(opts)}`),
    async () => {
      await delay(350);
      const { page = 1, limit = 10, search, role, status } = opts;
      let result = [...MOCK_STAFF_ACCOUNTS];
      if (search) result = result.filter(a => a.full_name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase()));
      if (role)   result = result.filter(a => a.role   === role);
      if (status) result = result.filter(a => a.status === status);
      return { data: paginate(result, page, limit) };
    },
  ),

  createStaffAccount: (data) => orMock(
    () => httpPost('/accounts', data),
    async () => {
      await delay(400);
      const account = { id: ++staffAccountCounter, ...data, status: 'active', created_at: new Date().toISOString() };
      MOCK_STAFF_ACCOUNTS.push(account);
      addAuditEntry('create', 'staff_account', account.id, { role: data.role });
      return { data: account };
    },
  ),

  updateStaffStatus: (id, status) => orMock(
    () => httpPatch(`/accounts/${id}/status`, { status }),
    async () => {
      await delay(300);
      const account = MOCK_STAFF_ACCOUNTS.find(a => a.id === Number(id));
      if (account) account.status = status;
      addAuditEntry(status === 'active' ? 'reactivate' : 'deactivate', 'staff_account', Number(id), {});
      return { data: { success: true } };
    },
  ),

  resetStaffPassword: (id) => orMock(
    () => httpPost(`/accounts/${id}/reset-password`),
    async () => {
      await delay(300);
      addAuditEntry('reset_password', 'staff_account', Number(id), {});
      return { data: { success: true } };
    },
  ),

  // ── Settings ────────────────────────────────────────────────────────
  getSettings: () => orMock(
    () => httpGet('/settings'),
    async () => {
      await delay(300);
      return { data: { ...MOCK_SETTINGS } };
    },
  ),

  updateSettings: (updates) => orMock(
    () => httpPatch('/settings', updates),
    async () => {
      await delay(300);
      Object.assign(MOCK_SETTINGS, updates);
      const field = Object.keys(updates)[0];
      addAuditEntry('update_settings', 'settings', null, { field });
      return { data: { success: true } };
    },
  ),

  // ── ESP32 Devices ────────────────────────────────────────────────────
  listDevices: () => orMock(
    () => httpGet('/devices'),
    async () => {
      await delay(250);
      return { data: [...MOCK_DEVICES] };
    },
  ),

  registerDevice: (data) => orMock(
    () => httpPost('/devices', data),
    async () => {
      await delay(350);
      const device = { id: ++deviceCounter, ...data, is_online: false };
      MOCK_DEVICES.push(device);
      addAuditEntry('register_device', 'esp32_device', device.id, { label: data.location_label });
      return { data: device };
    },
  ),

  removeDevice: (id) => orMock(
    () => httpDelete(`/devices/${id}`),
    async () => {
      await delay(300);
      const device = MOCK_DEVICES.find(d => d.id === Number(id));
      MOCK_DEVICES = MOCK_DEVICES.filter(d => d.id !== Number(id));
      addAuditEntry('remove_device', 'esp32_device', Number(id), { label: device?.location_label });
      return { data: { success: true } };
    },
  ),

  // ── Audit Log ────────────────────────────────────────────────────────
  getAuditLog: (opts = {}) => orMock(
    () => httpGet(`/audit-log${qs(opts)}`),
    async () => {
      await delay(350);
      const { page = 1, limit = 20, actor_id, action, from, to } = opts;
      let result = [...MOCK_AUDIT_LOG];
      if (actor_id) result = result.filter(e => String(e.actor_id) === String(actor_id));
      if (action)   result = result.filter(e => e.action === action);
      if (from)     result = result.filter(e => new Date(e.created_at) >= new Date(from));
      if (to)       result = result.filter(e => new Date(e.created_at) <= new Date(to + 'T23:59:59'));
      return { data: paginate(result, page, limit) };
    },
  ),
};
// ─── CUSTOMER RESTRICTIONS (6.4) ───────────────────────────────────────────────

let MOCK_CUSTOMER_RESTRICTIONS = [
  {
    customer_id: 1001, customer_name: 'Jose Rizal',     customer_email: 'jose@gmail.com',
    restriction_level: 'suspended',      violation_count: 4,
    reason: 'Repeated no-show after 3rd order in 30 days.',
    updated_by: 1, updated_by_name: 'System Admin',
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    customer_id: 1002, customer_name: 'Maria Clara',    customer_email: 'mclara@yahoo.com',
    restriction_level: 'cod_restricted', violation_count: 3,
    reason: 'Third cancellation within 30-day window.',
    updated_by: null, updated_by_name: null,
    updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    customer_id: 1003, customer_name: 'Andres Bonifacio', customer_email: 'andres@mail.ph',
    restriction_level: 'warned',         violation_count: 2,
    reason: null, updated_by: null, updated_by_name: null,
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    customer_id: 1004, customer_name: 'Gabriela Silang',  customer_email: 'gsilang@hotmail.com',
    restriction_level: 'none',           violation_count: 1,
    reason: null, updated_by: null, updated_by_name: null,
    updated_at: null,
  },
  {
    customer_id: 1005, customer_name: 'Apolinario Mabini', customer_email: 'sublimeparalytico@ph.net',
    restriction_level: 'suspended',      violation_count: 5,
    reason: 'Persistent no-show. Admin review required.',
    updated_by: 1, updated_by_name: 'System Admin',
    updated_at: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
];

const MOCK_VIOLATIONS = {
  1001: [
    { id: 101, order_id: 5011, violation_type: 'no_show',               created_at: new Date(Date.now()-86400000*3).toISOString()  },
    { id: 102, order_id: 4892, violation_type: 'cancelled_after_prep',  created_at: new Date(Date.now()-86400000*10).toISOString() },
    { id: 103, order_id: 4701, violation_type: 'cancelled_before_prep', created_at: new Date(Date.now()-86400000*18).toISOString() },
    { id: 104, order_id: 4500, violation_type: 'no_show',               created_at: new Date(Date.now()-86400000*25).toISOString() },
  ],
  1002: [
    { id: 201, order_id: 5100, violation_type: 'cancelled_before_prep', created_at: new Date(Date.now()-86400000*5).toISOString()  },
    { id: 202, order_id: 4980, violation_type: 'cancelled_before_prep', created_at: new Date(Date.now()-86400000*12).toISOString() },
    { id: 203, order_id: 4810, violation_type: 'cancelled_before_prep', created_at: new Date(Date.now()-86400000*20).toISOString() },
  ],
  1003: [
    { id: 301, order_id: 5050, violation_type: 'cancelled_after_prep',  created_at: new Date(Date.now()-86400000*1).toISOString()  },
    { id: 302, order_id: 4920, violation_type: 'no_show',               created_at: new Date(Date.now()-86400000*8).toISOString()  },
  ],
  1004: [
    { id: 401, order_id: 5200, violation_type: 'cancelled_before_prep', created_at: new Date(Date.now()-86400000*2).toISOString()  },
  ],
  1005: [
    { id: 501, order_id: 5300, violation_type: 'no_show',               created_at: new Date(Date.now()-86400000*1).toISOString()  },
    { id: 502, order_id: 5280, violation_type: 'no_show',               created_at: new Date(Date.now()-86400000*7).toISOString()  },
    { id: 503, order_id: 5200, violation_type: 'cancelled_after_prep',  created_at: new Date(Date.now()-86400000*14).toISOString() },
    { id: 504, order_id: 5150, violation_type: 'cancelled_before_prep', created_at: new Date(Date.now()-86400000*21).toISOString() },
    { id: 505, order_id: 5000, violation_type: 'no_show',               created_at: new Date(Date.now()-86400000*28).toISOString() },
  ],
};

export const customerRestrictionsAPI = {
  listCustomerRestrictions: (opts = {}) => orMock(
    () => httpGet(`/customer-restrictions${qs(opts)}`),
    async () => {
      await delay(350);
      const { page = 1, limit = 12, search, restriction_level } = opts;
      let result = [...MOCK_CUSTOMER_RESTRICTIONS];
      if (search) {
        const q = search.toLowerCase();
        result = result.filter(c =>
          c.customer_name.toLowerCase().includes(q) ||
          c.customer_email.toLowerCase().includes(q)
        );
      }
      if (restriction_level) result = result.filter(c => c.restriction_level === restriction_level);
      return { data: paginate(result, page, limit) };
    },
  ),

  getCustomerViolations: (customerId) => orMock(
    () => httpGet(`/customer-restrictions/${customerId}/violations`),
    async () => {
      await delay(250);
      const viols = MOCK_VIOLATIONS[Number(customerId)] || [];
      return { data: viols };
    },
  ),

  overrideCustomerRestriction: (customerId, { restriction_level, reason } = {}) => orMock(
    () => httpPatch(`/customer-restrictions/${customerId}/override`, { restriction_level, reason }),
    async () => {
      await delay(400);
      const customer = MOCK_CUSTOMER_RESTRICTIONS.find(c => c.customer_id === Number(customerId));
      if (customer) {
        customer.restriction_level = restriction_level;
        customer.reason            = reason;
        customer.updated_by        = 1;
        customer.updated_by_name   = 'System Admin';
        customer.updated_at        = new Date().toISOString();
      }
      addAuditEntry('override_restriction', 'customer', Number(customerId), { restriction_level, reason });
      return { data: { success: true } };
    },
  ),
};

// Re-export customerRestrictionsAPI methods on adminAPI for convenience
Object.assign(adminAPI, {
  listCustomerRestrictions:      customerRestrictionsAPI.listCustomerRestrictions,
  getCustomerViolations:         customerRestrictionsAPI.getCustomerViolations,
  overrideCustomerRestriction:   customerRestrictionsAPI.overrideCustomerRestriction,
});
// ─── DELIVERY MOCK DATA (§4.3) ────────────────────────────────────────────────
let MOCK_DELIVERIES = [
  {
    id: 1,
    order_id: 1003,
    status: 'pending_assignment',
    delivery_preference: 'own',
    rider_name: null,
    rider_contact: null,
    lalamove_booking_id: null,
    order: {
      order_number: 'ORD-1003',
      created_at: hrsAgo(0.13),
      customer_name: 'Maria Santos',
      customer_address: '45 Rizal St., Binondo, Manila',
      order_items: [
        { quantity: 1, menu_item: { name: 'Tapsilog' } },
        { quantity: 2, menu_item: { name: 'Iced Tea' } },
      ],
    },
  },
  {
    id: 2,
    order_id: 1004,
    status: 'pending_assignment',
    delivery_preference: 'lalamove',
    rider_name: null,
    rider_contact: null,
    lalamove_booking_id: null,
    order: {
      order_number: 'ORD-1004',
      created_at: hrsAgo(0.2),
      customer_name: 'Jose Reyes',
      customer_address: '12 Ongpin St., Binondo, Manila',
      order_items: [
        { quantity: 1, menu_item: { name: 'Sinigang Set' } },
        { quantity: 1, menu_item: { name: 'Extra Rice' } },
      ],
    },
  },
  {
    id: 3,
    order_id: 1005,
    status: 'assigned',
    delivery_preference: 'own',
    rider_name: 'Carlo Mendoza',
    rider_contact: '09171234567',
    lalamove_booking_id: null,
    order: {
      order_number: 'ORD-1005',
      created_at: hrsAgo(0.42),
      customer_name: 'Ana Cruz',
      customer_address: '78 Nueva St., Binondo, Manila',
      order_items: [
        { quantity: 2, menu_item: { name: 'Longsilog' } },
        { quantity: 2, menu_item: { name: 'Bottled Water' } },
      ],
    },
  },
  {
    id: 4,
    order_id: 1006,
    status: 'assigned',
    delivery_preference: 'lalamove',
    rider_name: null,
    rider_contact: null,
    lalamove_booking_id: 'LLM-20248801',
    order: {
      order_number: 'ORD-1006',
      created_at: hrsAgo(0.5),
      customer_name: 'Pedro Lim',
      customer_address: '3 Yuchengco St., Binondo, Manila',
      order_items: [
        { quantity: 1, menu_item: { name: 'Fried Chicken' } },
        { quantity: 1, menu_item: { name: 'Coke Regular' } },
      ],
    },
  },
  {
    id: 5,
    order_id: 1007,
    status: 'out_for_delivery',
    delivery_preference: 'own',
    rider_name: 'Ramon Garcia',
    rider_contact: '09189876543',
    lalamove_booking_id: null,
    order: {
      order_number: 'ORD-1007',
      created_at: hrsAgo(0.75),
      customer_name: 'Luz Tan',
      customer_address: '22 Carvajal St., Binondo, Manila',
      order_items: [
        { quantity: 1, menu_item: { name: 'Bangsilog' } },
        { quantity: 1, menu_item: { name: 'Pineapple Juice' } },
        { quantity: 1, menu_item: { name: 'Extra Egg' } },
      ],
    },
  },
  {
    id: 6,
    order_id: 1008,
    status: 'delivered',
    delivery_preference: 'own',
    rider_name: 'Carlo Mendoza',
    rider_contact: '09171234567',
    lalamove_booking_id: null,
    order: {
      order_number: 'ORD-1008',
      created_at: hrsAgo(1.5),
      customer_name: 'Rosa Villanueva',
      customer_address: '5 Globo de Oro St., Binondo, Manila',
      order_items: [
        { quantity: 3, menu_item: { name: 'Adobo Rice' } },
        { quantity: 3, menu_item: { name: 'Iced Tea' } },
      ],
    },
  },
  {
    id: 7,
    order_id: 1009,
    status: 'cancelled',
    delivery_preference: 'own',
    rider_name: null,
    rider_contact: null,
    lalamove_booking_id: null,
    order: {
      order_number: 'ORD-1009',
      created_at: hrsAgo(2),
      customer_name: 'Tony Uy',
      customer_address: '88 Quintin Paredes St., Binondo, Manila',
      order_items: [
        { quantity: 1, menu_item: { name: 'Cornsilog' } },
      ],
    },
  },
];

// ─── DELIVERY API (§4.3) ──────────────────────────────────────────────────────
export const deliveryAPI = {
  /** GET /api/deliveries — all deliveries for staff view */
  getAll: () => orMock(
    () => httpGet('/deliveries'),
    async () => {
      await delay(400);
      return { data: { deliveries: [...MOCK_DELIVERIES] } };
    },
  ),

  /** POST /api/deliveries/:id/assign — assign rider or book Lalamove */
  assign: (id, payload) => orMock(
    () => httpPost(`/deliveries/${id}/assign`, payload),
    async () => {
      await delay(500);
      const delivery = MOCK_DELIVERIES.find((d) => d.id === id);
      if (!delivery) throw { response: { data: { message: 'Delivery not found.' } } };

      delivery.status = 'assigned';
      delivery.delivery_preference = payload.delivery_preference;

      if (payload.delivery_preference === 'lalamove') {
        delivery.lalamove_booking_id = `LLM-${Date.now().toString().slice(-8)}`;
      } else {
        delivery.rider_name    = payload.rider_name;
        delivery.rider_contact = payload.rider_contact;
      }

      return { data: { ...delivery } };
    },
  ),

  /** PATCH /api/deliveries/:id/status — update delivery status */
  updateStatus: (id, status) => orMock(
    () => httpPatch(`/deliveries/${id}/status`, { status }),
    async () => {
      await delay(350);
      const delivery = MOCK_DELIVERIES.find((d) => d.id === id);
      if (!delivery) throw { response: { data: { message: 'Delivery not found.' } } };
      delivery.status = status;
      return { data: { ...delivery } };
    },
  ),
};
// ─── SUPPORT CHAT MOCK DATA (§4.4) ────────────────────────────────────────────
let MOCK_CHAT_THREADS = [
  {
    id: 1,
    customer_id: 101,
    customer_name: 'Maria Santos',
    customer_email: 'maria.santos@email.com',
    status: 'unlocked',
    last_message_text: 'Kamusta na yung order ko? Matagal na eh',
    last_message_at: hrsAgo(0.08),
    active_order_number: 'ORD-1003',
    active_orders: [
      { id: 1003, order_number: 'ORD-1003', status: 'out_for_delivery', items: [{ quantity: 1, name: 'Tapsilog', price: 120 }, { quantity: 2, name: 'Iced Tea', price: 45 }] },
    ],
  },
  {
    id: 2,
    customer_id: 102,
    customer_name: 'Jose Reyes',
    customer_email: 'jose.reyes@email.com',
    status: 'unlocked',
    last_message_text: 'Hi! May extra chili ba kayo?',
    last_message_at: hrsAgo(0.25),
    active_order_number: 'ORD-1004',
    active_orders: [
      { id: 1004, order_number: 'ORD-1004', status: 'preparing', items: [{ quantity: 1, name: 'Sinigang Set', price: 150 }, { quantity: 1, name: 'Extra Rice', price: 20 }] },
    ],
  },
  {
    id: 3,
    customer_id: 103,
    customer_name: 'Ana Cruz',
    customer_email: 'ana.cruz@email.com',
    status: 'unlocked',
    last_message_text: 'Okay lang siya, salamat!',
    last_message_at: hrsAgo(0.5),
    active_order_number: 'ORD-1005',
    active_orders: [
      { id: 1005, order_number: 'ORD-1005', status: 'assigned', items: [{ quantity: 2, name: 'Longsilog', price: 110 }] },
    ],
  },
  {
    id: 4,
    customer_id: 104,
    customer_name: 'Pedro Lim',
    customer_email: 'pedro.lim@email.com',
    status: 'unlocked',
    last_message_text: 'Pwede bang baguhin yung address?',
    last_message_at: hrsAgo(1),
    active_order_number: 'ORD-1006',
    active_orders: [
      { id: 1006, order_number: 'ORD-1006', status: 'confirmed', items: [{ quantity: 1, name: 'Fried Chicken', price: 135 }, { quantity: 1, name: 'Coke Regular', price: 40 }] },
    ],
  },
  {
    id: 5,
    customer_id: 105,
    customer_name: 'Rosa Villanueva',
    customer_email: 'rosa.v@email.com',
    status: 'locked',
    last_message_text: 'Okay, salamat po! Masarap talaga.',
    last_message_at: hrsAgo(2.5),
    active_order_number: null,
    active_orders: [],
  },
  {
    id: 6,
    customer_id: 106,
    customer_name: 'Tony Uy',
    customer_email: 'tony.uy@email.com',
    status: 'locked',
    last_message_text: 'Sige po, noted. Salamat!',
    last_message_at: hrsAgo(5),
    active_order_number: null,
    active_orders: [],
  },
];

let MOCK_CHAT_MESSAGES = {
  1: [
    { id: 1, chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Hello po! May order po ako.', related_order_number: 'ORD-1003', sent_at: hrsAgo(0.5) },
    { id: 2, chat_id: 1, sender_type: 'staff',    sender_name: 'Staff',        message_text: 'Hello Maria! Noted po ang order mo. Ilalabas na namin agad.', related_order_number: null, sent_at: hrsAgo(0.45) },
    { id: 3, chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Sige po, salamat! Gaano katagal?', related_order_number: null, sent_at: hrsAgo(0.3) },
    { id: 4, chat_id: 1, sender_type: 'staff',    sender_name: 'Staff',        message_text: 'Mga 20-30 minutes po, naka-assign na ang rider.', related_order_number: 'ORD-1003', sent_at: hrsAgo(0.25) },
    { id: 5, chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Kamusta na yung order ko? Matagal na eh', related_order_number: 'ORD-1003', sent_at: hrsAgo(0.08) },
  ],
  2: [
    { id: 6, chat_id: 2, sender_type: 'customer', sender_name: 'Jose Reyes', message_text: 'Hi! May extra chili ba kayo?', related_order_number: 'ORD-1004', sent_at: hrsAgo(0.25) },
  ],
  3: [
    { id: 7, chat_id: 3, sender_type: 'customer', sender_name: 'Ana Cruz', message_text: 'Pwede bang magpalit ng item?', related_order_number: 'ORD-1005', sent_at: hrsAgo(1) },
    { id: 8, chat_id: 3, sender_type: 'staff',    sender_name: 'Staff',      message_text: 'Hi Ana! Pasensya na po, naka-prepare na kasi. Hindi na ma-change.', related_order_number: 'ORD-1005', sent_at: hrsAgo(0.9) },
    { id: 9, chat_id: 3, sender_type: 'customer', sender_name: 'Ana Cruz', message_text: 'Okay lang siya, salamat!', related_order_number: null, sent_at: hrsAgo(0.5) },
  ],
  4: [
    { id: 10, chat_id: 4, sender_type: 'customer', sender_name: 'Pedro Lim', message_text: 'Pwede bang baguhin yung address?', related_order_number: 'ORD-1006', sent_at: hrsAgo(1) },
  ],
  5: [
    { id: 11, chat_id: 5, sender_type: 'customer', sender_name: 'Rosa Villanueva', message_text: 'Natanggap ko na yung order ko!', related_order_number: null, sent_at: hrsAgo(3) },
    { id: 12, chat_id: 5, sender_type: 'staff',    sender_name: 'Staff',            message_text: 'Salamat po Rosa! Ulit ulit po kayo.', related_order_number: null, sent_at: hrsAgo(2.8) },
    { id: 13, chat_id: 5, sender_type: 'customer', sender_name: 'Rosa Villanueva', message_text: 'Okay, salamat po! Masarap talaga.', related_order_number: null, sent_at: hrsAgo(2.5) },
  ],
  6: [
    { id: 14, chat_id: 6, sender_type: 'customer', sender_name: 'Tony Uy', message_text: 'Pwede bang i-cancel?', related_order_number: null, sent_at: hrsAgo(6) },
    { id: 15, chat_id: 6, sender_type: 'staff',    sender_name: 'Staff',     message_text: 'Hi Tony! Na-cancel na po. Pasensya sa abala.', related_order_number: null, sent_at: hrsAgo(5.5) },
    { id: 16, chat_id: 6, sender_type: 'customer', sender_name: 'Tony Uy', message_text: 'Sige po, noted. Salamat!', related_order_number: null, sent_at: hrsAgo(5) },
  ],
};

let msgCounter = 17;

// ─── SUPPORT CHAT API (§4.4) ──────────────────────────────────────────────────
export const supportChatAPI = {
  /** GET /api/support-chat/threads — all threads (staff view) */
  getThreads: () => orMock(
    () => httpGet('/support-chat/threads'),
    async () => {
      await delay(400);
      return { data: { threads: [...MOCK_CHAT_THREADS] } };
    },
  ),

  /** GET /api/support-chat/:chatId/messages */
  getMessages: (chatId) => orMock(
    () => httpGet(`/support-chat/${chatId}/messages`),
    async () => {
      await delay(350);
      const messages = MOCK_CHAT_MESSAGES[chatId] || [];
      return { data: { messages: [...messages] } };
    },
  ),

  /** POST /api/support-chat/message */
  sendMessage: (payload) => orMock(
    () => httpPost('/support-chat/message', payload),
    async () => {
      await delay(300);
      const { chat_id, message_text, sender_type, related_order_id } = payload;

      const thread = MOCK_CHAT_THREADS.find((t) => t.id === chat_id);
      if (!thread) throw { response: { data: { message: 'Thread not found.' } } };
      if (thread.status === 'locked') throw { response: { data: { message: 'Thread is locked.' } } };

      const newMsg = {
        id: msgCounter++,
        chat_id,
        sender_type: sender_type || 'staff',
        sender_name: sender_type === 'customer' ? thread.customer_name : 'Staff',
        message_text,
        related_order_number: related_order_id
          ? thread.active_orders?.find((o) => o.id === related_order_id)?.order_number || null
          : null,
        sent_at: new Date().toISOString(),
      };

      if (!MOCK_CHAT_MESSAGES[chat_id]) MOCK_CHAT_MESSAGES[chat_id] = [];
      MOCK_CHAT_MESSAGES[chat_id] = [...MOCK_CHAT_MESSAGES[chat_id], newMsg];

      // Update thread preview
      thread.last_message_text = message_text;
      thread.last_message_at   = newMsg.sent_at;

      return { data: { message: newMsg } };
    },
  ),
};
