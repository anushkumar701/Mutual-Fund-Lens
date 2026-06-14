// utils/chartUtils.js
// Chart-building helpers extracted from Compare.jsx for reusability and testability

/**
 * Sanitize a string so it can be safely used as a Recharts dataKey.
 * Recharts parses dataKey values using dot-notation (e.g. "a.b") and bracket
 * notation internally, so dots, slashes, ampersands, parentheses, and other
 * special characters in Indian fund names silently break line rendering.
 */
export function sanitizeDataKey(name) {
  if (name == null) return 'fund';
  // Replace every non-alphanumeric / non-space / non-hyphen char with underscore
  return String(name)
    .replace(/[^a-zA-Z0-9 \-_]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    || 'fund';
}

/**
 * Calculate fund age in years from NAV data.
 */
export function getFundAgeYears(navData) {
  if (!navData || navData.length === 0) return 0;
  const parts = navData[navData.length - 1].date.split('-');
  if (parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts;
  const parsed = new Date(`${yyyy}-${mm}-${dd}`).getTime();
  if (isNaN(parsed)) return 0;
  return (Date.now() - parsed) / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Parse a DD-MM-YYYY nav date string into a Date object.
 */
function parseNavDate(s) {
  if (!s || typeof s !== 'string') return new Date(NaN);
  const parts = s.split('-');
  if (parts.length !== 3) return new Date(NaN);
  const [dd, mm, yyyy] = parts;
  return new Date(`${yyyy}-${mm}-${dd}`);
}

/**
 * Filter NAV data to only include entries within the selected range.
 * Returns data in ascending date order (oldest → newest).
 */
export function filterByRange(data, range) {
  const now = new Date();
  const cutoff = new Date();
  switch (range) {
    case '1M':  cutoff.setMonth(now.getMonth() - 1); break;
    case '3M':  cutoff.setMonth(now.getMonth() - 3); break;
    case '6M':  cutoff.setMonth(now.getMonth() - 6); break;
    case '1Y':  cutoff.setFullYear(now.getFullYear() - 1); break;
    case '3Y':  cutoff.setFullYear(now.getFullYear() - 3); break;
    case '5Y':  cutoff.setFullYear(now.getFullYear() - 5); break;
    case '10Y': cutoff.setFullYear(now.getFullYear() - 10); break;
    case '15Y': cutoff.setFullYear(now.getFullYear() - 15); break;
    case '20Y': cutoff.setFullYear(now.getFullYear() - 20); break;
    case '25Y': cutoff.setFullYear(now.getFullYear() - 25); break;
    case 'MAX': return [...data].reverse(); // all data, oldest first
    default:    cutoff.setMonth(now.getMonth() - 6);
  }
  return data
    .filter((d) => {
      const dt = parseNavDate(d.date);
      return !isNaN(dt.getTime()) && dt >= cutoff;
    })
    .reverse(); // oldest → newest
}

/**
 * Build chart-ready data from fund array.
 * Returns array of { date, [sanitizedFundName]: pctChange, ... }
 *
 * Fixed issues:
 *  1. baseNav <= 0 guard — avoids Infinity/NaN that make Recharts skip lines.
 *  2. sanitizeDataKey  — special chars (/, &, ., (, )) in fund names break
 *     Recharts internal key parsing → lines disappear silently.
 *  3. Fallback for short-lived funds — if a fund has no data in the selected
 *     range, we use all its available data (rebased from its launch) so it
 *     still appears on the chart rather than being absent.
 *  4. Per-entry NaN/Infinity filter — bad NAV rows no longer corrupt the series.
 */
export function buildChartData(funds, range) {
  if (!funds || !funds.length) return [];

  const dateMap = {};

  funds.forEach((f) => {
    if (!f.navData || f.navData.length === 0) return;

    let filtered = filterByRange(f.navData, range);

    // Fallback: fund is younger than the selected range — show its full history
    if (filtered.length === 0) {
      filtered = [...f.navData].reverse(); // oldest → newest
    }
    if (filtered.length === 0) return;

    const baseNav = parseFloat(filtered[0].nav);
    // Guard: skip fund if base NAV is zero, negative, or non-finite (division-by-zero)
    if (!Number.isFinite(baseNav) || baseNav <= 0) return;

    // Use sanitized name as Recharts dataKey (special chars silently break rendering)
    const rawKey = f.meta?.scheme_name || String(f.schemeCode);
    const key = sanitizeDataKey(rawKey);

    filtered.forEach((d) => {
      const currentNav = parseFloat(d.nav);
      if (!Number.isFinite(currentNav) || currentNav <= 0) return; // skip bad rows

      const pct = ((currentNav - baseNav) / baseNav) * 100;
      if (!Number.isFinite(pct)) return; // final safety net

      if (!dateMap[d.date]) dateMap[d.date] = { date: d.date };
      dateMap[d.date][key] = pct;
      dateMap[d.date][`${key}_raw`] = currentNav;
    });
  });

  const getSortKey = (s) => {
    const parts = s.split('-');
    if (parts.length !== 3) return s;
    const [dd, mm, yyyy] = parts;
    return `${yyyy}${mm}${dd}`;
  };

  return Object.values(dateMap).sort(
    (a, b) => getSortKey(a.date).localeCompare(getSortKey(b.date))
  );
}

/**
 * Build chart-ready data for SIP mode from fund array.
 * Simulates a monthly SIP of sipAmount and calculates the % profit of the total invested value
 * over time, allowing fair side-by-side comparison.
 */
export function buildSIPChartData(funds, range, sipAmount = 10000) {
  if (!funds || !funds.length) return [];
  const dateMap = {};

  funds.forEach((f) => {
    if (!f.navData || f.navData.length === 0) return;
    let filtered = filterByRange(f.navData, range);
    
    // Fallback: full history if too young
    if (filtered.length === 0) filtered = [...f.navData].reverse();
    if (filtered.length === 0) return;

    const rawKey = f.meta?.scheme_name || String(f.schemeCode);
    const key = sanitizeDataKey(rawKey);

    let totalUnits = 0;
    let totalInvested = 0;
    let currentMonthStr = "";

    filtered.forEach((d) => {
      const currentNav = parseFloat(d.nav);
      if (!Number.isFinite(currentNav) || currentNav <= 0) return;

      const parts = d.date.split('-');
      if (parts.length !== 3) return;
      const monthStr = `${parts[2]}-${parts[1]}`; // YYYY-MM

      // First trading day seen in a new month triggers the SIP installment
      if (monthStr !== currentMonthStr) {
        currentMonthStr = monthStr;
        totalUnits += sipAmount / currentNav;
        totalInvested += sipAmount;
      }

      const currentValue = totalUnits * currentNav;
      const profitPct = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;

      if (!dateMap[d.date]) dateMap[d.date] = { date: d.date };
      dateMap[d.date][key] = profitPct;
      dateMap[d.date][`${key}_raw`] = currentValue; // For tooltip to show actual value
      dateMap[d.date][`${key}_invested`] = totalInvested;
    });
  });

  const getSortKey = (s) => {
    const parts = s.split('-');
    if (parts.length !== 3) return s;
    const [dd, mm, yyyy] = parts;
    return `${yyyy}${mm}${dd}`;
  };

  return Object.values(dateMap).sort(
    (a, b) => getSortKey(a.date).localeCompare(getSortKey(b.date))
  );
}

/**
 * Collapse daily chart data to weekly (last trading day of each ISO week).
 * Correctly handles DD-MM-YYYY date format.
 */
export function toWeeklyData(chartData) {
  const weekMap = {};
  chartData.forEach((row) => {
    const parts = row.date.split('-');
    if (parts.length !== 3) return;
    const [dd, mm, yyyy] = parts;
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    if (isNaN(d.getTime())) return;
    // ISO week number: Thursday-based week
    const tmp = new Date(d);
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    const key = `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    // Last entry per week wins (data is sorted ascending by date)
    weekMap[key] = row;
  });

  const getSortKey = (s) => {
    const parts = s.split('-');
    if (parts.length !== 3) return s;
    const [dd, mm, yyyy] = parts;
    return `${yyyy}${mm}${dd}`;
  };

  return Object.values(weekMap).sort(
    (a, b) => getSortKey(a.date).localeCompare(getSortKey(b.date))
  );
}

/**
 * Collapse daily chart data to monthly (last trading day of each month).
 * Correctly handles DD-MM-YYYY date format.
 */
export function toMonthlyData(chartData) {
  const monthMap = {};
  chartData.forEach((row) => {
    // row.date is in DD-MM-YYYY format
    const parts = row.date.split('-');
    if (parts.length !== 3) return;
    const [, mm, yyyy] = parts;
    const key = `${yyyy}-${mm}`;
    // Last entry per month wins (data is sorted ascending by date)
    monthMap[key] = row;
  });

  const getSortKey = (s) => {
    const parts = s.split('-');
    if (parts.length !== 3) return s;
    const [dd, mm, yyyy] = parts;
    return `${yyyy}${mm}${dd}`;
  };

  return Object.values(monthMap).sort(
    (a, b) => getSortKey(a.date).localeCompare(getSortKey(b.date))
  );
}

/**
 * Compute 52-week high and low from NAV data.
 */
export function get52WeekHL(navData) {
  if (!navData || navData.length === 0) return null;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const last52W = navData
    .filter((d) => {
      const dt = parseNavDate(d.date);
      return !isNaN(dt.getTime()) && dt >= cutoff;
    })
    .map((d) => parseFloat(d.nav))
    .filter((v) => Number.isFinite(v));

  if (last52W.length === 0) return null;
  return {
    high: last52W.reduce((a, b) => Math.max(a, b), -Infinity),
    low:  last52W.reduce((a, b) => Math.min(a, b), Infinity),
  };
}

/**
 * Monthly win rate: % of months the fund gained NAV.
 */
export function getMonthlyWinRate(navData) {
  if (!navData || navData.length < 24) return null;
  const monthMap = {};
  navData.forEach((d) => {
    const parts = d.date.split('-');
    if (parts.length !== 3) return;
    const [, mm, yyyy] = parts;
    const key = `${yyyy}-${mm}`;
    if (!monthMap[key]) monthMap[key] = parseFloat(d.nav);
  });
  const months = Object.keys(monthMap)
    .sort()
    .map((k) => monthMap[k]);
  let wins = 0;
  for (let i = 1; i < months.length; i++) {
    if (months[i] > months[i - 1]) wins++;
  }
  return months.length > 1 ? Math.round((wins / (months.length - 1)) * 100) : null;
}

/**
 * Estimate minimum investment based on scheme name.
 */
export function guessMinInvestment(schemeName) {
  if (!schemeName) return { sip: 500, lump: 1000 };
  const lower = schemeName.toLowerCase();
  if (lower.includes('elss') || lower.includes('tax')) return { sip: 500, lump: 500 };
  if (lower.includes('nifty') || lower.includes('index')) return { sip: 100, lump: 500 };
  if (lower.includes('parag parikh')) return { sip: 1000, lump: 1000 };
  return { sip: 500, lump: 1000 };
}

// Default chart colors for up to 4 funds
export const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444'];
