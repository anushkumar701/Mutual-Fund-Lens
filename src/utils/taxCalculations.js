// src/utils/taxCalculations.js
import { taxRules, LATEST_FY } from "../config/taxRules";

/**
 * Parameterized post-tax return calculator (Budget 2024/2026 + SEBI 2026 rules)
 * Standardized to run off a chosen Financial Year config.
 *
 * @param {string}  fundType  "Equity" | "Debt" | "Debt_Pre2023" | "Gold/Intl"
 * @param {boolean} isSIP     true if SIP, false if lumpsum
 * @param {number}  totalInvested
 * @param {number}  maturity
 * @param {number}  years
 * @param {number}  annualReturn  percentage (e.g. 12)
 * @param {number}  finalYearSIPAmount  monthly SIP amount in the final year (for step-up)
 * @param {string}  fyCode    e.g., "FY24_25", "FY25_26", "FY26_27"
 */
export function calculateTaxes(
  fundType,
  isSIP,
  totalInvested,
  maturity,
  years,
  annualReturn,
  finalYearSIPAmount = 0,
  fyCode = LATEST_FY
) {
  const rules = taxRules[fyCode] || taxRules[LATEST_FY];
  const totalGain = maturity - totalInvested;
  if (totalGain <= 0) {
    return { stcg: 0, ltcg: 0, tax: 0, postTaxMaturity: maturity, postTaxReturn: 0 };
  }

  // ── Gold / International Funds ─────────────────────────────────────────────
  if (fundType === "Gold/Intl") {
    const holdMonths = years * 12;
    const threshold = rules.goldIntlHoldMonths || 24;
    if (holdMonths < threshold) {
      // STCG at slab rate
      const tax = totalGain * rules.goldSTCG;
      return {
        stcg: Math.round(totalGain),
        ltcg: 0,
        tax: Math.round(tax),
        postTaxMaturity: Math.round(maturity - tax),
        postTaxReturn: Math.round(totalGain - tax)
      };
    }
    // LTCG at rules.goldLTCG, no exemption
    const tax = totalGain * rules.goldLTCG;
    return {
      stcg: 0,
      ltcg: Math.round(totalGain),
      tax: Math.round(tax),
      postTaxMaturity: Math.round(maturity - tax),
      postTaxReturn: Math.round(totalGain - tax)
    };
  }

  // ── Grandfathered Debt (purchased before 1 Apr 2023) ───────────────────────
  if (fundType === "Debt_Pre2023") {
    const holdMonths = years * 12;
    if (holdMonths < 24) {
      const tax = totalGain * rules.debtSTCG;
      return {
        stcg: Math.round(totalGain),
        ltcg: 0,
        tax: Math.round(tax),
        postTaxMaturity: Math.round(maturity - tax),
        postTaxReturn: Math.round(totalGain - tax)
      };
    }
    const tax = totalGain * rules.debtGrandfatheredLTCG;
    return {
      stcg: 0,
      ltcg: Math.round(totalGain),
      tax: Math.round(tax),
      postTaxMaturity: Math.round(maturity - tax),
      postTaxReturn: Math.round(totalGain - tax)
    };
  }

  // ── Debt (post-Apr-2023 purchases) ─────────────────────────────────────────
  if (fundType === "Debt") {
    // All gains at slab rate (rules.debtSTCG or rules.debtLTCG)
    const tax = totalGain * rules.debtSTCG;
    return {
      stcg: 0,
      ltcg: 0,
      tax: Math.round(tax),
      postTaxMaturity: Math.round(maturity - tax),
      postTaxReturn: Math.round(totalGain - tax)
    };
  }

  // ── Equity / ELSS / Index ──────────────────────────────────────────────────
  let stcg = 0;
  let ltcg = 0;

  if (years <= 1) {
    // All gains are short-term
    stcg = totalGain;
  } else {
    if (!isSIP) {
      // Lumpsum > 1 year -> all LTCG
      ltcg = totalGain;
    } else {
      // SIP: last 12 months are STCG, rest is LTCG
      const r = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
      let stInvested = 0;
      let stValue = 0;
      for (let m = 1; m <= 12; m++) {
        stInvested += finalYearSIPAmount;
        stValue += finalYearSIPAmount * Math.pow(1 + r, m);
      }
      stcg = Math.max(0, stValue - stInvested);
      ltcg = Math.max(0, totalGain - stcg);
    }
  }

  const stcgTax = stcg * rules.equitySTCG;
  const taxableLtcg = Math.max(0, ltcg - rules.equityLTCGExemption);
  const ltcgTax = taxableLtcg * rules.equityLTCG;
  const tax = stcgTax + ltcgTax;

  return {
    stcg: Math.round(stcg),
    ltcg: Math.round(ltcg),
    tax: Math.round(tax),
    postTaxMaturity: Math.round(maturity - tax),
    postTaxReturn: Math.round(totalGain - tax)
  };
}
