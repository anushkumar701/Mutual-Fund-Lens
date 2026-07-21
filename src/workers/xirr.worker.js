// src/workers/xirr.worker.js

function xirrNewtonRaphson(cashflows) {
  if (!cashflows || cashflows.length < 2) return null;

  // Parse inputs and map dates
  const flows = cashflows.map(c => ({
    amount: c.amount,
    days: new Date(c.when).getTime() / (1000 * 60 * 60 * 24)
  }));

  // Must have at least one negative and one positive cashflow
  const hasNegative = flows.some(c => c.amount < 0);
  const hasPositive = flows.some(c => c.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  const d0 = flows[0].days;

  const calc = (r) => {
    let f = 0;
    let df = 0;
    for (const flow of flows) {
      const exp = (flow.days - d0) / 365;
      const term = Math.pow(1 + r, exp);
      f += flow.amount / term;
      df -= (flow.amount * exp) / (term * (1 + r));
    }
    return [f, df];
  };

  // Initial guess: 10%
  let r = 0.1;
  const maxIterations = 100;
  const tolerance = 1e-8;

  for (let i = 0; i < maxIterations; i++) {
    const [f, df] = calc(r);
    if (Math.abs(df) < 1e-12) break;
    const nextR = r - f / df;
    if (Math.abs(nextR - r) < tolerance) {
      return nextR;
    }
    r = nextR;
  }
  return null;
}

self.onmessage = function (e) {
  const { type, portfolioCashflows, fundCashflows } = e.data;
  if (type === "CALC_ALL") {
    try {
      const portfolioRate = xirrNewtonRaphson(portfolioCashflows);
      let portfolioXirr = portfolioRate !== null ? portfolioRate * 100 : null;
      if (portfolioXirr !== null && (!isFinite(portfolioXirr) || portfolioXirr < -100 || portfolioXirr > 1000)) {
        portfolioXirr = null;
      }

      const fundXirrs = {};
      if (fundCashflows) {
        for (const [schemeCode, cashflows] of Object.entries(fundCashflows)) {
          const rate = xirrNewtonRaphson(cashflows);
          let val = rate !== null ? rate * 100 : null;
          if (val !== null && (!isFinite(val) || val < -100 || val > 1000)) {
            val = null;
          }
          fundXirrs[schemeCode] = val;
        }
      }

      self.postMessage({ type: "RESULTS", portfolioXirr, fundXirrs });
    } catch (err) {
      self.postMessage({ type: "ERROR", error: err.message });
    }
  }
};
