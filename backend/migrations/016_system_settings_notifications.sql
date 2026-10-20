-- ============================================================
-- MIGRATION 016 — System settings store + notification markers
-- Run: psql $DATABASE_URL -f migrations/016_system_settings_notifications.sql
--
-- Why:
--   1. system_settings — generic key/value store for admin-configurable
--      system options. First user: the `notifications` visibility config
--      that powers the Admin Overview notification bell (which event
--      categories are shown).
--   2. staff_accounts.notification_seen_at — last time the admin marked the
--      notification feed as read; the unread badge is derived from it.
--   3. payments.rejected_at — the reject flow only stored status + reason,
--      so receipt rejections had no timestamp for the notification feed to
--      place on a timeline.
--
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
    key        varchar(100) PRIMARY KEY,
    value      jsonb        NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE staff_accounts
    ADD COLUMN IF NOT EXISTS notification_seen_at timestamp without time zone;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS rejected_at timestamp without time zone;

-- Default notification config: every category visible.
INSERT INTO system_settings (key, value)
VALUES (
    'notifications',
    '{"categories": {"orders": true, "payments": true, "deliveries": true, "inventory": true, "kitchen": true, "customers": true, "system": true}}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- END OF MIGRATION 016
-- ============================================================
