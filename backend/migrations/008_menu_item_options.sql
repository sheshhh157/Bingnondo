-- 008_menu_item_options.sql
--
-- Menu items that have more than one sellable form at different prices --
-- the "Coffee is either Hot or Iced" case.
--
-- Why a child table rather than two menu_items rows:
--   Two rows means two names to keep in sync ("Cappuccino" / "Iced
--   Cappuccino"), two photos, two ingredient links, two availability
--   toggles, and a customer who cannot tell whether the drink they want
--   is missing from the menu or simply filed under the wrong item. It
--   also puts a real drink on the menu that the cafe does not sell in
--   that form, since the parent row still has to carry a price.
--
-- Why an ABSOLUTE price on each option, not a price delta:
--   A delta has to be added to something to become a price, which means
--   the authoritative figure is split across two columns and can drift.
--   With an absolute price the amount charged is readable in one place,
--   and that is the number the receipt, the revenue report and the
--   payment record all need to agree on.
--
--   menu_items.price is left alone. It stays the "from" price the menu
--   shows for an item that has options, and is what an item with no
--   options is charged. createOrder refuses an optionless order for an
--   item that does have options, so the two can never disagree about a
--   real sale.
--
-- archived_at, not DELETE:
--   Same reasoning as migration 007. order_items stores no name snapshot
--   for the option, so removing the row would leave a receipt with a
--   variant that cannot be named. The FK below is deliberately left as
--   NO ACTION so a hard delete is refused rather than silently orphaning
--   history; options are archived instead.

CREATE TABLE IF NOT EXISTS menu_item_options (
  id            serial PRIMARY KEY,
  menu_item_id  integer NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name          text NOT NULL,
  price         numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available  boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE menu_item_options IS
  'Sellable variants of a menu item (e.g. Hot / Iced for one coffee). '
  'price is the absolute amount charged for this variant.';

-- One "Hot" per item -- but only among LIVE rows. This has to be a partial
-- index rather than a table-level UNIQUE (menu_item_id, name): a plain UNIQUE
-- also counts archived rows, so switching a drink's Hot/Iced toggle off and
-- back on again would hit a duplicate-key error and fail the save. With a
-- partial index the name is reusable once the old row is archived, and the
-- archived row stays put so old receipts still resolve.
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_item_options_active_name
  ON menu_item_options (menu_item_id, name)
  WHERE archived_at IS NULL;

-- Recorded on the order line so a receipt can still say which variant was
-- sold after the option is archived.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS menu_item_option_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_menu_item_option_id_fkey'
  ) THEN
    -- NO ACTION on purpose: see the note above. Archiving keeps history.
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_menu_item_option_id_fkey
      FOREIGN KEY (menu_item_option_id) REFERENCES menu_item_options(id);
  END IF;
END $$;

COMMENT ON COLUMN order_items.menu_item_option_id IS
  'Variant sold on this line. NULL for items that have no options. The '
  'referenced row is archived, never deleted, so the variant name on an '
  'old receipt keeps resolving.';

-- Menu lookups filter archived rows and sort by sort_order.
CREATE INDEX IF NOT EXISTS idx_menu_item_options_item
  ON menu_item_options (menu_item_id)
  WHERE archived_at IS NULL;

-- Order line reads join on the option to recover its name.
CREATE INDEX IF NOT EXISTS idx_order_items_option
  ON order_items (menu_item_option_id)
  WHERE menu_item_option_id IS NOT NULL;