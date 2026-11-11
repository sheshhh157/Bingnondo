CREATE TABLE IF NOT EXISTS archived_records (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  VARCHAR(40) NOT NULL,
  entity_id    BIGINT NOT NULL,
  display_name TEXT NOT NULL,
  payload      JSONB NOT NULL,
  archived_by INTEGER,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_archived_records_expires_at
  ON archived_records (expires_at);

CREATE INDEX IF NOT EXISTS idx_archived_records_entity
  ON archived_records (entity_type, entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_archived_records_entity
  ON archived_records (entity_type, entity_id);

INSERT INTO archived_records
  (entity_type, entity_id, display_name, payload, archived_at, expires_at)
SELECT 'menu_item',
       mi.id,
       mi.name,
       jsonb_build_object(
         'is_available', mi.is_available,
         'image_public_id', mi.image_public_id
       ),
       COALESCE(mi.deleted_at, CURRENT_TIMESTAMP),
       COALESCE(mi.deleted_at, CURRENT_TIMESTAMP) + INTERVAL '30 days'
  FROM menu_items mi
 WHERE mi.is_deleted = TRUE
   AND NOT EXISTS (
     SELECT 1
       FROM archived_records a
      WHERE a.entity_type = 'menu_item'
        AND a.entity_id = mi.id
   );
