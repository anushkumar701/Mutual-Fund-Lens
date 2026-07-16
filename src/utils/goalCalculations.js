export function monthlyRateFromAnnual(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

export function projectedCorpus(n, r, C, monthlySIP) {
  if (r === 0) {
    return C + monthlySIP * n;
  }
  return C * Math.pow(1 + r, n) + monthlySIP * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

export function requiredSIP(n, r, C, targetAmount) {
  if (n <= 0) return 0;
  if (r === 0) {
    return (targetAmount - C) / n;
  }
  return ((targetAmount - C * Math.pow(1 + r, n)) * r) / ((Math.pow(1 + r, n) - 1) * (1 + r));
}

export function solveForMonths(r, C, monthlySIP, targetAmount) {
  if (targetAmount <= C) return 0;
  if (r === 0 && monthlySIP <= 0) return null; // unreachable

  let low = 0;
  let high = 600;
  let best = null;

  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    let proj = projectedCorpus(mid, r, C, monthlySIP);
    if (proj >= targetAmount) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return best;
}

export function whatIfScenario(n, annualRate, C, monthlySIP, targetAmount, delta, mode) {
  const r = monthlyRateFromAnnual(annualRate);
  let effectiveSIP = monthlySIP;
  let effectiveC = C;

  if (mode === "permanent") {
    effectiveSIP = Math.max(0, monthlySIP + delta);
  } else if (mode === "one-time") {
    effectiveC = C + Math.max(-monthlySIP, delta);
  }

  const newProjected = projectedCorpus(n, r, effectiveC, effectiveSIP);
  const newMonths = solveForMonths(r, effectiveC, effectiveSIP, targetAmount);

  return {
    projected: newProjected,
    monthsToTarget: newMonths,
    effectiveSIP,
    effectiveC
  };
}
