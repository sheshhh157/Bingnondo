-- 011_variant_flavor_options.sql
--
-- Split menu_item_options into variant rows (Hot / Iced, Solo / Sharing) and
-- flavor rows, and let an order line carry BOTH: a Rice Meal is sold as
-- Solo (₱80) + Adobo flavor (+₱0..) rather than forcing the cashier to treat
-- the flavor as either/or the variant. Before this, order_items had only
-- menu_item_option_id, so one line could never sell "Solo with Adobo".
--
-- option_kind backfill is name-driven: the preset variant names are the only
-- things the column ever enumerated, and every other option ever saved through
-- the flavors UI is a flavor. The partial-unique index on (menu_item_id, name)
-- from 009 keeps a variant and a flavor from sharing a name within one item,
-- so the name test cannot be fooled by reuse across kinds.
--
-- order_items.menu_item_flavor_id backfill preserves history: lines whose
-- option now reads as a flavor move to the new column, keeping the same row
-- id, and unit_price snapshots are left untouched so old receipts keep
-- resolving to the amounts actually charged.

ALTER TABLE menu_item_options
  ADD COLUMN IF NOT EXISTS option_kind text NOT NULL DEFAULT 'variant';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_options_option_kind_check'
  ) THEN
    ALTER TABLE menu_item_options
      ADD CONSTRAINT menu_item_options_option_kind_check
      CHECK (option_kind IN ('variant', 'flavor'));
  END IF;
END $$;

UPDATE menu_item_options
   SET option_kind = 'flavor'
 WHERE lower(name) NOT IN ('hot', 'iced', 'solo', 'sharing');

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS menu_item_flavor_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_menu_item_flavor_id_fkey'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_menu_item_flavor_id_fkey
      FOREIGN KEY (menu_item_flavor_id) REFERENCES menu_item_options(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_flavor
  ON order_items (menu_item_flavor_id)
  WHERE menu_item_flavor_id IS NOT NULL;

UPDATE order_items oi
   SET menu_item_flavor_id = oi.menu_item_option_id,
       menu_item_option_id = NULL
  FROM menu_item_options mio
 WHERE mio.id = oi.menu_item_option_id
   AND mio.option_kind = 'flavor';

COMMENT ON COLUMN menu_item_options.option_kind IS
  'What the option represents: a variant of the item''s form (variant) or an '
  'add-on flavor choice (flavor). Variant and flavor prices stack on a line.';

COMMENT ON COLUMN order_items.menu_item_flavor_id IS
  'Flavor sold on this line, on top of menu_item_option_id (NULL when the '
  'customer picked no flavor). Archived, never deleted, same history '
  'guarantee as menu_item_option_id.';
