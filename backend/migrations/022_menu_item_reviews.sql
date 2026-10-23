-- ============================================================
-- MIGRATION 022 — Menu item ratings & reviews
-- ============================================================
-- Why: the customer app shows a "Ratings & Reviews" section on each menu
-- item, but the backend endpoint behind it was never built. This table backs
-- GET /api/menu/items/:id/reviews.
--
-- A row is one star rating (1-5) and an optional comment left against a menu
-- item. customer_id links to the reviewing account when known; author_name is
-- a snapshot captured at write time so the display survives account deletion
-- or renaming. Both the app and the manager dashboard read from here.
--
-- Safe to run multiple times (IF NOT EXISTS / guarded DO blocks).

CREATE SEQUENCE IF NOT EXISTS menu_item_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS menu_item_reviews (
    id           integer     NOT NULL DEFAULT nextval('menu_item_reviews_id_seq'::regclass),
    menu_item_id integer     NOT NULL,
    customer_id  integer,
    author_name  character varying(100) NOT NULL,
    rating       smallint    NOT NULL,
    comment      text,
    created_at   timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER SEQUENCE menu_item_reviews_id_seq OWNED BY menu_item_reviews.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_reviews_pkey'
    ) THEN
        ALTER TABLE menu_item_reviews
            ADD CONSTRAINT menu_item_reviews_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_reviews_menu_item_id_fkey'
    ) THEN
        ALTER TABLE menu_item_reviews
            ADD CONSTRAINT menu_item_reviews_menu_item_id_fkey
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;
    END IF;
END $$;

-- The reviewing account may be deleted; keep the review and null the link.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_reviews_customer_id_fkey'
    ) THEN
        ALTER TABLE menu_item_reviews
            ADD CONSTRAINT menu_item_reviews_customer_id_fkey
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_reviews_rating_check'
    ) THEN
        ALTER TABLE menu_item_reviews
            ADD CONSTRAINT menu_item_reviews_rating_check
            CHECK (rating BETWEEN 1 AND 5);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_item_reviews_menu_item_id
    ON menu_item_reviews USING btree (menu_item_id);

CREATE INDEX IF NOT EXISTS idx_menu_item_reviews_customer_id
    ON menu_item_reviews USING btree (customer_id);

-- One review per customer per item, so re-submitting updates instead of
-- duplicating. Partial: anonymous/seed rows (customer_id IS NULL) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_item_reviews_item_customer
    ON menu_item_reviews USING btree (menu_item_id, customer_id)
    WHERE customer_id IS NOT NULL;

-- ============================================================
-- END OF MIGRATION 022
-- ============================================================
