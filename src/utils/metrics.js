// utils/metrics.js
import xirr from "xirr";

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return new Date(NaN);
  
  // Try DD-MM-YYYY
  const ddMmYyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMmYyyy) {
    return new Date(`${ddMmYyyy[3]}-${ddMmYyyy[2]}-${ddMmYyyy[1]}`);
  }
  
  // Try YYYY-MM-DD
  const yyyyMmDd = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyyMmDd) {
    return new Date(dateStr);
  }

  // Try DD/MM/YYYY or D/M/YYYY
  const ddMmYyyySlash = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyySlash) {
    return new Date(`${ddMmYyyySlash[3]}-${ddMmYyyySlash[2]}-${ddMmYyyySlash[1]}`);
  }
  
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date(NaN) : parsed;
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
  
  // ── Rolling Return Helper ───────────────────────────────────────────────────
  // Computes all rolling CAGR windows for the given period (in years).
  // Returns { avg, min, max, median, count } or null if insufficient data.
  const computeRolling = (years) => {
    const returns = [];
    for (let i = 0; i < sorted.length; i++) {
      const startNav = sorted[i].nav;
      const startTs = sorted[i].ts;
      const targetDate = new Date(startTs);
      targetDate.setFullYear(targetDate.getFullYear() + years);
      const targetTs = targetDate.getTime();

      if (targetTs > sorted[sorted.length - 1].ts + 15 * 24 * 60 * 60 * 1000) break;

      const endIdx = binarySearchClosest(sorted, targetTs);
      if (endIdx > i && Math.abs(sorted[endIdx].ts - targetTs) <= 15 * 24 * 60 * 60 * 1000) {
        const endNav = sorted[endIdx].nav;
        const cagr = (Math.pow(endNav / startNav, 1 / years) - 1) * 100;
        returns.push(cagr);
      }
    }
    if (returns.length === 0) return { value: null, data: null };
    returns.sort((a, b) => a - b);
    const count = returns.length;
    const avg = returns.reduce((a, b) => a + b, 0) / count;
    const min = returns[0];
    const max = returns[count - 1];
    const median = count % 2 === 0
      ? (returns[count / 2 - 1] + returns[count / 2]) / 2
      : returns[Math.floor(count / 2)];
    return { value: avg, data: { avg, min, max, median, count } };
  };

  const { value: rolling1Y, data: rolling1YData } = computeRolling(1);
  const { value: rolling3Y, data: rolling3YData } = computeRolling(3);
  const { value: rolling5Y, data: rolling5YData } = computeRolling(5);

  // Use longest available return period for Sortino so numerator & denominator cover same timespan
  const sortinoReturn = return5Y ?? return3Y ?? return1Y;

  // 1Y volatility for Sharpe ratio — ensures numerator & denominator cover the same period
  const vol1Y = (() => {
    // navData is newest-first; take ~252 trading days (1 year)
    const oneYearSlice = navData.slice(0, Math.min(navData.length, 253));
    return calculateVolatility(oneYearSlice);
  })();

  const sortinoNavSlice = (() => {
    if (!navData) return null;
    let years = 5;
    if (return5Y !== null) years = 5;
    else if (return3Y !== null) years = 3;
    else years = 1;
    // newest-first slice: take trading days for the corresponding period (plus 1 to have returns)
    return navData.slice(0, Math.min(navData.length, years * 252 + 1));
  })();

  return {
    return1Y,
    return3Y,
    return5Y,
    return10Y,
    rolling1Y,
    rolling1YData,
    rolling3Y,
    rolling3YData,
    rolling5Y,
    rolling5YData,
    maxDrawdown: maxDrawdown * 100,
    volatility,
    sharpe: calculateSharpeRatio(return1Y, vol1Y),
    sortino:
      sortinoReturn !== null && sortinoNavSlice !== null
        ? calculateSortinoRatio(sortinoNavSlice, sortinoReturn, 6.5, "zero")
        : null,
    sortinoRF:
      sortinoReturn !== null && sortinoNavSlice !== null
        ? calculateSortinoRatio(sortinoNavSlice, sortinoReturn, 6.5, "rf")
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
  return Math.sqrt(variance) * Math.sqrt(returns.length) * 100;
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
 * Supports marType: "zero" (MAR = 0%) or "rf" (MAR = Risk-Free Rate).
 * Calculates downside deviation only over returns that are below daily MAR.
 */
export function calculateSortinoRatio(
  navData,
  annualReturn,
  riskFreeRate = 6.5,
  marType = "zero",
) {
  if (!navData || annualReturn === null) return null;
  const returns = getDailyReturns(navData);
  if (returns.length < 30) return null;

  // Daily Minimum Acceptable Return (MAR)
  const marDaily = marType === "rf" ? (riskFreeRate / 100) / returns.length : 0;
  const downsideReturns = returns.filter((r) => r < marDaily);
  if (downsideReturns.length === 0) return null;

  const downsideVariance =
    downsideReturns.reduce((acc, r) => acc + Math.pow(r - marDaily, 2), 0) /
    downsideReturns.length;
  if (downsideVariance === 0) return null;

  // Annualize using actual number of trading days
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(returns.length) * 100;
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
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  for (let m = 0; m < n; m++) {
    const sipDate = new Date(latestDate);
    sipDate.setMonth(sipDate.getMonth() - m);
    const targetTs = sipDate.getTime();
    const idx = binarySearchClosest(sorted, targetTs);
    const closestNav = sorted[idx]?.nav;
    if (closestNav) {
      const diff = Math.abs(sorted[idx].ts - targetTs);
      if (diff <= threeDaysMs) {
        totalInvested += monthlyAmount;
        totalUnits += monthlyAmount / closestNav;
      }
    }
  }

  const currentValue = totalUnits * latestNav;
  const profit = currentValue - totalInvested;
  const absoluteReturn = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

  // True XIRR with actual dated cashflows
  let xirrResult = null;
  try {
    const cashflows = [];
    for (let m = 0; m < n; m++) {
      const sipDate = new Date(latestDate);
      sipDate.setMonth(sipDate.getMonth() - m);
      const targetTs = sipDate.getTime();
      const idx = binarySearchClosest(sorted, targetTs);
      if (sorted[idx]?.nav) {
        const diff = Math.abs(sorted[idx].ts - targetTs);
        if (diff <= threeDaysMs) {
          cashflows.push({ amount: -monthlyAmount, when: new Date(sorted[idx].ts) });
        }
      }
    }
    if (cashflows.length > 0) {
      cashflows.push({ amount: currentValue, when: latestDate });
      xirrResult = calculateTrueXIRR(cashflows);
    }
  } catch {
    xirrResult = null;
  }

  return {
    invested: totalInvested,
    currentValue,
    profit,
    absoluteReturn,
    xirr: xirrResult,
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
