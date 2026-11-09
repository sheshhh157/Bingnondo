// Shared input validation helpers.
//
// Two kinds of helpers live here:
//   • sanitizers — strip characters that don't belong in a field *as the user
//     types*, so a numeric field never contains letters and a name field never
//     contains symbols.
//   • validators — return an error message (or an empty string) and are safe to
//     call on every render for real-time feedback.
//
// Lengths mirror the database column sizes so the UI and backend agree.

export const LIMITS = {
  menuName: 150,
  inventoryName: 150,
  personName: 100,
  shortName: 100, // categories, variant groups, option names
  description: 1000,
  textarea: 500,
  note: 255,
  email: 255,
  riderEmail: 150,
  password: 128,
  mobile: 13,
  plate: 30,
  url: 200,
  ssid: 32,
  wifiPassword: 64,
};

// numeric(10,2) in Postgres caps out just below 100 million.
export const MAX_AMOUNT = 99_999_999.99;
export const MIN_PRICE = 0.01;

const PERSON_NAME_ALLOWED  = /[^\p{L}\p{M}\s.''\-]/gu;
const PRODUCT_NAME_ALLOWED = /[^\p{L}\p{M}\p{N}\s&'.,()/+\-–]/gu;
const PLATE_ALLOWED        = /[^\p{L}\p{N}\s-]/gu;

/** Case/whitespace-insensitive key used for duplicate comparisons. */
export function normalizeKey(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Returns the first item whose `getValue(item)` matches `value`, ignoring the
 * row with `excludeId` (used when editing the row itself). Null when unique.
 */
export function findDuplicate(value, list, getValue, excludeId = null) {
  const key = normalizeKey(value);
  if (!key || !Array.isArray(list)) return null;
  return list.find((row) => (
    row.id !== excludeId && normalizeKey(getValue(row)) === key
  )) ?? null;
}

export function isDuplicate(value, list, getValue, excludeId = null) {
  return findDuplicate(value, list, getValue, excludeId) != null;
}

// ── Sanitizers ────────────────────────────────────────────────────────────────

/** Letters, spaces and common name punctuation (no digits). */
export function sanitizePersonName(value, maxLength = LIMITS.personName) {
  return String(value ?? '').replace(PERSON_NAME_ALLOWED, '').slice(0, maxLength);
}

/** Letters, digits, spaces and common product punctuation. */
export function sanitizeProductName(value, maxLength = LIMITS.menuName) {
  return String(value ?? '').replace(PRODUCT_NAME_ALLOWED, '').slice(0, maxLength);
}

/** Digits with at most one decimal point and a fixed number of decimals. */
export function sanitizeDecimal(value, { maxDecimals = 2, maxIntegerDigits = 8 } = {}) {
  const raw = String(value ?? '').replace(/[^\d.]/g, '');
  const firstDot = raw.indexOf('.');
  const integer = (firstDot === -1 ? raw : raw.slice(0, firstDot))
    .replace(/^0+(?=\d)/, '')
    .slice(0, maxIntegerDigits);
  if (firstDot === -1) return integer;
  const decimals = raw.slice(firstDot + 1).replace(/\./g, '').slice(0, maxDecimals);
  return `${integer}.${decimals}`;
}

/** Digits only, capped at `maxLength` characters. */
export function sanitizeInteger(value, maxLength = 9) {
  return String(value ?? '').replace(/\D/g, '').slice(0, maxLength);
}

/** No whitespace; limits length. Address characters are otherwise left alone. */
export function sanitizeEmail(value, maxLength = LIMITS.email) {
  return String(value ?? '').replace(/\s+/g, '').slice(0, maxLength);
}

/** Digits and the punctuation used in phone numbers (+, spaces, (), -). */
export function sanitizePhone(value, maxLength = LIMITS.mobile) {
  return String(value ?? '').replace(/[^\d+\s()-]/g, '').slice(0, maxLength);
}

/** Alphanumeric plate with spaces and hyphens, normalised to uppercase. */
export function sanitizePlate(value, maxLength = LIMITS.plate) {
  return String(value ?? '').replace(PLATE_ALLOWED, '').toUpperCase().slice(0, maxLength);
}

// ── Validators ────────────────────────────────────────────────────────────────

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? '').trim());
}

/** Philippine mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX. */
export function isValidPhMobile(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^(09\d{9}|639\d{9})$/.test(digits);
}

/**
 * Validates a numeric amount. Returns '' when valid.
 * Empty values are reported as required unless `required` is false.
 */
export function validateAmount(value, {
  label = 'Amount',
  min = 0,
  max = MAX_AMOUNT,
  required = true,
  maxDecimals = 2,
} = {}) {
  const raw = String(value ?? '').trim();
  if (raw === '') return required ? `${label} is required.` : '';
  if (!/^\d+(\.\d+)?$/.test(raw)) return `${label} must contain numbers only.`;
  if (/\.\d+/.test(raw) && raw.split('.')[1].length > maxDecimals) {
    return `${label} allows up to ${maxDecimals} decimal places.`;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label} must be a valid number.`;
  if (n < min) return `${label} must be at least ${min}.`;
  if (n > max) return `${label} must be ${max} or less.`;
  return '';
}

/** Required text with an optional minimum and a maximum length. */
export function validateText(value, {
  label = 'This field',
  min = 1,
  max = LIMITS.shortName,
  required = true,
} = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return required ? `${label} is required.` : '';
  if (trimmed.length < min) return `${label} must be at least ${min} character${min === 1 ? '' : 's'}.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  return '';
}

/**
 * Validates a person's name (letters/spaces only, no digits).
 * Returns '' when valid.
 */
export function validatePersonName(value, {
  label = 'Full name',
  max = LIMITS.personName,
  required = true,
  list = null,
  excludeId = null,
} = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return required ? `${label} is required.` : '';
  if (/\d/.test(trimmed)) return `${label} must not contain numbers.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  if (list && isDuplicate(trimmed, list, (r) => r.full_name ?? r.name ?? '', excludeId)) {
    return `This ${label.toLowerCase()} is already in use.`;
  }
  return '';
}

/**
 * Validates an email address in real-time.
 * Shows a soft warning while the user is still typing (no @ yet),
 * and a hard error once the input looks "done" (has an @ but invalid).
 */
export function validateEmail(value, {
  label = 'Email',
  required = true,
  max = LIMITS.email,
} = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return required ? `${label} is required.` : '';
  if (raw.length > max) return `${label} must be ${max} characters or fewer.`;
  if (!raw.includes('@')) return ''; // still typing — no error yet
  if (!isValidEmail(raw)) return `Enter a valid ${label.toLowerCase()} address.`;
  return '';
}

/**
 * Validates a Philippine mobile number.
 * Returns '' when valid or still incomplete (non-blocking while typing).
 */
export function validatePhMobile(value, {
  label = 'Mobile number',
  required = true,
} = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return required ? `${label} is required.` : '';
  const digits = raw.replace(/\D/g, '');
  // Don't show an error until enough digits have been entered
  if (digits.length < 10) return '';
  if (!isValidPhMobile(raw)) return `Enter a valid ${label.toLowerCase()} (e.g. 09XX XXX XXXX).`;
  return '';
}

/**
 * Validates a password (required min 8 chars, optional max).
 */
export function validatePassword(value, {
  label = 'Password',
  min = 8,
  max = LIMITS.password,
  required = true,
} = {}) {
  const raw = String(value ?? '');
  if (!raw) return required ? `${label} is required.` : '';
  if (raw.length < min) return `${label} must be at least ${min} characters.`;
  if (raw.length > max) return `${label} must be ${max} characters or fewer.`;
  return '';
}

/**
 * Validates a short name (category, variant group, ingredient name, etc.)
 * Rejects values that are purely numeric.
 */
export function validateShortName(value, {
  label = 'Name',
  max = LIMITS.shortName,
  required = true,
  list = null,
  getValue = null,
  excludeId = null,
} = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return required ? `${label} is required.` : '';
  if (/^\d+$/.test(trimmed)) return `${label} must not be numbers only.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  if (list && getValue && isDuplicate(trimmed, list, getValue, excludeId)) {
    return `This ${label.toLowerCase()} already exists.`;
  }
  return '';
}

/**
 * Validates a non-negative stock / quantity number (allows decimals).
 * Returns '' when valid.
 */
export function validateStockNumber(value, {
  label = 'Value',
  required = false,
  min = 0,
  max = 999_999,
} = {}) {
  const raw = String(value ?? '').trim();
  if (raw === '') return required ? `${label} is required.` : '';
  if (!/^\d+(\.\d+)?$/.test(raw)) return `${label} must be a number.`;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) return `${label} must be ${min} or greater.`;
  if (n > max) return `${label} must be ${max} or less.`;
  return '';
}