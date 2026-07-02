// utils/metrics.js
import xirr from "xirr";

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return new Date(NaN);
  const parts = dateStr.split("-");
  if (parts.length !== 3) return new Date(NaN);
  const [dd, mm, yyyy] = parts;
  const date = new Date(`${yyyy}-${mm}-${dd}`);
  return isNaN(date.getTime()) ? new Date(NaN) : date;
}

// Build a sorted ascending array of { ts, nav } for binary search
function buildSortedNav(navData) {
  return [...navData]
    .reverse()
    .map((d) => ({ ts: parseDate(d.date).getTime(), nav: parseFloat(d.nav) }))
    .filter((d) => !isNaN(d.ts) && isFinite(d.nav));
}

// Binary search: find index of closest timestamp in sorted ascending array
function binarySearchClosest(sorted, targetTs) {
  let lo = 0,
    hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].ts < targetTs) lo = mid + 1;
    else hi = mid;
  }
  if (
    lo > 0 &&
    Math.abs(sorted[lo - 1].ts - targetTs) < Math.abs(sorted[lo].ts - targetTs)
  ) {
    return lo - 1;
  }
  return lo;
}

export function calculateFundMetrics(navData) {
  if (!navData || navData.length === 0) return null;

  const latestNav = parseFloat(navData[0].nav);
  const latestDate = parseDate(navData[0].date);

  // Pre-sort once — O(n log n) — then binary search for each period — O(log n)
  const sorted = buildSortedNav(navData);

  const getNavAgo = (years) => {
    const targetDate = new Date(latestDate);
    targetDate.setFullYear(targetDate.getFullYear() - years);
    const targetTs = targetDate.getTime();
    const idx = binarySearchClosest(sorted, targetTs);
    // Tighter tolerance for short periods: 7d for 1Y, 10d for 3Y, 15d for 5Y, 30d for 10Y+
    const toleranceDays =
      years <= 1 ? 7 : years <= 3 ? 10 : years <= 5 ? 15 : 30;
    const diff = Math.abs(sorted[idx].ts - targetTs);
    if (diff > toleranceDays * 24 * 60 * 60 * 1000) return null;
    return sorted[idx].nav;
  };

  const calcCAGR = (pastNav, years) => {
    if (!pastNav) return null;
    if (years === 1) return (latestNav / pastNav - 1) * 100;
    return (Math.pow(latestNav / pastNav, 1 / years) - 1) * 100;
  };

  // Max Drawdown
  let maxDrawdown = 0;
  let peak = parseFloat(navData[navData.length - 1].nav);
  for (let i = navData.length - 1; i >= 0; i--) {
    const nav = parseFloat(navData[i].nav);
    if (nav > peak) peak = nav;
    const drawdown = (peak - nav) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const volatility = calculateVolatility(navData);
  const return1Y = calcCAGR(getNavAgo(1), 1);
  const return3Y = calcCAGR(getNavAgo(3), 3);
  const return5Y = calcCAGR(getNavAgo(5), 5);
  const return10Y = calcCAGR(getNavAgo(10), 10);
  
  let rolling3YReturns = [];
  for (let i = 0; i < sorted.length; i++) {
    const startNav = sorted[i].nav;
    const startTs = sorted[i].ts;
    const targetDate = new Date(startTs);
    targetDate.setFullYear(targetDate.getFullYear() + 3);
    const targetTs = targetDate.getTime();
    
    // Quick bounds check - if targetTs is beyond our latest data, we can break
    if (targetTs > sorted[sorted.length - 1].ts + 15 * 24 * 60 * 60 * 1000) break;
    
    const endIdx = binarySearchClosest(sorted, targetTs);
    if (endIdx > i && Math.abs(sorted[endIdx].ts - targetTs) <= 15 * 24 * 60 * 60 * 1000) {
      const endNav = sorted[endIdx].nav;
      const cagr = (Math.pow(endNav / startNav, 1 / 3) - 1) * 100;
      rolling3YReturns.push(cagr);
    }
  }

  let rolling3Y = null;
  let rolling3YData = null;
  if (rolling3YReturns.length > 0) {
    rolling3YReturns.sort((a, b) => a - b);
    const count = rolling3YReturns.length;
    const avg = rolling3YReturns.reduce((a, b) => a + b, 0) / count;
    const min = rolling3YReturns[0];
    const max = rolling3YReturns[count - 1];
    const median = count % 2 === 0
      ? (rolling3YReturns[count / 2 - 1] + rolling3YReturns[count / 2]) / 2
      : rolling3YReturns[Math.floor(count / 2)];
    rolling3Y = avg;
    rolling3YData = { avg, min, max, median, count };
  }

  // Use longest available return period for Sortino so numerator & denominator cover same timespan
  const sortinoReturn = return5Y ?? return3Y ?? return1Y;

  return {
    return1Y,
    return3Y,
    return5Y,
    return10Y,
    rolling3Y,
    rolling3YData,
    maxDrawdown: maxDrawdown * 100,
    volatility,
    sharpe: calculateSharpeRatio(return1Y, volatility),
    sortino:
      sortinoReturn !== null
        ? calculateSortinoRatio(navData, sortinoReturn)
        : null,
  };
}

// Helper: Calculate daily returns
function getDailyReturns(navData) {
  const returns = [];
  for (let i = 0; i < navData.length - 1; i++) {
    const today = parseFloat(navData[i].nav);
    const yesterday = parseFloat(navData[i + 1].nav);
    if (yesterday > 0) returns.push((today - yesterday) / yesterday);
  }
  return returns;
}

// Volatility: Annualized Std Dev of daily returns (sample variance with Bessel's correction)
export function calculateVolatility(navData) {
  const returns = getDailyReturns(navData);
  if (returns.length < 30) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  // Use (n-1) for sample variance — statistically correct
  const variance =
    returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/**
 * Sharpe Ratio = (Annual Return - Risk Free Rate) / Annualized Volatility
 * Risk-free rate assumed at 6.5% (approx RBI repo rate)
 */
export function calculateSharpeRatio(
  annualReturn,
  volatility,
  riskFreeRate = 6.5,
) {
  if (annualReturn === null || !volatility || volatility === 0) return null;
  return parseFloat(((annualReturn - riskFreeRate) / volatility).toFixed(2));
}

/**
 * Sortino Ratio = (Annual Return - Risk Free Rate) / Downside Deviation
 * Downside deviation uses ALL returns in denominator (not just negative ones),
 * and measures deviations below zero (MAR = 0), as per standard finance practice.
 */
export function calculateSortinoRatio(
  navData,
  annualReturn,
  riskFreeRate = 6.5,
) {
  if (!navData || annualReturn === null) return null;
  const returns = getDailyReturns(navData);
  if (returns.length < 30) return null;
  // Minimum Acceptable Return (MAR) per day — using 0 (no loss tolerance)
  const MAR = 0;
  // Sum of squared deviations below MAR, divided by TOTAL observations (not just downside days)
  const downsideVariance =
    returns.reduce((acc, r) => {
      const below = Math.min(r - MAR, 0);
      return acc + below * below;
    }, 0) / returns.length;
  if (downsideVariance === 0) return null;
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252) * 100;
  if (downsideDeviation === 0) return null;
  return parseFloat(
    ((annualReturn - riskFreeRate) / downsideDeviation).toFixed(2),
  );
}

// Pearson Correlation Coefficient (for overlap)
export function calculateCorrelation(navData1, navData2) {
  if (!navData1 || !navData2) return null;
  const map2 = {};
  navData2.forEach((d) => (map2[d.date] = parseFloat(d.nav)));
  const aligned1 = [],
    aligned2 = [];
  for (let i = 0; i < navData1.length - 1; i++) {
    const today1 = navData1[i],
      yest1 = navData1[i + 1];
    if (map2[today1.date] && map2[yest1.date]) {
      aligned1.push(
        (parseFloat(today1.nav) - parseFloat(yest1.nav)) /
          parseFloat(yest1.nav),
      );
      aligned2.push((map2[today1.date] - map2[yest1.date]) / map2[yest1.date]);
    }
  }
  if (aligned1.length < 30) return null;
  const mean1 = aligned1.reduce((a, b) => a + b, 0) / aligned1.length;
  const mean2 = aligned2.reduce((a, b) => a + b, 0) / aligned2.length;
  let num = 0,
    den1 = 0,
    den2 = 0;
  for (let i = 0; i < aligned1.length; i++) {
    const d1 = aligned1[i] - mean1,
      d2 = aligned2[i] - mean2;
    num += d1 * d2;
    den1 += d1 * d1;
    den2 += d2 * d2;
  }
  if (den1 === 0 || den2 === 0) return 0;
  return num / Math.sqrt(den1 * den2);
}

// FundLens Score (0-100) — now includes Sharpe
export function getFundLensScore(metrics) {
  if (!metrics || metrics.return3Y === null) return null;
  let score = 50;
  if (metrics.return3Y > 15) score += 20;
  else if (metrics.return3Y > 10) score += 10;
  else if (metrics.return3Y < 5) score -= 10;
  if (metrics.maxDrawdown > 30) score -= 20;
  else if (metrics.maxDrawdown > 20) score -= 10;
  else if (metrics.maxDrawdown < 10) score += 10;
  if (metrics.volatility) {
    if (metrics.volatility < 12) score += 10;
    else if (metrics.volatility > 25) score -= 10;
  }
  if (metrics.sharpe !== null && metrics.sharpe !== undefined) {
    if (metrics.sharpe > 1.5) score += 10;
    else if (metrics.sharpe > 0.5) score += 5;
    else if (metrics.sharpe < 0) score -= 10;
  }
  return Math.min(Math.max(Math.round(score), 10), 98);
}

// Smart Tags — now includes Sharpe, Sortino signals, and Warning Badges
export function getSmartTags(metrics) {
  if (!metrics) return [];
  const tags = [];
  
  // Positive Badges
  if (metrics.maxDrawdown < 15 && metrics.volatility < 15)
    tags.push("🛡️ Low Volatility");
  if (metrics.return3Y > 18) tags.push("🚀 High Growth");
  if (metrics.maxDrawdown < 20 && metrics.return5Y > 12)
    tags.push("⭐ Long-Term Pick");
  if (metrics.volatility && metrics.volatility < 12)
    tags.push("🔰 Beginner Friendly");
  if (metrics.sharpe !== null && metrics.sharpe > 1.5)
    tags.push("📐 High Sharpe");
  if (metrics.sortino !== null && metrics.sortino > 1.5)
    tags.push("🎯 Low Downside Risk");
    
  // Warning Badges
  if (metrics.volatility > 20)
    tags.push("⚠️ Highly Volatile");
  if (metrics.maxDrawdown > 30)
    tags.push("🚨 High Drawdown Risk");
  if (metrics.return5Y !== null && metrics.return5Y < 8)
    tags.push("⚠️ Underperformer (5Y)");
    
  return tags;
}

// Historical SIP — O(n log n) with binary search (was O(n²))
export function calculateHistoricalSIP(navData, monthlyAmount, years) {
  if (!navData || navData.length === 0) return null;
  const latestNav = parseFloat(navData[0].nav);
  const latestDate = parseDate(navData[0].date);
  const targetStartDate = new Date(latestDate);
  targetStartDate.setFullYear(targetStartDate.getFullYear() - years);
  const oldestDate = parseDate(navData[navData.length - 1].date);
  if (oldestDate > targetStartDate) return null;

  // Pre-sort ascending once — O(n log n)
  const sorted = buildSortedNav(navData);

  let totalInvested = 0,
    totalUnits = 0;
  const n = years * 12;

  for (let m = 0; m < n; m++) {
    const sipDate = new Date(latestDate);
    sipDate.setMonth(sipDate.getMonth() - m);
    const targetTs = sipDate.getTime();
    // Binary search — O(log n) per iteration instead of O(n)
    const idx = binarySearchClosest(sorted, targetTs);
    const closestNav = sorted[idx]?.nav;
    if (closestNav) {
      totalInvested += monthlyAmount;
      totalUnits += monthlyAmount / closestNav;
    }
  }

  const currentValue = totalUnits * latestNav;
  const profit = currentValue - totalInvested;
  const absoluteReturn = (profit / totalInvested) * 100;

  // XIRR approximation via bisection on monthly IRR
  // Bug-fixed: converge on the RATE interval (not on value match), break correctly
  let xirr = null;
  try {
    let lo = -0.5,
      hi = 2.0;
    let monthlyRate = (lo + hi) / 2;
    for (let iter = 0; iter < 200; iter++) {
      monthlyRate = (lo + hi) / 2;
      if (Math.abs(hi - lo) < 1e-9) break; // converged on rate
      if (Math.abs(monthlyRate) < 1e-10) {
        monthlyRate = 0;
        break;
      }
      const fv =
        (monthlyAmount *
          (1 + monthlyRate) *
          (Math.pow(1 + monthlyRate, n) - 1)) /
        monthlyRate;
      if (fv > currentValue) hi = monthlyRate;
      else lo = monthlyRate;
    }
    xirr = parseFloat(((Math.pow(1 + monthlyRate, 12) - 1) * 100).toFixed(2));
    if (!isFinite(xirr) || xirr < -50 || xirr > 200) xirr = null;
  } catch {
    xirr = null;
  }

  return {
    invested: totalInvested,
    currentValue,
    profit,
    absoluteReturn,
    // Note: xirr is an approximation using the annuity formula, not a true XIRR
    // (which would require solving NPV = 0 with actual dated cashflows).
    // Labelled as "est. XIRR" in UI to be transparent.
    xirr,
  };
}

// Best and Worst Month Tracking
export function calculateBestWorstMonth(navData) {
  if (!navData || navData.length < 30) return null;
  const monthMap = {};

  // Exclude the current partial month — it distorts best/worst since it's not a complete month
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Group navs by month (navData is sorted newest first)
  navData.forEach((d) => {
    if (!d?.date) return;
    const parts = d.date.split("-");
    if (parts.length !== 3) return;
    const [, mm, yyyy] = parts;
    if (!mm || !yyyy) return;
    const key = `${yyyy}-${mm}`;
    if (key === currentMonthKey) return; // skip incomplete current month
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(parseFloat(d.nav));
  });

  const monthReturns = [];
  for (const [month, navs] of Object.entries(monthMap)) {
    if (navs.length < 2) continue;
    const firstNav = navs[navs.length - 1]; // oldest in that month
    const lastNav = navs[0]; // newest in that month
    const returnPct = ((lastNav - firstNav) / firstNav) * 100;
    monthReturns.push({ month, returnPct });
  }

  if (monthReturns.length === 0) return null;
  monthReturns.sort((a, b) => a.returnPct - b.returnPct);

  return {
    worst: monthReturns[0],
    best: monthReturns[monthReturns.length - 1],
  };
}

/**
 * Robust XIRR wrapper around the 'xirr' npm package
 * Takes an array of cashflows: { amount, when }
 * amount is negative for investments, positive for current value/withdrawals
 */
export function calculateTrueXIRR(cashflows) {
  if (!cashflows || cashflows.length < 2) return null;
  
  // Must have at least one negative and one positive cashflow
  const hasNegative = cashflows.some(c => c.amount < 0);
  const hasPositive = cashflows.some(c => c.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  try {
    const rate = xirr(cashflows);
    // Convert to percentage and guard against ridiculous bounds
    const xirrPct = rate * 100;
    if (!isFinite(xirrPct) || xirrPct < -100 || xirrPct > 1000) return null;
    return xirrPct;
  } catch (err) {
    console.warn("XIRR calculation failed:", err.message);
    return null;
  }
}
