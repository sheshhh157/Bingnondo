-- 019_indexes_from_canonical_schema.sql
-- Adds indexes that exist in the canonical schema but were missing on the live dev database.
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_cashier ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_kitchen_alerts_order ON kitchen_alerts(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_txn_item ON inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_support_chat_messages_chat ON support_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_notifications_staff ON notifications(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_violations_customer ON customer_order_violations(customer_id);
CREATE INDEX IF NOT EXISTS idx_violations_created ON customer_order_violations(created_at);
