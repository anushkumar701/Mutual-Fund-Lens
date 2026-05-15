// utils/metrics.js

function parseDate(dateStr) {
  const [dd, mm, yyyy] = dateStr.split('-');
  return new Date(`${yyyy}-${mm}-${dd}`);
}

export function calculateFundMetrics(navData) {
  if (!navData || navData.length === 0) return null;

  const latestNav = parseFloat(navData[0].nav);
  const latestDate = parseDate(navData[0].date);

  const getNavAgo = (years) => {
    const targetDate = new Date(latestDate);
    targetDate.setFullYear(targetDate.getFullYear() - years);
    let closestNav = null;
    let minDiff = Infinity;
    for (const d of navData) {
      const date = parseDate(d.date);
      const diff = Math.abs(date - targetDate);
      if (diff < minDiff) { minDiff = diff; closestNav = parseFloat(d.nav); }
    }
    if (minDiff > 30 * 24 * 60 * 60 * 1000) return null;
    return closestNav;
  };

  const calcCAGR = (pastNav, years) => {
    if (!pastNav) return null;
    if (years === 1) return ((latestNav / pastNav) - 1) * 100;
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
  const return1Y  = calcCAGR(getNavAgo(1), 1);
  const return3Y  = calcCAGR(getNavAgo(3), 3);
  const return5Y  = calcCAGR(getNavAgo(5), 5);
  const return10Y = calcCAGR(getNavAgo(10), 10);

  return {
    return1Y,
    return3Y,
    return5Y,
    return10Y,
    maxDrawdown: maxDrawdown * 100,
    volatility,
    sharpe: calculateSharpeRatio(return1Y, volatility),
    sortino: calculateSortinoRatio(navData, return1Y),
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

// Volatility: Annualized Std Dev of daily returns
export function calculateVolatility(navData) {
  const returns = getDailyReturns(navData);
  if (returns.length < 30) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/**
 * Sharpe Ratio = (Annual Return - Risk Free Rate) / Annualized Volatility
 * Risk-free rate assumed at 6.5% (approx RBI repo rate)
 */
export function calculateSharpeRatio(annualReturn, volatility, riskFreeRate = 6.5) {
  if (annualReturn === null || !volatility || volatility === 0) return null;
  return parseFloat(((annualReturn - riskFreeRate) / volatility).toFixed(2));
}

/**
 * Sortino Ratio = (Annual Return - Risk Free Rate) / Downside Deviation
 * Only penalizes negative returns (downside risk)
 */
export function calculateSortinoRatio(navData, annualReturn, riskFreeRate = 6.5) {
  if (!navData || annualReturn === null) return null;
  const returns = getDailyReturns(navData);
  if (returns.length < 30) return null;
  const downsideReturns = returns.filter(r => r < 0);
  if (downsideReturns.length === 0) return null;
  const downsideVariance = downsideReturns.reduce((a, b) => a + b * b, 0) / downsideReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252) * 100;
  if (downsideDeviation === 0) return null;
  return parseFloat(((annualReturn - riskFreeRate) / downsideDeviation).toFixed(2));
}

// Pearson Correlation Coefficient (for overlap)
export function calculateCorrelation(navData1, navData2) {
  if (!navData1 || !navData2) return null;
  const map2 = {};
  navData2.forEach(d => map2[d.date] = parseFloat(d.nav));
  const aligned1 = [], aligned2 = [];
  for (let i = 0; i < navData1.length - 1; i++) {
    const today1 = navData1[i], yest1 = navData1[i + 1];
    if (map2[today1.date] && map2[yest1.date]) {
      aligned1.push((parseFloat(today1.nav) - parseFloat(yest1.nav)) / parseFloat(yest1.nav));
      aligned2.push((map2[today1.date] - map2[yest1.date]) / map2[yest1.date]);
    }
  }
  if (aligned1.length < 30) return null;
  const mean1 = aligned1.reduce((a, b) => a + b, 0) / aligned1.length;
  const mean2 = aligned2.reduce((a, b) => a + b, 0) / aligned2.length;
  let num = 0, den1 = 0, den2 = 0;
  for (let i = 0; i < aligned1.length; i++) {
    const d1 = aligned1[i] - mean1, d2 = aligned2[i] - mean2;
    num += d1 * d2; den1 += d1 * d1; den2 += d2 * d2;
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

// Smart Tags — now includes Sharpe and Sortino signals
export function getSmartTags(metrics) {
  if (!metrics) return [];
  const tags = [];
  if (metrics.maxDrawdown < 15 && metrics.volatility < 15) tags.push('🛡️ Low Volatility');
  if (metrics.return3Y > 18) tags.push('🚀 High Growth');
  if (metrics.maxDrawdown < 20 && metrics.return5Y > 12) tags.push('⭐ Long-Term Pick');
  if (metrics.volatility && metrics.volatility < 12) tags.push('🔰 Beginner Friendly');
  if (metrics.sharpe !== null && metrics.sharpe > 1.5) tags.push('📐 High Sharpe');
  if (metrics.sortino !== null && metrics.sortino > 1.5) tags.push('🎯 Low Downside Risk');
  return tags;
}

// Historical SIP with XIRR approximation using binary search
export function calculateHistoricalSIP(navData, monthlyAmount, years) {
  if (!navData || navData.length === 0) return null;
  const latestNav = parseFloat(navData[0].nav);
  const latestDate = parseDate(navData[0].date);
  const targetStartDate = new Date(latestDate);
  targetStartDate.setFullYear(targetStartDate.getFullYear() - years);
  const oldestDate = parseDate(navData[navData.length - 1].date);
  if (oldestDate > targetStartDate) return null;

  let totalInvested = 0, totalUnits = 0;
  const n = years * 12;

  for (let m = 0; m < n; m++) {
    const sipDate = new Date(latestDate);
    sipDate.setMonth(sipDate.getMonth() - m);
    let closestNav = null, minDiff = Infinity;
    for (const d of navData) {
      const date = parseDate(d.date);
      const diff = Math.abs(date - sipDate);
      if (diff < minDiff) { minDiff = diff; closestNav = parseFloat(d.nav); }
    }
    if (closestNav) { totalInvested += monthlyAmount; totalUnits += monthlyAmount / closestNav; }
  }

  const currentValue = totalUnits * latestNav;
  const profit = currentValue - totalInvested;
  const absoluteReturn = (profit / totalInvested) * 100;

  // XIRR approximation via binary search on monthly IRR
  let xirr = null;
  try {
    let low = -0.5, high = 2.0;
    for (let iter = 0; iter < 200; iter++) {
      const r = (low + high) / 2;
      if (Math.abs(r) < 1e-10) break;
      const fv = monthlyAmount * (1 + r) * (Math.pow(1 + r, n) - 1) / r;
      if (Math.abs(fv - currentValue) < 1) { low = r; break; }
      if (fv > currentValue) high = r;
      else low = r;
    }
    const monthlyRate = (low + high) / 2;
    xirr = parseFloat(((Math.pow(1 + monthlyRate, 12) - 1) * 100).toFixed(2));
    if (!isFinite(xirr) || xirr < -50 || xirr > 200) xirr = null;
  } catch { xirr = null; }

  return { invested: totalInvested, currentValue, profit, absoluteReturn, xirr };
}

// Best and Worst Month Tracking
export function calculateBestWorstMonth(navData) {
  if (!navData || navData.length < 30) return null;
  const monthMap = {};
  
  // Group navs by month (navData is sorted newest first)
  navData.forEach(d => {
    const [dd, mm, yyyy] = d.date.split('-');
    const key = `${yyyy}-${mm}`;
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
    best: monthReturns[monthReturns.length - 1]
  };
}
