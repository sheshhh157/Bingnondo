// Unit catalogue + conversion helpers shared across inventory and recipe UIs.
//
// Units are free strings in the database. This module is the single source of
// truth for the picker options and for converting a recipe unit into an
// ingredient's stock unit (e.g. 1 ml = 0.001 liter).

export const UNIT_OPTIONS = [
  { value: 'pcs',      label: 'Pieces (pcs)' },
  { value: 'kilogram', label: 'Kilogram (kg)' },
  { value: 'gram',     label: 'Gram (g)' },
  { value: 'liter',    label: 'Liter (L)' },
  { value: 'ml',       label: 'Milliliter (ml)' },
  { value: 'pack',     label: 'Pack' },
  { value: 'tub',      label: 'Tub' },
  { value: 'bottle',   label: 'Bottle' },
  { value: 'sachet',   label: 'Sachet' },
  { value: 'cup',      label: 'Cup' },
  { value: 'tbsp',     label: 'Tablespoon (tbsp)' },
  { value: 'tsp',      label: 'Teaspoon (tsp)' },
];

// Short display labels (e.g. "ml", "L") keyed by the stored unit value.
export const UNIT_LABELS = {
  pcs: 'pcs',
  kilogram: 'kg',
  gram: 'g',
  liter: 'L',
  ml: 'ml',
  pack: 'pack',
  tub: 'tub',
  bottle: 'bottle',
  sachet: 'sachet',
  cup: 'cup',
  tbsp: 'tbsp',
  tsp: 'tsp',
};

// How many of the base unit a given unit represents. Base units are the liter
// (volume) and the kilogram (weight); a unit converts to another only when
// both share the same base. Kitchen measures use metric values.
const UNIT_BASE = {
  liter: { base: 'volume', scale: 1 },
  ml:    { base: 'volume', scale: 0.001 },
  cup:   { base: 'volume', scale: 0.25 },
  tbsp:  { base: 'volume', scale: 0.015 },
  tsp:   { base: 'volume', scale: 0.005 },
  kilogram: { base: 'weight', scale: 1 },
  gram:     { base: 'weight', scale: 0.001 },
};

/** Short label for a unit value, falling back to the raw value. */
export function unitLabel(unit) {
  if (!unit) return '';
  return UNIT_LABELS[unit] || unit;
}

/**
 * Multiplier converting `fromUnit` into `toUnit`, or null when the two cannot
 * be converted (different measurement family, or either unit has no rule).
 * Same unit always returns 1.
 */
export function conversionFactor(fromUnit, toUnit) {
  if (!fromUnit || !toUnit) return null;
  if (fromUnit === toUnit) return 1;
  const from = UNIT_BASE[fromUnit];
  const to = UNIT_BASE[toUnit];
  if (!from || !to || from.base !== to.base) return null;
  return from.scale / to.scale;
}

/**
 * Units offered as a recipe unit for an ingredient whose stock is in
 * `stockUnit`: the stock unit itself plus every unit convertible to it. Falls
 * back to the whole catalogue when the stock unit is unknown.
 */
export function recipeUnitOptions(stockUnit) {
  if (!stockUnit) return UNIT_OPTIONS;
  const convertible = UNIT_OPTIONS.filter(
    (u) => u.value === stockUnit || conversionFactor(u.value, stockUnit) != null
  );
  return convertible.length ? convertible : UNIT_OPTIONS;
}
