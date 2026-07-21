// Centralized Expense Ratio lookup with 2-tier fallback:
//   1. User-overridden value (from localStorage)
//   2. AMFI TER data (src/data/expenseRatios.json) — most accurate

import terDataRaw from "../data/expenseRatios.json";
import schemeMappingsRaw from "../data/schemeMappings.json";

// Pre-process: the JSON has { _meta, funds } structure
const terFunds = terDataRaw?.funds || {};
const terMeta = terDataRaw?._meta || null;
const schemeMappings = schemeMappingsRaw?.schemeMappings || [];

// localStorage keys
const ACTIVE_PLATFORM_KEY = "fundlens_active_platform";
const USER_ER_KEY_PREFIX = "fundlens_user_er_";
const OLD_USER_ER_KEY = "fundlens_user_expense_ratios"; // for backward compatibility

/**
 * Get the currently active platform (e.g., Default, Zerodha, Kuvera)
 */
export function getActivePlatform() {
  try {
    return localStorage.getItem(ACTIVE_PLATFORM_KEY) || "Default";
  } catch {
    return "Default";
  }
}

/**
 * Set the globally active platform and trigger a window event
 */
export function setActivePlatform(platform) {
  try {
    localStorage.setItem(ACTIVE_PLATFORM_KEY, platform);
    window.location.reload();
  } catch {
    // silently fail
  }
}

/**
 * Get the correct localStorage key for the current platform
 */
function getCurrentERKey() {
  const platform = getActivePlatform();
  if (platform === "Default") return OLD_USER_ER_KEY;
  return `${USER_ER_KEY_PREFIX}${platform.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

/**
 * Normalize a scheme name the same way the build script does.
 * Strips plan/option suffixes so we can match against the AMFI data keys.
 */
function normalizeKey(name) {
  return name
    .toLowerCase()
    .replace(
      /\s*-\s*(direct|regular|growth|idcw|dividend|payout|reinvestment)\s*/gi,
      " ",
    )
    .replace(/\s*(direct|regular)\s*plan\s*/gi, " ")
    .replace(/\s*(growth|idcw|dividend)\s*option\s*/gi, " ")
    .replace(/\(formerly known as[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
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
  const platform = getActivePlatform();
  let direct = isDirect(schemeName);

  // Force Direct plan ER for known Direct-only platforms to improve accuracy
  if (["Zerodha", "Kuvera", "Groww", "INDmoney"].includes(platform)) {
    direct = true;
  } else if (platform === "Regular Broker (Banks)") {
    direct = false;
  }

  const formatEntry = (e) => {
    if (direct) {
      if (e.d !== undefined) return { totalTer: e.d, ber: e.dBer ?? null };
      if (e.r !== undefined) return { totalTer: e.r, ber: e.rBer ?? null };
    } else {
      if (e.r !== undefined) return { totalTer: e.r, ber: e.rBer ?? null };
      if (e.d !== undefined) return { totalTer: e.d, ber: e.dBer ?? null };
    }
    return null;
  };

  // Exact match
  const entry = terFunds[key];
  if (entry) {
    const res = formatEntry(entry);
    if (res) return res;
  }

  // Partial match: try finding a key that starts with or contains our normalized name
  // (handles minor naming differences between mfapi and AMFI)
  for (const [k, e] of terEntries) {
    if (k.includes(key) || key.includes(k)) {
      const res = formatEntry(e);
      if (res) return res;
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
    const key = getCurrentERKey();
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    const val = stored[String(schemeCode)];
    return typeof val === "number" ? val : null;
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
    const key = getCurrentERKey();
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    stored[String(schemeCode)] = er;
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // silently fail
  }
}

/**
 * Clear a user-overridden ER.
 */
export function clearUserER(schemeCode) {
  try {
    const key = getCurrentERKey();
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    delete stored[String(schemeCode)];
    localStorage.setItem(key, JSON.stringify(stored));
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
 * @returns {{ value: number|null, ber: number|null, levies: number|null, source: 'user'|'amfi'|'none', label: string }}
 */
export function getExpenseRatio(schemeName, schemeCode) {
  // 1. User override
  if (schemeCode) {
    const userER = getUserOverride(schemeCode);
    if (userER !== null) {
      return { value: userER, ber: null, levies: null, source: "user", label: "Custom" };
    }
  }

  // 2. AMFI data
  const amfiData = lookupAMFI(schemeName);
  if (amfiData !== null) {
    const totalTer = amfiData.totalTer;
    const ber = amfiData.ber;
    const levies = ber !== null && totalTer > ber ? parseFloat((totalTer - ber).toFixed(2)) : null;
    return { value: totalTer, ber, levies, source: "amfi", label: "AMFI" };
  }

  // No fallback
  return { value: null, ber: null, levies: null, source: "none", label: "N/A" };
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
    source: "AMFI India (via captn3m0/india-mutual-fund-ter-tracker)",
  };
}

/**
 * Get direct vs regular plan breakdown without guessing.
 */
export function getExpenseRatioBreakdown(schemeCode, expenseRatios = terFunds, mappings = schemeMappings) {
  const codeStr = String(schemeCode);
  const mapping = mappings.find(m => String(m.directCode) === codeStr || String(m.regularCode) === codeStr);
  
  if (!mapping) {
    return { 
      directTER: null, 
      regularTER: null, 
      spread: null, 
      error: 'Direct/Regular mapping not available',
      isGuessed: false
    };
  }
  
  const normDirectName = normalizeKey(mapping.directName);
  const normRegularName = normalizeKey(mapping.regularName);
  
  const directEntry = expenseRatios[normDirectName] || expenseRatios[normalizeKey(mapping.directName.replace(/direct/i, ""))];
  const regularEntry = expenseRatios[normRegularName] || expenseRatios[normalizeKey(mapping.regularName.replace(/regular/i, ""))];
  
  const directTER = directEntry?.d ?? null;
  const regularTER = regularEntry?.r ?? null;
  const spread = (directTER !== null && regularTER !== null) ? parseFloat((regularTER - directTER).toFixed(2)) : null;
  
  return {
    directTER,
    regularTER,
    spread,
    isGuessed: false
  };
}
