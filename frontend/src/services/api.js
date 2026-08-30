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

const MOCK_MENU_ITEMS = [
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
  { id: 11, category_id: 3, name: 'Pancit Bihon',  description: 'Stir-fried rice noodles',         price: 75,  is_available: true,  image_url: null },
  { id: 12, category_id: 3, name: 'Lumpiang Shanghai', description: '5 pcs with sweet chili sauce', price: 65, is_available: true,  image_url: null },
  { id: 13, category_id: 3, name: 'Goto',          description: 'Rice congee with beef tripe',     price: 85,  is_available: true,  image_url: null },
  { id: 14, category_id: 3, name: 'Arroz Caldo',   description: 'Chicken congee with ginger',      price: 80,  is_available: true,  image_url: null },

  // Drinks
  { id: 15, category_id: 4, name: 'Coke Regular',  description: '12oz bottle',                     price: 40,  is_available: true,  image_url: null },
  { id: 16, category_id: 4, name: 'Coke Zero',     description: '12oz bottle',                     price: 40,  is_available: true,  image_url: null },
  { id: 17, category_id: 4, name: 'Iced Tea',      description: 'House blend, 16oz',               price: 45,  is_available: true,  image_url: null },
  { id: 18, category_id: 4, name: 'Bottled Water', description: '500ml',                           price: 25,  is_available: true,  image_url: null },
  { id: 19, category_id: 4, name: 'Pineapple Juice', description: 'Fresh, 16oz',                   price: 55,  is_available: true,  image_url: null },
  { id: 20, category_id: 4, name: 'Hot Coffee',    description: 'Brewed coffee',                   price: 60,  is_available: true,  image_url: null },

  // Add-ons
  { id: 21, category_id: 5, name: 'Extra Rice',    description: '',                                price: 20,  is_available: true,  image_url: null },
  { id: 22, category_id: 5, name: 'Extra Egg',     description: '',                                price: 20,  is_available: true,  image_url: null },
  { id: 23, category_id: 5, name: 'Extra Sauce',   description: '',                                price: 10,  is_available: true,  image_url: null },
];

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

// ─── HELPER: simulate network delay ──────────────────────────────────────────
const delay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  staffLogin: async ({ email, password }) => {
    await delay();
    const accounts = [
      { id: 1, full_name: 'Cashier One',  email: 'cashier@bingnondo.com', password: 'cashier123', role: 'cashier' },
      { id: 2, full_name: 'Kitchen Staff', email: 'kitchen@bingnondo.com', password: 'kitchen123', role: 'kitchen_staff' },
    ];
    const user = accounts.find((a) => a.email === email && a.password === password);
    if (!user) throw { response: { data: { message: 'Invalid credentials. Try again.' } } };
    const { password: _, ...userData } = user;
    return { data: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: userData } };
  },
  logout: async () => { await delay(100); return { data: { message: 'Logged out.' } }; },
};

// ─── MENU ─────────────────────────────────────────────────────────────────────
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

export default { authAPI, menuAPI, ordersAPI, paymentsAPI };
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