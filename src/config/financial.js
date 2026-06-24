/**
 * config/financial.js
 *
 * Centralized configuration for all financial rules and rates.
 * Updating a single value here propagates across the entire app.
 *
 * When SEBI or government changes a rate, update ONLY this file.
 */

// ---------------------------------------------------------------------------
// Stamp Duty on Mutual Fund Purchase (effective July 1, 2020)
// Source: Indian Finance Act 2020, Schedule I
// ---------------------------------------------------------------------------
export const STAMP_DUTY_RULES = [
  {
    // No stamp duty before July 1, 2020
    from: null,
    to: "2020-06-30",
    rate: 0,
  },
  {
    // 0.005% of investment amount on purchase
    from: "2020-07-01",
    to: null, // open-ended — current rule
    rate: 0.00005,
  },
];

/**
 * Returns the applicable stamp duty rate for a given investment date string (YYYY-MM-DD).
 * Add a new entry to STAMP_DUTY_RULES if SEBI updates the rate in the future.
 */
export function getStampDutyRate(dateStr) {
  if (!dateStr) return 0;
  for (let i = STAMP_DUTY_RULES.length - 1; i >= 0; i--) {
    const rule = STAMP_DUTY_RULES[i];
    const afterFrom = !rule.from || dateStr >= rule.from;
    const beforeTo = !rule.to || dateStr <= rule.to;
    if (afterFrom && beforeTo) return rule.rate;
  }
  return 0;
}

/**
 * Calculate stamp duty amount for a given investment.
 * @param {number} amount - Gross investment amount in ₹
 * @param {string} dateStr - Investment date as YYYY-MM-DD
 * @returns {number} Stamp duty in ₹
 */
export function calcStampDuty(amount, dateStr) {
  if (!amount || isNaN(amount) || amount <= 0) return 0;
  const rate = getStampDutyRate(dateStr);
  return parseFloat(amount) * rate;
}

// ---------------------------------------------------------------------------
// Unit Allocation Precision
// Standard across most Indian AMCs and RTAs (CAMS, KFintech)
// ---------------------------------------------------------------------------
export const UNIT_PRECISION = 3; // decimal places

// ---------------------------------------------------------------------------
// CAGR calculation — minimum holding period for meaningful CAGR display
// ---------------------------------------------------------------------------
export const CAGR_MIN_YEARS = 0.5; // 6 months

// ---------------------------------------------------------------------------
// Portfolio localStorage keys — centralised to prevent key drift
// ---------------------------------------------------------------------------
export const STORAGE_KEYS = {
  HOLDINGS: "fundlens_portfolio",
  NOTIFY_CONFIG: "fundlens_portfolio_notify",
  TOTAL_VALUE: "fundlens_portfolio_total_value",
  FILTER_DIRECT: "fundlens_portfolio_filter_direct",
  FILTER_GROWTH: "fundlens_portfolio_filter_growth",
};

// ---------------------------------------------------------------------------
// Holdings schema version — bump this when the holding object shape changes
// ---------------------------------------------------------------------------
export const HOLDINGS_SCHEMA_VERSION = 1;

/**
 * Migrate a raw holding object to the current schema version.
 * Add a new case here whenever the holding shape changes.
 *
 * @param {object} raw - Raw holding from localStorage
 * @returns {object} Migrated holding
 */
export function migrateHolding(raw) {
  if (!raw || typeof raw !== "object") return null;

  const h = { ...raw };

  // --- v0 → v1: ensure required fields exist with safe defaults ---
  if (!h.id) h.id = String(Date.now() + Math.random());
  if (typeof h.schemeCode === "undefined") return null; // corrupt — discard
  if (!h.schemeName || typeof h.schemeName !== "string") return null;
  if (typeof h.amount !== "number" || isNaN(h.amount)) return null;
  if (typeof h.buyNav !== "number" || isNaN(h.buyNav)) return null;
  if (typeof h.units !== "number" || isNaN(h.units)) return null;
  if (!h.investedDate) h.investedDate = new Date().toISOString().split("T")[0];

  // Remove any stale keys that are no longer part of the schema
  delete h.investedTime; // removed — was a temporary field from time-input experiment

  return h;
}

/**
 * Validate and migrate a full holdings array loaded from localStorage.
 * Silently drops corrupt entries and returns a clean array.
 *
 * @param {any} raw - Raw value from localStorage
 * @returns {Array} Clean, migrated holdings array
 */
export function loadAndMigrateHoldings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(migrateHolding).filter(Boolean);
}
