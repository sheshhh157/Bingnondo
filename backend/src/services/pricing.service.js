const db = require('../config/db');
const { fetchOptionsForItems } = require('../modules/menu/menu.controller');

// ─── Cart pricing ────────────────────────────────────────────────────────────

/** Thrown for any cart problem the caller should turn into a 400. */
class CartError extends Error {
  constructor(message) { super(message); this.name = 'CartError'; }
}

/**
 * Validate a cart and price it from the database. Never trust a client price.
 *
 * The unit price always comes from `menu_items.price` / `menu_item_options.price`
 * as they stand right now, so a tampered or stale payload cannot set its own
 * amount.
 *
 * Variant handling (migration 008):
 *   An item that has options is priced by the option the cashier chose, and
 *   choosing one is mandatory. Silently falling back to `menu_items.price`
 *   would sell "Iced" at the Hot price whenever the UI failed to send an
 *   option, which is exactly the mistake this feature exists to prevent.
 *
 * Shared by createOrder and updateOrderItems. They priced carts with
 * near-identical inline loops, so the rules below previously existed twice and
 * a fix to one did not reach the other.
 */
async function priceCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CartError('Order must contain at least one item.');
  }

  const menuIds = items.map((i) => Number(i.menu_item_id));

  // archived_at IS NULL matters: a removed item must not be orderable by id
  // even though its row still exists for history.
  const menuRes = await db.query(
    `SELECT id, name, price, is_available, archived_at
       FROM menu_items
      WHERE id = ANY($1::int[])`,
    [menuIds]
  );
  const menuMap = Object.fromEntries(menuRes.rows.map((r) => [r.id, r]));

  const optionsByItem = await fetchOptionsForItems(menuIds);
  const optionIds = items
    .map((i) => Number(i.menu_item_option_id))
    .filter((n) => Number.isInteger(n) && n > 0);
  const flavorIds = items
    .map((i) => Number(i.menu_item_flavor_id))
    .filter((n) => Number.isInteger(n) && n > 0);

  // Options are validated in one extra query rather than one per line: the id
  // alone is not enough, because an option id belonging to a *different* item
  // would otherwise price this line.
  let optionMap = {};
  if (optionIds.length > 0 || flavorIds.length > 0) {
    const allIds = [...new Set([...optionIds, ...flavorIds])];
    const optRes = await db.query(
      `SELECT id, menu_item_id, name, price, is_available, option_kind
         FROM menu_item_options
        WHERE id = ANY($1::int[]) AND archived_at IS NULL`,
      [allIds]
    );
    optionMap = Object.fromEntries(optRes.rows.map((r) => [r.id, r]));
  }

  let totalAmount = 0;
  const validated = [];

  for (const item of items) {
    const mi = menuMap[Number(item.menu_item_id)];
    if (!mi || mi.archived_at) {
      throw new CartError(`Menu item ${item.menu_item_id} not found.`);
    }
    if (!mi.is_available) {
      throw new CartError(`"${mi.name}" is currently unavailable.`);
    }

    const qty = Number(item.quantity);
    if (!qty || qty < 1) {
      throw new CartError('Quantity must be at least 1.');
    }

    const itemOptions = optionsByItem.get(mi.id) || [];
    const itemVariants = itemOptions.filter((o) => o.option_kind !== 'flavor');
    const itemFlavors = itemOptions.filter((o) => o.option_kind === 'flavor');

    let unitPrice = parseFloat(mi.price);
    let optionId = null;
    let optionName = null;
    let flavorId = null;
    let flavorName = null;

    // Variant (Hot/Iced, Solo/Sharing): mandatory when the item has any,
    // priced by the option chosen -- same rule as before flavors existed.
    if (itemVariants.length > 0) {
      const requested = Number(item.menu_item_option_id);
      const opt = Number.isInteger(requested) ? optionMap[requested] : null;

      if (!opt || opt.option_kind === 'flavor') {
        const available = itemVariants.filter((o) => o.is_available).map((o) => o.name);
        throw new CartError(
          available.length > 0
            ? `"${mi.name}" needs an option: ${available.join(' or ')}.`
            : `"${mi.name}" has no available options right now.`
        );
      }
      // Guards against an option id from another item being used here.
      if (Number(opt.menu_item_id) !== Number(mi.id)) {
        throw new CartError(`That option does not belong to "${mi.name}".`);
      }
      if (!opt.is_available) {
        throw new CartError(`"${mi.name} (${opt.name})" is currently unavailable.`);
      }

      optionId = opt.id;
      optionName = opt.name;
      unitPrice = parseFloat(opt.price);
    } else if (item.menu_item_option_id != null && item.menu_item_option_id !== '') {
      // An option id for an item with no variants means a flavor id arrived in
      // the variant slot (or a stale payload). Reject rather than guess.
      throw new CartError(`"${mi.name}" has no variant to pick.`);
    }

    // Flavor: optional, one per line, stacked on top of the variant/base price.
    if (item.menu_item_flavor_id != null && item.menu_item_flavor_id !== '') {
      const requested = Number(item.menu_item_flavor_id);
      const opt = Number.isInteger(requested) ? optionMap[requested] : null;

      if (!opt || opt.option_kind !== 'flavor') {
        throw new CartError(`"${mi.name}" has no such flavor.`);
      }
      if (Number(opt.menu_item_id) !== Number(mi.id)) {
        throw new CartError(`That flavor does not belong to "${mi.name}".`);
      }
      if (!opt.is_available) {
        throw new CartError(`"${mi.name} (${opt.name})" is currently unavailable.`);
      }

      flavorId = opt.id;
      flavorName = opt.name;
      unitPrice += parseFloat(opt.price);
    }

    totalAmount += unitPrice * qty;
    validated.push({
      menu_item_id: mi.id,
      menu_item_option_id: optionId,
      option_name: optionName,
      menu_item_flavor_id: flavorId,
      flavor_name: flavorName,
      name: mi.name,
      unit_price: unitPrice,
      quantity: qty,
      notes: item.notes || null,
    });
  }

  return { totalAmount, validated };
}

module.exports = { priceCart, CartError };
