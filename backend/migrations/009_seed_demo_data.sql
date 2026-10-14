-- ============================================================
-- MIGRATION 009 — Seed demo data
-- Run: psql $DATABASE_URL -f migrations/009_seed_demo_data.sql
--
-- Why: the imported schema was schema-only, so every dashboard (menu,
--      inventory, sales report, kitchen, delivery) rendered empty.
--
-- Contents: menu categories + items + ingredient links, inventory,
--           business hours, a few customers, a spread of orders
--           (historical paid + today's live kitchen queue),
--           payments, status history and deliveries.
--
-- Safe to run multiple times: the whole seed is skipped when menu_items
-- already has rows. Names (not ids) are used to resolve foreign keys.
-- ============================================================

DO $$
DECLARE
    cashier int := (SELECT id FROM staff_accounts WHERE email = 'cashier@bingnondo.com');

    c1 int;
    c2 int;
    c3 int;

    o1  int; o2  int; o3  int; o4  int;
    o5  int; o6  int; o7  int; o8  int;
    o9  int; o10 int; o11 int; o12 int;
BEGIN
    IF EXISTS (SELECT 1 FROM menu_items) THEN
        RAISE NOTICE 'Demo data already present (menu_items not empty) — skipping seed.';
        RETURN;
    END IF;

    ------------------------------------------------------------------
    -- Categories
    ------------------------------------------------------------------
    INSERT INTO menu_categories (name, display_order) VALUES
        ('Breakfast', 1),
        ('Rice Meals', 2),
        ('Soups', 3),
        ('Noodles', 4),
        ('Snacks', 5),
        ('Beverages', 6),
        ('Extras', 7);

    ------------------------------------------------------------------
    -- Inventory
    ------------------------------------------------------------------
    INSERT INTO inventory_items (name, unit, current_stock, reorder_level) VALUES
        ('Beef Tapa',        'g',   2400, 500),
        ('Longganisa',       'pcs',   80,  20),
        ('Tocino',           'g',   1800, 400),
        ('Bangus',           'pcs',   12,  10),
        ('Spam',             'can',    4,   6),
        ('Corned Beef',      'can',   18,   6),
        ('Chicken',          'g',   3200, 800),
        ('Pork',             'g',      0, 600),
        ('Eggs',             'pcs',   55,  24),
        ('Jasmine Rice',     'kg',    22,   5),
        ('Garlic',           'g',    350, 150),
        ('Cooking Oil',      'ml',  1200, 500),
        ('Soy Sauce',        'ml',   800, 300),
        ('Calamansi',        'pcs',   30,  20),
        ('Tamarind',         'g',      0, 100),
        ('Rice Noodles',     'g',    900, 250),
        ('Spring Roll Wrap', 'pcs',   60,  30),
        ('Ground Pork',      'g',   1100, 300),
        ('Ginger',           'g',    180,  80),
        ('Brewed Coffee',    'g',    450, 100);

    ------------------------------------------------------------------
    -- Menu items (category resolved by name)
    ------------------------------------------------------------------
    INSERT INTO menu_items (category_id, name, description, price, is_available)
    SELECT c.id, v.name, v.descr, v.price, TRUE
    FROM (VALUES
        ('Breakfast',  'Tapsilog',          'Beef tapa, garlic rice and egg',        120.00),
        ('Breakfast',  'Longsilog',         'Sweet pork sausage, garlic rice and egg',110.00),
        ('Breakfast',  'Tocilog',           'Cured pork tocino, garlic rice and egg', 110.00),
        ('Breakfast',  'Bangsilog',         'Fried milkfish, garlic rice and egg',    130.00),
        ('Breakfast',  'Spamsilog',         'Spam, garlic rice and egg',              140.00),
        ('Breakfast',  'Bistek Rice',       'Beef steak with onions on rice',         145.00),
        ('Rice Meals', 'Adobo Rice',        'Pork adobo with garlic rice',            105.00),
        ('Rice Meals', 'Fried Chicken',     'Fried chicken with rice',                135.00),
        ('Rice Meals', 'Goto',              'Rice porridge with ginger',               85.00),
        ('Rice Meals', 'Arroz Caldo',       'Chicken rice porridge',                   80.00),
        ('Soups',      'Sinigang Set',      'Pork sinigang soup',                     150.00),
        ('Noodles',    'Pancit Bihon',      'Stir-fried rice noodles',                 75.00),
        ('Snacks',     'Lumpiang Shanghai', 'Fried spring rolls',                      65.00),
        ('Beverages',  'Iced Tea',          'House iced tea',                          45.00),
        ('Beverages',  'Coke Regular',      'Coke in can',                             40.00),
        ('Beverages',  'Coke Zero',         'Coke Zero in can',                        40.00),
        ('Beverages',  'Bottled Water',     '500ml bottled water',                     25.00),
        ('Beverages',  'Pineapple Juice',   'Bottled pineapple juice',                 55.00),
        ('Beverages',  'Hot Coffee',        'Brewed coffee',                           60.00),
        ('Extras',     'Extra Rice',        'Additional cup of rice',                  20.00),
        ('Extras',     'Extra Egg',         'Additional fried egg',                    20.00)
    ) AS v(cat, name, descr, price)
    JOIN menu_categories c ON c.name = v.cat;

    ------------------------------------------------------------------
    -- Menu item ingredients (both sides resolved by name)
    ------------------------------------------------------------------
    INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required)
    SELECT mi.id, inv.id, v.q
    FROM (VALUES
        ('Tapsilog',         'Beef Tapa',        150),
        ('Tapsilog',         'Eggs',               1),
        ('Tapsilog',         'Jasmine Rice',     0.2),
        ('Longsilog',        'Longganisa',         3),
        ('Longsilog',        'Eggs',               1),
        ('Longsilog',        'Jasmine Rice',     0.2),
        ('Tocilog',          'Tocino',           120),
        ('Tocilog',          'Eggs',               1),
        ('Tocilog',          'Jasmine Rice',     0.2),
        ('Bangsilog',        'Bangus',             1),
        ('Bangsilog',        'Eggs',               1),
        ('Bangsilog',        'Jasmine Rice',     0.2),
        ('Spamsilog',        'Spam',               1),
        ('Spamsilog',        'Eggs',               1),
        ('Spamsilog',        'Jasmine Rice',     0.2),
        ('Bistek Rice',      'Beef Tapa',        180),
        ('Bistek Rice',      'Garlic',            10),
        ('Bistek Rice',      'Jasmine Rice',     0.2),
        ('Adobo Rice',       'Pork',             150),
        ('Adobo Rice',       'Soy Sauce',         30),
        ('Adobo Rice',       'Garlic',            10),
        ('Adobo Rice',       'Jasmine Rice',     0.2),
        ('Fried Chicken',    'Chicken',          200),
        ('Fried Chicken',    'Cooking Oil',       50),
        ('Fried Chicken',    'Jasmine Rice',     0.2),
        ('Goto',             'Jasmine Rice',    0.15),
        ('Goto',             'Ginger',            10),
        ('Arroz Caldo',      'Chicken',          120),
        ('Arroz Caldo',      'Ginger',            10),
        ('Arroz Caldo',      'Jasmine Rice',    0.15),
        ('Sinigang Set',     'Pork',             200),
        ('Sinigang Set',     'Tamarind',          30),
        ('Sinigang Set',     'Calamansi',          2),
        ('Pancit Bihon',     'Rice Noodles',     150),
        ('Pancit Bihon',     'Soy Sauce',         20),
        ('Pancit Bihon',     'Garlic',             8),
        ('Lumpiang Shanghai','Spring Roll Wrap',   6),
        ('Lumpiang Shanghai','Ground Pork',      120),
        ('Lumpiang Shanghai','Garlic',             5),
        ('Iced Tea',         'Brewed Coffee',     10)
    ) AS v(menu_name, inv_name, q)
    JOIN menu_items      mi  ON mi.name  = v.menu_name
    JOIN inventory_items inv ON inv.name = v.inv_name;

    ------------------------------------------------------------------
    -- Business hours (Mon-Sun, 08:00-21:00)
    ------------------------------------------------------------------
    INSERT INTO business_hours (day_of_week, open_time, close_time, is_closed)
    SELECT d, TIME '08:00', TIME '21:00', FALSE
    FROM generate_series(0, 6) AS d;

    ------------------------------------------------------------------
    -- Customers (for delivery orders)
    ------------------------------------------------------------------
    INSERT INTO customers
        (email, password_hash, email_verified, first_name, last_name, mobile_number, address, profile_completed, status)
    VALUES
        ('juan@example.com',  'seed-no-login', TRUE, 'Juan',  'Dela Cruz', '09171234567', '123 Mabini St, Manila',    TRUE, 'active')
    RETURNING id INTO c1;

    INSERT INTO customers
        (email, password_hash, email_verified, first_name, last_name, mobile_number, address, profile_completed, status)
    VALUES
        ('maria@example.com', 'seed-no-login', TRUE, 'Maria', 'Santos',    '09171234568', '45 Rizal Ave, Quezon City', TRUE, 'active')
    RETURNING id INTO c2;

    INSERT INTO customers
        (email, password_hash, email_verified, first_name, last_name, mobile_number, address, profile_completed, status)
    VALUES
        ('pedro@example.com', 'seed-no-login', TRUE, 'Pedro', 'Bautista',  '09171234569', '8 Bonifacio Rd, Pasig',     TRUE, 'active')
    RETURNING id INTO c3;

    ------------------------------------------------------------------
    -- Historical orders (paid) — drive the sales report
    ------------------------------------------------------------------
    INSERT INTO orders (order_type, cashier_id, status, order_channel, total_amount, created_at)
    VALUES ('counter', cashier, 'completed', 'web_counter', 165.00, now() - interval '1 day') RETURNING id INTO o1;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o1, mi.id, v.q, mi.price
    FROM (VALUES ('Tapsilog',1),('Iced Tea',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at)
    VALUES (o1, 'cash', 165.00, 'paid', now() - interval '1 day');
    INSERT INTO order_status_history (order_id, status) VALUES (o1, 'completed');

    INSERT INTO orders (order_type, cashier_id, status, order_channel, total_amount, created_at)
    VALUES ('counter', cashier, 'completed', 'web_counter', 135.00, now() - interval '1 day 3 hours') RETURNING id INTO o2;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o2, mi.id, v.q, mi.price
    FROM (VALUES ('Longsilog',1),('Bottled Water',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at)
    VALUES (o2, 'gcash', 135.00, 'paid', now() - interval '1 day 3 hours');
    INSERT INTO order_status_history (order_id, status) VALUES (o2, 'completed');

    INSERT INTO orders (order_type, cashier_id, status, order_channel, total_amount, created_at)
    VALUES ('counter', cashier, 'completed', 'web_counter', 170.00, now() - interval '2 days') RETURNING id INTO o3;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o3, mi.id, v.q, mi.price
    FROM (VALUES ('Sinigang Set',1),('Extra Rice',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at)
    VALUES (o3, 'cash', 170.00, 'paid', now() - interval '2 days');
    INSERT INTO order_status_history (order_id, status) VALUES (o3, 'completed');

    INSERT INTO orders (order_type, customer_id, status, order_channel, total_amount, created_at)
    VALUES ('online', c1, 'completed', 'online', 185.00, now() - interval '2 days 4 hours') RETURNING id INTO o4;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o4, mi.id, v.q, mi.price
    FROM (VALUES ('Bangsilog',1),('Pineapple Juice',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at)
    VALUES (o4, 'gcash', 185.00, 'paid', now() - interval '2 days 4 hours');
    INSERT INTO order_status_history (order_id, status) VALUES (o4, 'completed');

    INSERT INTO orders (order_type, cashier_id, status, order_channel, total_amount, created_at)
    VALUES ('counter', cashier, 'completed', 'web_counter', 175.00, now() - interval '3 days') RETURNING id INTO o5;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o5, mi.id, v.q, mi.price
    FROM (VALUES ('Fried Chicken',1),('Coke Regular',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at)
    VALUES (o5, 'cash', 175.00, 'paid', now() - interval '3 days');
    INSERT INTO order_status_history (order_id, status) VALUES (o5, 'completed');

    INSERT INTO orders (order_type, customer_id, status, order_channel, total_amount, created_at)
    VALUES ('online', c2, 'completed', 'online', 255.00, now() - interval '4 days') RETURNING id INTO o6;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o6, mi.id, v.q, mi.price
    FROM (VALUES ('Adobo Rice',2),('Iced Tea',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at)
    VALUES (o6, 'gcash', 255.00, 'paid', now() - interval '4 days');
    INSERT INTO order_status_history (order_id, status) VALUES (o6, 'completed');

    INSERT INTO orders (order_type, cashier_id, status, order_channel, total_amount, created_at)
    VALUES ('counter', cashier, 'completed', 'web_counter', 145.00, now() - interval '5 days') RETURNING id INTO o7;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o7, mi.id, v.q, mi.price
    FROM (VALUES ('Goto',1),('Hot Coffee',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at)
    VALUES (o7, 'cash', 145.00, 'paid', now() - interval '5 days');
    INSERT INTO order_status_history (order_id, status) VALUES (o7, 'completed');

    INSERT INTO orders (order_type, customer_id, status, order_channel, total_amount, created_at)
    VALUES ('online', c3, 'completed', 'online', 245.00, now() - interval '6 days') RETURNING id INTO o8;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o8, mi.id, v.q, mi.price
    FROM (VALUES ('Pancit Bihon',1),('Lumpiang Shanghai',2),('Coke Zero',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at)
    VALUES (o8, 'gcash', 245.00, 'paid', now() - interval '6 days');
    INSERT INTO order_status_history (order_id, status) VALUES (o8, 'completed');

    ------------------------------------------------------------------
    -- Live kitchen queue (today, unpaid/available to cook)
    ------------------------------------------------------------------
    INSERT INTO orders (order_type, cashier_id, status, order_channel, total_amount, special_request, created_at)
    VALUES ('counter', cashier, 'pending', 'web_counter', 260.00, 'Extra crispy tapa please', now() - interval '20 minutes') RETURNING id INTO o9;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o9, mi.id, v.q, mi.price
    FROM (VALUES ('Tapsilog',2),('Extra Rice',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status) VALUES (o9, 'cash', 260.00, 'pending');
    INSERT INTO order_status_history (order_id, status) VALUES (o9, 'pending');

    INSERT INTO orders (order_type, cashier_id, status, order_channel, total_amount, created_at)
    VALUES ('counter', cashier, 'confirmed', 'web_counter', 130.00, now() - interval '12 minutes') RETURNING id INTO o10;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o10, mi.id, v.q, mi.price
    FROM (VALUES ('Longsilog',1),('Extra Egg',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status) VALUES (o10, 'cash', 130.00, 'pending');
    INSERT INTO order_status_history (order_id, status) VALUES (o10, 'pending'), (o10, 'confirmed');

    INSERT INTO orders (order_type, cashier_id, status, order_channel, total_amount, created_at)
    VALUES ('counter', cashier, 'preparing', 'web_counter', 195.00, now() - interval '6 minutes') RETURNING id INTO o11;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o11, mi.id, v.q, mi.price
    FROM (VALUES ('Sinigang Set',1),('Iced Tea',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status) VALUES (o11, 'cash', 195.00, 'pending');
    INSERT INTO order_status_history (order_id, status) VALUES (o11, 'pending'), (o11, 'confirmed'), (o11, 'preparing');

    INSERT INTO orders (order_type, customer_id, status, order_channel, total_amount, created_at)
    VALUES ('online', c1, 'ready', 'online', 170.00, now() - interval '30 minutes') RETURNING id INTO o12;
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    SELECT o12, mi.id, v.q, mi.price
    FROM (VALUES ('Bangsilog',1),('Coke Regular',1)) AS v(nm,q) JOIN menu_items mi ON mi.name = v.nm;
    INSERT INTO payments (order_id, method, amount, status, paid_at) VALUES (o12, 'gcash', 170.00, 'paid', now() - interval '28 minutes');
    INSERT INTO order_status_history (order_id, status) VALUES (o12, 'confirmed'), (o12, 'preparing'), (o12, 'ready');

    ------------------------------------------------------------------
    -- Deliveries (for the online orders)
    ------------------------------------------------------------------
    INSERT INTO deliveries (order_id, delivery_preference, status, delivered_at) VALUES
        (o4,  'lalamove',     'delivered', now() - interval '2 days'),
        (o6,  'own_delivery', 'delivered', now() - interval '4 days'),
        (o8,  'lalamove',     'delivered', now() - interval '6 days');

    INSERT INTO deliveries (order_id, delivery_preference, status) VALUES
        (o12, 'own_delivery', 'pending_assignment');

    RAISE NOTICE 'Demo data seeded successfully.';
END $$;

-- ============================================================
-- END OF MIGRATION 009
-- ============================================================
