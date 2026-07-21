// src/config/taxRules.js

export const taxRules = {
  "FY23_24": {
    label: "FY 2023-24 (Pre-Budget 2024)",
    equitySTCG: 0.15,
    equityLTCG: 0.10,
    equityLTCGExemption: 100000,
    debtSTCG: 0.30,
    debtLTCG: 0.30, // Post April 2023: all gains taxed at slab rate
    debtGrandfatheredLTCG: 0.20, // Grandfathered pre-April 2023: 20% with indexation
    goldSTCG: 0.30,
    goldLTCG: 0.20, // 20% with indexation (threshold 36mo)
    intlSTCG: 0.30,
    intlLTCG: 0.20, // 20% with indexation (threshold 36mo)
    goldIntlHoldMonths: 36
  },
  "FY24_25": {
    label: "FY 2024-25 (Post-Budget 2024)",
    equitySTCG: 0.20,
    equityLTCG: 0.125,
    equityLTCGExemption: 125000,
    debtSTCG: 0.30,
    debtLTCG: 0.30,
    debtGrandfatheredLTCG: 0.125, // Removed indexation, flat 12.5%
    goldSTCG: 0.30,
    goldLTCG: 0.125, // flat 12.5% without indexation (threshold 24mo)
    intlSTCG: 0.30,
    intlLTCG: 0.125, // flat 12.5% without indexation (threshold 24mo)
    goldIntlHoldMonths: 24
  },
  "FY25_26": {
    label: "FY 2025-26",
    equitySTCG: 0.20,
    equityLTCG: 0.125,
    equityLTCGExemption: 125000,
    debtSTCG: 0.30,
    debtLTCG: 0.30,
    debtGrandfatheredLTCG: 0.125,
    goldSTCG: 0.30,
    goldLTCG: 0.125,
    intlSTCG: 0.30,
    intlLTCG: 0.125,
    goldIntlHoldMonths: 24
  },
  "FY26_27": {
    label: "FY 2026-27 (Current/Latest)",
    equitySTCG: 0.20,
    equityLTCG: 0.125,
    equityLTCGExemption: 125000,
    debtSTCG: 0.30,
    debtLTCG: 0.30,
    debtGrandfatheredLTCG: 0.125,
    goldSTCG: 0.30,
    goldLTCG: 0.125,
    intlSTCG: 0.30,
    intlLTCG: 0.125,
    goldIntlHoldMonths: 24
  }
};

export const LATEST_FY = "FY26_27";
