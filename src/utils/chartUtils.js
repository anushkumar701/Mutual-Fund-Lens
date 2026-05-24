// utils/chartUtils.js
// Chart-building helpers extracted from Compare.jsx for reusability and testability

/**
 * Calculate fund age in years from NAV data
 */
export function getFundAgeYears(navData) {
  if (!navData || navData.length === 0) return 0;
  const [dd, mm, yyyy] = navData[navData.length - 1].date.split('-');
  const parsed = new Date(`${yyyy}-${mm}-${dd}`).getTime();
  if (isNaN(parsed)) return 0;
  return (Date.now() - parsed) / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Filter NAV data to only include entries within the selected range
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
  return data.filter((d) => {
    const [dd, mm, yyyy] = d.date.split('-');
    return new Date(`${yyyy}-${mm}-${dd}`) >= cutoff;
  }).reverse();
}

/**
 * Build chart-ready data from fund array
 * Returns array of { date, fundName1: pctChange, fundName2: pctChange, ... }
 */
export function buildChartData(funds, range) {
  if (!funds.length) return [];
  const dateMap = {};
  funds.forEach((f) => {
    if (!f.navData) return;
    const filtered = filterByRange(f.navData, range);
    if (!filtered.length) return;
    const baseNav = parseFloat(filtered[0].nav);
    filtered.forEach((d) => {
      if (!dateMap[d.date]) dateMap[d.date] = { date: d.date };
      const currentNav = parseFloat(d.nav);
      dateMap[d.date][f.meta?.scheme_name || f.schemeCode] = ((currentNav - baseNav) / baseNav) * 100;
      dateMap[d.date][`${f.meta?.scheme_name || f.schemeCode}_raw`] = currentNav;
    });
  });
  const getSortKey = (s) => {
    const [dd, mm, yyyy] = s.split('-');
    return `${yyyy}${mm}${dd}`;
  };
  return Object.values(dateMap).sort((a, b) => getSortKey(a.date).localeCompare(getSortKey(b.date)));
}

/**
 * Collapse daily chart data to monthly (last trading day of each month)
 */
export function toMonthlyData(chartData) {
  const monthMap = {};
  chartData.forEach(row => {
    const [, mm, yyyy] = row.date.split('-');
    const key = `${yyyy}-${mm}`;
    monthMap[key] = row; // last entry per month wins (data is sorted ascending)
  });
  const getSortKey = (s) => {
    const [dd, mm, yyyy] = s.split('-');
    return `${yyyy}${mm}${dd}`;
  };
  return Object.values(monthMap).sort((a, b) => getSortKey(a.date).localeCompare(getSortKey(b.date)));
}

/**
 * Compute 52-week high and low from NAV data
 */
export function get52WeekHL(navData) {
  if (!navData || navData.length === 0) return null;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const last52W = navData.filter(d => {
    const [dd, mm, yyyy] = d.date.split('-');
    return new Date(`${yyyy}-${mm}-${dd}`) >= cutoff;
  }).map(d => parseFloat(d.nav));
  if (last52W.length === 0) return null;
  return {
    high: last52W.reduce((a, b) => Math.max(a, b), -Infinity),
    low:  last52W.reduce((a, b) => Math.min(a, b), Infinity),
  };
}

/**
 * Monthly win rate: % of months fund gained NAV
 */
export function getMonthlyWinRate(navData) {
  if (!navData || navData.length < 24) return null;
  const monthMap = {};
  navData.forEach(d => {
    const [, mm, yyyy] = d.date.split('-');
    const key = `${yyyy}-${mm}`;
    if (!monthMap[key]) monthMap[key] = parseFloat(d.nav);
  });
  const months = Object.keys(monthMap).sort().map(k => monthMap[k]);
  let wins = 0;
  for (let i = 1; i < months.length; i++) {
    if (months[i] > months[i - 1]) wins++;
  }
  return months.length > 1 ? Math.round((wins / (months.length - 1)) * 100) : null;
}

/**
 * Estimate minimum investment based on scheme name
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
