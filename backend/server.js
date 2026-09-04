const express = require('express');
const cors = require('cors');
const db = require('./data');

const app = express();

app.use(cors());
app.use(express.json());

// ─── Health / test ─────────────────────────────────────────────────────────
app.get('/api/test', (_req, res) => {
  res.json({ message: 'Manager backend is running (read-only).' });
});

// ─── Read-only Manager endpoints ───────────────────────────────────────────
app.get('/api/manager/orders', (_req, res) => {
  res.json({ data: db.getOrders() });
});

app.get('/api/manager/orders/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  res.json({ data: order });
});

app.get('/api/manager/inventory', (_req, res) => {
  res.json({ data: { items: db.getInventory() } });
});

app.get('/api/manager/kitchen', (_req, res) => {
  res.json({ data: db.getKitchenOrders() });
});

app.get('/api/manager/kitchen/alerts', (_req, res) => {
  res.json({ data: db.getKitchenAlerts() });
});

app.get('/api/manager/deliveries', (_req, res) => {
  res.json({ data: db.getDeliveries() });
});

// ─── 404 for unknown routes ────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Manager backend running on http://localhost:${PORT}`);
});
