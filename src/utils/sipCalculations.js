// utils/sipCalculations.js

/**
 * Calculate SIP maturity value with optional step-up
 */
export function calculateSIP(monthlyAmount, years, annualReturn, stepUp = 0) {
  const r = annualReturn / 100 / 12;
  const yearlyData = [];
  let totalInvested = 0;
  let baseInvested = 0;
  let futureValue = 0;
  let currentSIP = monthlyAmount;

  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      futureValue = (futureValue + currentSIP) * (1 + r);
      totalInvested += currentSIP;
      baseInvested += monthlyAmount;
    }
    yearlyData.push({
      year: y,
      invested: Math.round(totalInvested),
      baseInvested: Math.round(baseInvested),
      stepUpInvested: Math.round(totalInvested - baseInvested),
      value: Math.round(futureValue),
      returns: Math.round(futureValue - totalInvested),
    });
    currentSIP = currentSIP * (1 + stepUp / 100);
  }

  return {
    invested: Math.round(totalInvested),
    baseInvested: Math.round(baseInvested),
    stepUpInvested: Math.round(totalInvested - baseInvested),
    maturity: Math.round(futureValue),
    returns: Math.round(futureValue - totalInvested),
    yearlyData,
  };
}

/**
 * Calculate Lumpsum maturity value
 */
export function calculateLumpsum(principal, years, annualReturn) {
  const rate = annualReturn / 100;
  const maturity = principal * Math.pow(1 + rate, years);
  const yearlyData = [];

  for (let y = 1; y <= years; y++) {
    const value = principal * Math.pow(1 + rate, y);
    yearlyData.push({
      year: y,
      invested: principal,
      baseInvested: principal,
      stepUpInvested: 0,
      value: Math.round(value),
      returns: Math.round(value - principal),
    });
  }

  return {
    invested: Math.round(principal),
    baseInvested: Math.round(principal),
    stepUpInvested: 0,
    maturity: Math.round(maturity),
    returns: Math.round(maturity - principal),
    yearlyData,
  };
}

/**
 * Adjust for inflation (real value)
 */
export function adjustForInflation(nominalValue, inflationRate, years) {
  return Math.round(nominalValue / Math.pow(1 + inflationRate / 100, years));
}

/**
 * Goal Calculator — Reverse SIP
 * "How much monthly SIP do I need to reach ₹X in N years?"
 * Formula: PMT = FV × r / ((1+r)^n − 1)
 */
export function calculateGoalSIP(targetAmount, years, annualReturn) {
  const r = annualReturn / 100 / 12;
  const n = years * 12;
  if (r === 0) return Math.ceil(targetAmount / n);
  const pmt = (targetAmount * r) / (Math.pow(1 + r, n) - 1);
  return Math.ceil(pmt);
}

/**
 * Calculate how long it takes to reach a goal via lumpsum
 */
export function calculateGoalYears(targetAmount, principal, annualReturn) {
  if (annualReturn <= 0 || principal <= 0) return null;
  const years = Math.log(targetAmount / principal) / Math.log(1 + annualReturn / 100);
  return parseFloat(years.toFixed(1));
}

/**
 * ELSS Tax Saving Calculator
 * Section 80C: max ₹1.5L deduction per year
 * Returns tax saved based on income slab
 */
export function calculateELSSTaxSaving(elssAmount, taxSlab) {
  const maxDeduction = 150000;
  const eligible = Math.min(elssAmount, maxDeduction);
  const taxSaved = Math.round(eligible * (taxSlab / 100));
  const effectiveCost = elssAmount - taxSaved;
  return { eligible, taxSaved, effectiveCost };
}
