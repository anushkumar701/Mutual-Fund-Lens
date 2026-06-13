// Centralized Expense Ratio lookup with 2-tier fallback:
//   1. User-overridden value (from localStorage)
//   2. AMFI TER data (src/data/expenseRatios.json) — most accurate

import terDataRaw from '../data/expenseRatios.json';

// Pre-process: the JSON has { _meta, funds } structure
const terFunds = terDataRaw?.funds || {};
const terMeta = terDataRaw?._meta || null;

// localStorage key for user-overridden expense ratios
const USER_ER_KEY = 'fundlens_user_expense_ratios';

/**
 * Normalize a scheme name the same way the build script does.
 * Strips plan/option suffixes so we can match against the AMFI data keys.
 */
function normalizeKey(name) {
  return name
    .toLowerCase()
    .replace(/\s*-\s*(direct|regular|growth|idcw|dividend|payout|reinvestment)\s*/gi, ' ')
    .replace(/\s*(direct|regular)\s*plan\s*/gi, ' ')
    .replace(/\s*(growth|idcw|dividend)\s*option\s*/gi, ' ')
    .replace(/\(formerly known as[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect if a scheme name is a Direct plan.
 */
function isDirect(name) {
  return /\bdirect\b/i.test(name);
}

// Build a pre-computed array of [key, entry] for faster partial matching
const terEntries = Object.entries(terFunds);

/**
 * Look up the TER from the AMFI dataset by fuzzy-matching the fund name.
 * Returns the TER number or null if not found.
 */
function lookupAMFI(schemeName) {
  if (terEntries.length === 0) return null;

  const key = normalizeKey(schemeName);
  const direct = isDirect(schemeName);

  // Exact match
  const entry = terFunds[key];
  if (entry) {
    return direct ? (entry.d ?? entry.r ?? null) : (entry.r ?? entry.d ?? null);
  }

  // Partial match: try finding a key that starts with or contains our normalized name
  // (handles minor naming differences between mfapi and AMFI)
  for (const [k, e] of terEntries) {
    if (k.includes(key) || key.includes(k)) {
      return direct ? (e.d ?? e.r ?? null) : (e.r ?? e.d ?? null);
    }
  }

  return null;
}

/**
 * Get user-overridden ER from localStorage.
 * @param {string} schemeCode
 * @returns {number|null}
 */
function getUserOverride(schemeCode) {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_ER_KEY) || '{}');
    const val = stored[String(schemeCode)];
    return typeof val === 'number' ? val : null;
  } catch {
    return null;
  }
}

/**
 * Save a user-overridden ER to localStorage.
 * @param {string} schemeCode
 * @param {number} er
 */
export function setUserER(schemeCode, er) {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_ER_KEY) || '{}');
    stored[String(schemeCode)] = er;
    localStorage.setItem(USER_ER_KEY, JSON.stringify(stored));
  } catch {
    // silently fail
  }
}

/**
 * Clear a user-overridden ER.
 */
export function clearUserER(schemeCode) {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_ER_KEY) || '{}');
    delete stored[String(schemeCode)];
    localStorage.setItem(USER_ER_KEY, JSON.stringify(stored));
  } catch {
    // silently fail
  }
}

/**
 * Get the best available expense ratio for a fund.
 *
 * Priority:
 *   1. User override (if set)
 *   2. AMFI TER data (from JSON)
 *
 * @param {string} schemeName - The full scheme name
 * @param {string|number} [schemeCode] - Optional scheme code for user override lookup
 * @returns {{ value: number|null, source: 'user'|'amfi'|'none', label: string }}
 */
export function getExpenseRatio(schemeName, schemeCode) {
  // 1. User override
  if (schemeCode) {
    const userER = getUserOverride(schemeCode);
    if (userER !== null) {
      return { value: userER, source: 'user', label: 'Custom' };
    }
  }

  // 2. AMFI data
  const amfiER = lookupAMFI(schemeName);
  if (amfiER !== null) {
    return { value: amfiER, source: 'amfi', label: 'AMFI' };
  }

  // No fallback
  return { value: null, source: 'none', label: 'N/A' };
}

/**
 * Simple ER value getter.
 * Returns just the number for backward compatibility.
 */
export function getER(schemeName, schemeCode) {
  return getExpenseRatio(schemeName, schemeCode).value ?? 0;
}

/**
 * Metadata about the TER dataset (for UI display).
 */
export function getTERMeta() {
  if (!terMeta) return null;
  return {
    fetchedAt: terMeta.fetchedAt,
    count: terMeta.count,
    source: 'AMFI India (via captn3m0/india-mutual-fund-ter-tracker)',
  };
}
