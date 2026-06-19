// utils/formatCurrency.js

/**
 * Format a number in Indian currency notation (₹X,XX,XXX)
 */
export function formatINR(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return "₹0";
  const num = Math.round(Number(value));
  const formatted = num.toLocaleString("en-IN", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  return `₹${formatted}`;
}

/**
 * Format NAV (show 4 decimal places)
 */
export function formatNAV(value) {
  if (!value) return "—";
  return `₹${parseFloat(value).toFixed(4)}`;
}

/**
 * Compact format for large numbers (e.g. 1.2 Cr, 45 L)
 */
export function formatCompact(value) {
  const num = Number(value);
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)} Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)} L`;
  return formatINR(num);
}

// Module-level cached formatter — avoids re-creating Intl.NumberFormat on every call
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a value as Indian Rupees with 2 decimal places (₹1,24,532.80).
 * Uses a module-level cached Intl.NumberFormat instance for performance.
 */
export function formatCurrencyINR(val) {
  return currencyFormatter.format(val);
}
