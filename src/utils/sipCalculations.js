// utils/sipCalculations.js
import { calculateTaxes as calcTaxes } from "./taxCalculations";

// Shared zero result to prevent ₹Infinity / ₹NaN on extreme inputs
const zeroResult = () => ({
  invested: 0,
  baseInvested: 0,
  stepUpInvested: 0,
  maturity: 0,
  returns: 0,
  yearlyData: [],
});

/**
 * Calculate SIP maturity value with optional step-up.
 * Inputs are sanitized and capped to prevent unrealistic/infinite outputs.
 */
export function calculateSIP(monthlyAmount, years, annualReturn, stepUp = 0) {
  // Sanitize: cap monthly at ₹1 Cr, years 1–100, return 0–100%, step-up 0–50%
  const amt = Math.max(0, Math.min(Number(monthlyAmount) || 0, 10_000_000));
  const yrs = Math.max(0, Math.min(Math.round(Number(years) || 0), 100));
  const ret = Math.max(0, Math.min(Number(annualReturn) || 0, 100));
  const su = Math.max(0, Math.min(Number(stepUp) || 0, 50));
  if (amt <= 0 || yrs <= 0) return zeroResult();

  // Compound-correct monthly rate: (1 + annual_rate)^(1/12) - 1
  // NOT annual_rate/12 which is a linear approximation that overestimates.
  const annualRate = ret / 100;
  const r = annualRate === 0 ? 0 : Math.pow(1 + annualRate, 1 / 12) - 1;
  const yearlyData = [];
  let totalInvested = 0;
  let baseInvested = 0;
  let futureValue = 0;
  let currentSIP = amt;

  for (let y = 1; y <= yrs; y++) {
    for (let m = 0; m < 12; m++) {
      futureValue = (futureValue + currentSIP) * (1 + r);
      totalInvested += currentSIP;
      baseInvested += amt;
    }
    yearlyData.push({
      year: y,
      invested: Math.round(totalInvested),
      baseInvested: Math.round(baseInvested),
      stepUpInvested: Math.round(totalInvested - baseInvested),
      value: Math.round(futureValue),
      returns: Math.round(futureValue - totalInvested),
    });
    currentSIP = currentSIP * (1 + su / 100);
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
  // Sanitize: cap principal at ₹100 Cr, years 1–100, return 0–100%
  const p = Math.max(0, Math.min(Number(principal) || 0, 1_000_000_000));
  const yrs = Math.max(0, Math.min(Math.round(Number(years) || 0), 100));
  const ret = Math.max(0, Math.min(Number(annualReturn) || 0, 100));
  if (p <= 0 || yrs <= 0) return zeroResult();

  const rate = ret / 100;
  const maturity = p * Math.pow(1 + rate, yrs);
  const yearlyData = [];

  for (let y = 1; y <= yrs; y++) {
    const value = p * Math.pow(1 + rate, y);
    yearlyData.push({
      year: y,
      invested: p,
      baseInvested: p,
      stepUpInvested: 0,
      value: Math.round(value),
      returns: Math.round(value - p),
    });
  }

  return {
    invested: Math.round(p),
    baseInvested: Math.round(p),
    stepUpInvested: 0,
    maturity: Math.round(maturity),
    returns: Math.round(maturity - p),
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
  // Compound-correct monthly rate (matches main SIP engine)
  const annualRate = annualReturn / 100;
  const r = annualRate === 0 ? 0 : Math.pow(1 + annualRate, 1 / 12) - 1;
  const n = years * 12;
  if (r === 0) return Math.ceil(targetAmount / n);
  // Match the main SIP engine, which compounds each contribution immediately
  // (annuity-due style monthly investing).
  const pmt = (targetAmount * r) / ((Math.pow(1 + r, n) - 1) * (1 + r));
  return Math.ceil(pmt);
}

/**
 * Calculate how long it takes to reach a goal via lumpsum
 */
export function calculateGoalYears(targetAmount, principal, annualReturn) {
  if (annualReturn <= 0 || principal <= 0) return null;
  const years =
    Math.log(targetAmount / principal) / Math.log(1 + annualReturn / 100);
  return parseFloat(years.toFixed(1));
}

/**
 * ELSS Tax Saving Calculator
 * Section 80C: max ₹1.5L deduction per year
 * Returns tax saved based on income slab.
 * ⚠️ ONLY applicable under the Old Tax Regime.
 * The New Tax Regime (default from FY 2023-24) does NOT allow 80C deductions.
 */
export function calculateELSSTaxSaving(elssAmount, taxSlab) {
  const maxDeduction = 150000;
  const eligible = Math.min(elssAmount, maxDeduction);
  // Base tax saved = eligible × slab rate, then add 4% Health & Education Cess on the tax
  const baseTax = eligible * (taxSlab / 100);
  const cess = baseTax * 0.04;
  const taxSaved = Math.round(baseTax + cess);
  const effectiveCost = elssAmount - taxSaved;
  return {
    eligible,
    taxSaved,
    effectiveCost,
    // Always show disclaimer — new regime users have zero 80C benefit
    disclaimer:
      "Applicable under Old Tax Regime only. New Tax Regime (default from FY 2023-24) does not allow Section 80C deductions.",
  };
}

/**
 * Calculate SWP (Systematic Withdrawal Plan)
 */
export function calculateSWP(
  totalInvestment,
  withdrawalPerMonth,
  annualReturn,
  years,
  fundType = "Equity"
) {
  const principal = Math.max(
    0,
    Math.min(Number(totalInvestment) || 0, 1_000_000_000),
  );
  const withdrawal = Math.max(
    0,
    Math.min(Number(withdrawalPerMonth) || 0, 10_000_000),
  );
  const ret = Math.max(0, Math.min(Number(annualReturn) || 0, 100));
  const yrs = Math.max(0, Math.min(Math.round(Number(years) || 0), 100));

  if (principal <= 0 || yrs <= 0) {
    return {
      invested: 0,
      totalWithdrawn: 0,
      finalValue: 0,
      totalReturns: 0,
      yearlyData: [],
      ranOutYear: null,
      ranOutMonth: null,
    };
  }

  // Compound-correct monthly rate
  const r = ret === 0 ? 0 : Math.pow(1 + ret / 100, 1 / 12) - 1;
  const yearlyData = [];
  let currentBalance = principal;
  let totalWithdrawn = 0;
  let totalReturns = 0;
  let totalExitLoad = 0;
  let ranOutYear = null;
  let ranOutMonth = null;
  let monthCount = 0;

  for (let y = 1; y <= yrs; y++) {
    let yearlyExitLoad = 0;
    for (let m = 0; m < 12; m++) {
      monthCount++;
      if (currentBalance <= 0) {
        if (ranOutYear === null) {
          ranOutYear = Math.ceil((monthCount - 1) / 12);
          ranOutMonth = (monthCount - 1) % 12 || 12;
        }
        currentBalance = 0;
        continue;
      }
      const interestEarned = currentBalance * r;
      const actualWithdrawal = Math.min(
        currentBalance + interestEarned,
        withdrawal,
      );
      
      let exitLoad = 0;
      if (monthCount <= 12 && fundType === "Equity") {
        exitLoad = actualWithdrawal * 0.01; // 1% exit load for first 12 months
      }

      currentBalance = currentBalance + interestEarned - actualWithdrawal - exitLoad;
      totalWithdrawn += actualWithdrawal;
      totalReturns += interestEarned;
      yearlyExitLoad += exitLoad;
      totalExitLoad += exitLoad;

      if (currentBalance <= 0 && ranOutYear === null) {
        ranOutYear = Math.ceil(monthCount / 12);
        ranOutMonth = monthCount % 12 || 12;
      }
    }
    yearlyData.push({
      year: y,
      invested: principal,
      withdrawn: Math.round(totalWithdrawn),
      value: Math.round(currentBalance),
      returns: Math.round(totalReturns),
      exitLoad: Math.round(yearlyExitLoad),
    });
  }

  return {
    invested: Math.round(principal),
    totalWithdrawn: Math.round(totalWithdrawn),
    finalValue: Math.round(currentBalance),
    totalReturns: Math.round(totalReturns),
    totalExitLoad: Math.round(totalExitLoad),
    yearlyData,
    ranOutYear,
    ranOutMonth,
  };
}

/**
 * Post-tax return calculator (Budget 2024/2026 + SEBI 2026 rules)
 *
 * Fund types and their tax treatment:
 *   "Equity"    — STCG (<= 12mo) = 20%, LTCG (> 12mo) = 12.5% above ₹1.25L exemption
 *   "Debt"      — All gains at slab rate (30% assumed). Post-Apr-2023 purchases only.
 *   "Debt_Pre2023" — Grandfathered: units bought before 1 Apr 2023 get 12.5% LTCG after 24mo hold.
 *   "Gold/Intl" — Under 24mo = slab-rate STCG, 24mo+ = 12.5% LTCG on FULL gain (zero exemption).
 *
 * @param {string}  fundType  "Equity" | "Debt" | "Debt_Pre2023" | "Gold/Intl"
 * @param {boolean} isSIP     true if SIP, false if lumpsum
 * @param {number}  totalInvested
 * @param {number}  maturity
 * @param {number}  years
 * @param {number}  annualReturn  percentage (e.g. 12)
 * @param {number}  finalYearSIPAmount  monthly SIP amount in the final year (for step-up)
 */
export function calculateTaxes(fundType, isSIP, totalInvested, maturity, years, annualReturn, finalYearSIPAmount = 0, fyCode = undefined) {
  return calcTaxes(fundType, isSIP, totalInvested, maturity, years, annualReturn, finalYearSIPAmount, fyCode);
}

/**
 * Exact FIFO tax calculation for multiple lots.
 * @param {Array<{buyDate: string, amount: number, sellValue: number}>} transactions 
 * @param {string} sellDate 
 * @param {string} fundType "Equity" | "Debt" | "Debt_Pre2023" | "Gold/Intl"
 * @param {number} taxSlab percentage (e.g. 30)
 */
export function computeFIFOTax(transactions, sellDate, fundType, taxSlab = 30) {
  // Sort oldest first
  const sorted = [...transactions].sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate));
  
  let totalSTCG = 0;
  let totalLTCG = 0;
  let totalSlabGain = 0;
  
  const sellD = new Date(sellDate);

  for (const lot of sorted) {
    const buyD = new Date(lot.buyDate);
    // Calendar month calculation (IT Act uses calendar months, not day-based approximation)
    const holdMonths = (sellD.getFullYear() - buyD.getFullYear()) * 12 + (sellD.getMonth() - buyD.getMonth()) + (sellD.getDate() >= buyD.getDate() ? 0 : -1);
    const gain = lot.sellValue - lot.amount;

    if (fundType === "Equity" || fundType === "equity") {
      if (holdMonths <= 12) totalSTCG += gain;
      else totalLTCG += gain;
    } else if (fundType === "Gold/Intl") {
      if (holdMonths < 24) totalSlabGain += gain;
      else totalLTCG += gain; // Taxed at 12.5% no exemption
    } else if (fundType === "Debt_Pre2023") {
      if (holdMonths < 24) totalSlabGain += gain;
      else totalLTCG += gain; // Taxed at 12.5% no exemption
    } else {
      // Debt post-2023 or Liquid
      totalSlabGain += gain;
    }
  }

  // Calculate tax
  let tax = 0;
  if (fundType === "Equity" || fundType === "equity") {
    const stcgTax = Math.max(0, totalSTCG) * 0.20;
    const taxableLtcg = Math.max(0, totalLTCG - 125000);
    const ltcgTax = taxableLtcg * 0.125;
    tax = stcgTax + ltcgTax;
  } else if (fundType === "Gold/Intl" || fundType === "Debt_Pre2023") {
    const slabTax = Math.max(0, totalSlabGain) * (taxSlab / 100);
    const ltcgTax = Math.max(0, totalLTCG) * 0.125; // NO 1.25L exemption
    tax = slabTax + ltcgTax;
  } else {
    tax = Math.max(0, totalSlabGain) * (taxSlab / 100);
  }

  return {
    totalSTCG: Math.max(0, totalSTCG),
    totalLTCG: Math.max(0, totalLTCG),
    totalSlabGain: Math.max(0, totalSlabGain),
    tax: Math.round(tax)
  };
}
