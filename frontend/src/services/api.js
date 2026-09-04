// ─── MOCK DATA ────────────────────────────────────────────────────────────────
// Pansamantala lang ito habang wala pang backend.
// Palitan mo ito ng tunay na API calls pag ready na ang backend.

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
      { id: 5, email: 'admin@bingnondo.com', password: 'admin123', full_name: 'System Admin', role: 'admin' }
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
  getAll: async () => {
    await delay(400);
    return { data: { categories: MOCK_CATEGORIES, items: MOCK_MENU_ITEMS } };
  },
};

// ─── ORDERS ───────────────────────────────────────────────────────────────────
export const ordersAPI = {
  create: async (payload) => {
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

  getMyTransactions: async () => {
    await delay(400);
    return { data: MOCK_ORDERS };
  },

  getAll: async () => {
    await delay(400);
    return { data: MOCK_ORDERS };
  },

  getById: async (id) => {
    await delay(200);
    const order = MOCK_ORDERS.find((o) => o.id === Number(id));
    if (!order) throw { response: { status: 404, data: { message: 'Order not found.' } } };
    return { data: order };
  },
};

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  process: async ({ order_id, method }) => {
    await delay(600);
    const order = MOCK_ORDERS.find((o) => o.id === Number(order_id));
    if (order) {
      order.status = 'completed';
      order.payment_method = method || 'cash';
    }
    return { data: { success: true, message: 'Payment processed.' } };
  },
};

// ─── INVENTORY (§4.1) ─────────────────────────────────────────────────────────
export const inventoryAPI = {
  getAll: async () => {
    await delay(350);
    return { data: { items: [...MOCK_INVENTORY] } };
  },

  transaction: async (id, { change_type, quantity, note }) => {
    await delay(400);
    const item = MOCK_INVENTORY.find((i) => i.id === id);
    if (!item) throw { response: { data: { message: 'Item not found.' } } };
    if (change_type === 'restock') {
      item.current_stock += Number(quantity);
    } else if (change_type === 'adjustment') {
      item.current_stock = Number(quantity);
    }
    return { data: { ...item } };
  },
};

// ─── STAFF MENU (§4.2) — full CRUD, separate from cashier read-only ───────────
export const staffMenuAPI = {
  getAll: async () => {
    await delay(350);
    // Enrich items with category_name
    const enriched = MOCK_MENU_ITEMS.map((item) => ({
      ...item,
      category_name: MOCK_CATEGORIES.find((c) => c.id === item.category_id)?.name || '—',
    }));
    return { data: { categories: MOCK_CATEGORIES, items: enriched } };
  },

  create: async (payload) => {
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

  update: async (id, payload) => {
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

  setAvailability: async (id, is_available) => {
    await delay(250);
    MOCK_MENU_ITEMS = MOCK_MENU_ITEMS.map((i) =>
      i.id === id ? { ...i, is_available } : i
    );
    return { data: { id, is_available } };
  },

  remove: async (id) => {
    await delay(350);
    MOCK_MENU_ITEMS = MOCK_MENU_ITEMS.filter((i) => i.id !== id);
    return { data: { success: true } };
  },
};

// ─── CATEGORIES (§4.2) ────────────────────────────────────────────────────────
export const categoriesAPI = {
  getAll: async () => {
    await delay(200);
    return { data: { categories: [...MOCK_CATEGORIES] } };
  },
};

export default { authAPI, menuAPI, ordersAPI, paymentsAPI, inventoryAPI, staffMenuAPI, categoriesAPI };
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
  getOrders: async () => {
    await delay(400);
    return { data: MOCK_KITCHEN_ORDERS.filter((o) => ['confirmed', 'preparing'].includes(o.status)) };
  },

  updateOrderStatus: async (orderId, status) => {
    await delay(300);
    const order = MOCK_KITCHEN_ORDERS.find((o) => o.id === Number(orderId));
    if (order) order.status = status;
    return { data: { success: true } };
  },

  getAlerts: async () => {
    await delay(200);
    return { data: MOCK_ALERTS };
  },

  acknowledgeAlert: async (alertId) => {
    await delay(200);
    const alert = MOCK_ALERTS.find((a) => a.id === Number(alertId));
    if (alert) alert.acknowledged_at = new Date().toISOString();
    return { data: { success: true } };
  },
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
  listStaffAccounts: async ({ page=1, limit=10, search, role, status } = {}) => {
    await delay(350);
    let result = [...MOCK_STAFF_ACCOUNTS];
    if (search) result = result.filter(a => a.full_name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase()));
    if (role)   result = result.filter(a => a.role   === role);
    if (status) result = result.filter(a => a.status === status);
    return { data: paginate(result, page, limit) };
  },

  createStaffAccount: async (data) => {
    await delay(400);
    const account = { id: ++staffAccountCounter, ...data, status:'active', created_at: new Date().toISOString() };
    MOCK_STAFF_ACCOUNTS.push(account);
    addAuditEntry('create', 'staff_account', account.id, { role: data.role });
    return { data: account };
  },

  updateStaffStatus: async (id, status) => {
    await delay(300);
    const account = MOCK_STAFF_ACCOUNTS.find(a => a.id === Number(id));
    if (account) account.status = status;
    addAuditEntry(status==='active'?'reactivate':'deactivate', 'staff_account', Number(id), {});
    return { data: { success: true } };
  },

  resetStaffPassword: async (id) => {
    await delay(300);
    addAuditEntry('reset_password', 'staff_account', Number(id), {});
    return { data: { success: true } };
  },

  // ── Settings ────────────────────────────────────────────────────────
  getSettings: async () => {
    await delay(300);
    return { data: { ...MOCK_SETTINGS } };
  },

  updateSettings: async (updates) => {
    await delay(300);
    Object.assign(MOCK_SETTINGS, updates);
    const field = Object.keys(updates)[0];
    addAuditEntry('update_settings', 'settings', null, { field });
    return { data: { success: true } };
  },

  // ── ESP32 Devices ────────────────────────────────────────────────────
  listDevices: async () => {
    await delay(250);
    return { data: [...MOCK_DEVICES] };
  },

  registerDevice: async (data) => {
    await delay(350);
    const device = { id: ++deviceCounter, ...data, is_online: false };
    MOCK_DEVICES.push(device);
    addAuditEntry('register_device', 'esp32_device', device.id, { label: data.location_label });
    return { data: device };
  },

  removeDevice: async (id) => {
    await delay(300);
    const device = MOCK_DEVICES.find(d => d.id === Number(id));
    MOCK_DEVICES = MOCK_DEVICES.filter(d => d.id !== Number(id));
    addAuditEntry('remove_device', 'esp32_device', Number(id), { label: device?.location_label });
    return { data: { success: true } };
  },

  // ── Audit Log ────────────────────────────────────────────────────────
  getAuditLog: async ({ page=1, limit=20, actor_id, action, from, to } = {}) => {
    await delay(350);
    let result = [...MOCK_AUDIT_LOG];
    if (actor_id) result = result.filter(e => String(e.actor_id) === String(actor_id));
    if (action)   result = result.filter(e => e.action === action);
    if (from)     result = result.filter(e => new Date(e.created_at) >= new Date(from));
    if (to)       result = result.filter(e => new Date(e.created_at) <= new Date(to + 'T23:59:59'));
    return { data: paginate(result, page, limit) };
  },
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
  listCustomerRestrictions: async ({ page = 1, limit = 12, search, restriction_level } = {}) => {
    await delay(350);
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

  getCustomerViolations: async (customerId) => {
    await delay(250);
    const viols = MOCK_VIOLATIONS[Number(customerId)] || [];
    return { data: viols };
  },

  overrideCustomerRestriction: async (customerId, { restriction_level, reason }) => {
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
};

// Re-export customerRestrictionsAPI methods on adminAPI for convenience
Object.assign(adminAPI, {
  listCustomerRestrictions:      customerRestrictionsAPI.listCustomerRestrictions,
  getCustomerViolations:         customerRestrictionsAPI.getCustomerViolations,
  overrideCustomerRestriction:   customerRestrictionsAPI.overrideCustomerRestriction,
});