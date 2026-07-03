// pages/SIPCalculator.jsx
import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import SIPSlider from "../components/SIPSlider";
import {
  calculateSIP,
  calculateLumpsum,
  adjustForInflation,
  calculateGoalSIP,
  calculateSWP,
  calculateTaxes,
  computeFIFOTax,
  calculateELSSTaxSaving,
} from "../utils/sipCalculations";
import { formatINR } from "../utils/formatCurrency";
import { fetchFundDetail } from "../hooks/useFunds";
import { useDebounce } from "../hooks/useDebounce";
import { useFunds } from "../hooks/useFunds";

function ResultCard({ label, value, accent, sub }) {
  return (
    <div
      className={`card p-5 text-center ${accent ? "border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-950" : ""}`}
    >
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
      {sub && (
        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{sub}</p>
      )}
    </div>
  );
}

// Dark-mode-safe custom tooltip for recharts
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-4 py-3 text-xs">
      <p className="font-bold text-slate-700 dark:text-slate-300 mb-2">
        Year {label}
      </p>
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex items-center justify-between gap-6 mb-1"
        >
          <span style={{ color: entry.color }} className="font-medium">
            {entry.name}
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {formatINR(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX RULES CONFIG — Future-proof: add a new FY key whenever the Budget changes.
// The calculator automatically picks the correct rules based on the sell date.
// ─────────────────────────────────────────────────────────────────────────────
const TAX_RULES = {
  // FY 2022-23: Old STCG 15%, LTCG 10% (₹1L exemption), Debt had LTCG with indexation
  2022: {
    equity: {
      stcgRate: 0.15,
      ltcgRate: 0.1,
      ltcgThresholdMonths: 12,
      ltcgExemption: 100000,
    },
    debt: { allRate: "slab", ltcgMonths: 36, ltcgRate: 0.2, indexation: true },
    note: "Rules as per Finance Act 2022. Debt LTCG with indexation was available.",
  },
  // FY 2023-24: Equity same, Debt lost LTCG benefit (post Apr 1 2023)
  2023: {
    equity: {
      stcgRate: 0.15,
      ltcgRate: 0.1,
      ltcgThresholdMonths: 12,
      ltcgExemption: 100000,
    },
    debt: { allRate: "slab" },
    note: "From Apr 2023: Debt fund LTCG benefit removed. All debt gains taxed at slab rate.",
  },
  // FY 2024-25: Budget 2024 — STCG raised to 20%, LTCG to 12.5%, exemption ₹1.25L
  2024: {
    equity: {
      stcgRate: 0.2,
      ltcgRate: 0.125,
      ltcgThresholdMonths: 12,
      ltcgExemption: 125000,
    },
    debt: { allRate: "slab" },
    note: "Budget 2024: Equity STCG raised 15%→20%, LTCG raised 10%→12.5%, exemption ₹1L→₹1.25L.",
  },
  // FY 2025-26: Same as 2024 (no changes in interim budget). Update here if Budget 2025 changes rates.
  // 2025: { equity: { ... }, debt: { ... }, note: '...' },
};

/** Returns the Indian Financial Year number (e.g. Apr 2024 = FY 2024) for a given date string. */
function getSellFY(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return 2024;
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // Apr onwards = new FY
}

/** Picks the most recent ruleset that is ≤ the sell FY (fallback-safe). */
function resolveRules(sellFY) {
  const keys = Object.keys(TAX_RULES)
    .map(Number)
    .sort((a, b) => a - b);
  const applicable = keys.filter((k) => k <= sellFY);
  const key =
    applicable.length > 0
      ? applicable[applicable.length - 1]
      : keys[keys.length - 1];
  return {
    rules: TAX_RULES[key],
    fyKey: key,
    fyLabel: `FY ${key}-${String(key + 1).slice(-2)}`,
  };
}

/**
 * Computes tax and returns a plain-English explanation.
 * Adding new budget rules only requires adding to TAX_RULES above — this function stays unchanged.
 */
function renderStepIcon(name, cls) {
  switch (name) {
    case "loss":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"/></svg>;
    case "refresh":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.75 8.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;
    case "info":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;
    case "clock":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;
    case "fee":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;
    case "trophy":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>;
    case "gift":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4"/></svg>;
    case "calculator":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 00-2-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>;
    case "scale":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>;
    case "bank":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>;
    case "calendar":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>;
    default:
      return null;
  }
}

function buildTaxResult({ fundType, gain, holdingMonths, taxSlab, sellDate, isSIP, buyAmount, buyDate, sellAmount }) {
  const sellFY = getSellFY(sellDate);
  // eslint-disable-next-line no-unused-vars
  const { rules, fyKey, fyLabel } = resolveRules(sellFY);
  const isEquity = fundType === "equity" || fundType === "Equity";
  const fmt = (v) => `₹${Math.round(v).toLocaleString("en-IN")}`;
  const holdYrs = (holdingMonths / 12).toFixed(1);
  const holdMo = Math.round(holdingMonths);

  // ── SIP FIFO Tax Calculation ────────────────────────────────────────────────
  if (isSIP) {
    const months = Math.max(1, Math.floor(holdingMonths));
    const totalInvested = buyAmount * months;
    const finalGain = sellAmount - totalInvested;
    
    if (finalGain <= 0) {
      return {
        taxType: "Capital Loss (No Tax)",
        taxAmount: 0,
        fyLabel,
        rulesNote: rules.note,
        steps: [
          {
            icon: "loss",
            title: "You made a loss",
            body: `You invested ${fmt(totalInvested)} but received ${fmt(sellAmount)}. No tax is due.`,
          },
          {
            icon: "refresh",
            title: "Carry-forward benefit (Updated Rules)",
            body: "Under new FY 2026-27 rules, a capital loss can only be offset once. You cannot continuously roll over unused losses across multiple future years like before.",
          },
        ],
        pillColor: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
      };
    }

    // Synthesize FIFO lots growing linearly to match exact final value
    // This perfectly distributes the final value across time
    const transactions = [];
    const bD = new Date(buyDate);
    const r = (sellAmount - totalInvested) / (buyAmount * ((months * (months + 1)) / 2));
    
    for (let i = 1; i <= months; i++) {
      const lotBuyDate = new Date(bD);
      lotBuyDate.setMonth(lotBuyDate.getMonth() + (months - i));
      const lotSellValue = buyAmount * (1 + r * i);
      transactions.push({ buyDate: lotBuyDate.toISOString(), amount: buyAmount, sellValue: lotSellValue });
    }

    const { totalSTCG, totalLTCG, totalSlabGain, tax } = computeFIFOTax(transactions, sellDate, fundType, taxSlab);
    
    return {
      taxType: `SIP FIFO Tax`,
      taxAmount: tax,
      fyLabel,
      rulesNote: rules.note,
      steps: [
        {
          icon: "calculator",
          title: "FIFO Allocation Applied",
          body: `SIP instalments are taxed First-In-First-Out. Out of your total gain of ${fmt(finalGain)}:`,
        },
        {
          icon: "clock",
          title: "Short-Term vs Long-Term",
          body: isEquity 
            ? `Gain on units < 12mo old (STCG): ${fmt(totalSTCG)}. Gain on older units (LTCG): ${fmt(totalLTCG)}.`
            : `Slab rate gain: ${fmt(totalSlabGain)}. (12.5% LTCG: ${fmt(totalLTCG)})`,
        },
        {
          icon: "fee",
          title: `Total Tax Payable: ${fmt(tax)}`,
          body: isEquity
            ? `Includes 20% STCG and 12.5% LTCG (after ₹1.25L exemption on the LTCG portion).`
            : `Includes slab rate and flat LTCG if applicable, without ₹1.25L exemption.`,
        }
      ],
      pillColor: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300",
    };
  }

  // ── Loss ──────────────────────────────────────────────────────────────────
  if (gain <= 0) {
    return {
      taxType: "Capital Loss (No Tax)",
      taxAmount: 0,
      fyLabel,
      rulesNote: rules.note,
      steps: [
        {
          icon: "loss",
          title: "You made a loss",
          body: `You sold for ${fmt(Math.abs(gain))} less than you bought. No tax is due.`,
        },
        {
          icon: "refresh",
          title: "Carry-forward benefit (Updated Rules)",
          body: "Under new FY 2026-27 rules, a capital loss can only be offset once. You cannot continuously roll over unused losses across multiple future years like before.",
        },
        {
          icon: "info",
          title: "Offset matching",
          body: "Short-term capital loss can offset both short-term and long-term gains. Long-term loss can only offset long-term gains.",
        },
      ],
      pillColor:
        "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
    };
  }

  // ── Equity / ELSS / Index ─────────────────────────────────────────────────
  if (isEquity) {
    if (holdingMonths < rules.equity.ltcgThresholdMonths) {
      const tax = gain * rules.equity.stcgRate;
      const ratePct = (rules.equity.stcgRate * 100).toFixed(0);
      return {
        taxType: `STCG @ ${ratePct}%`,
        taxAmount: tax,
        fyLabel,
        rulesNote: rules.note,
        steps: [
          {
            icon: "clock",
            title: `Held only ${holdMo} months`,
            body: `Less than 12 months = Short-Term. The government treats this like a quick profit and taxes it more heavily.`,
          },
          {
            icon: `fee`,
            title: `STCG rate is ${ratePct}% flat`,
            body: `Your profit of ${fmt(gain)} is fully taxable. Tax = ${fmt(gain)} × ${ratePct}% = ${fmt(tax)}.`,
          },
          {
            icon: "info",
            title: "Money-saving tip",
            body: `If you wait until this fund completes 12 months, the STCG rate of ${ratePct}% drops to LTCG rate of ${(rules.equity.ltcgRate * 100).toFixed(1)}% — and first ${fmt(rules.equity.ltcgExemption)} is tax-free!`,
          },
          {
            icon: "info",
            title: "⚠️ Section 87A does NOT cover this",
            body: "Even if your total income is under ₹12 lakh, the Section 87A rebate does NOT apply to capital gains tax (STCG or LTCG). This tax is payable separately.",
          },
        ],
        pillColor:
          "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300",
      };
    } else {
      const exemption = rules.equity.ltcgExemption;
      const taxableGain = Math.max(0, gain - exemption);
      const tax = taxableGain * rules.equity.ltcgRate;
      const ratePct = (rules.equity.ltcgRate * 100).toFixed(1);
      return {
        taxType: `LTCG @ ${ratePct}%`,
        taxAmount: tax,
        fyLabel,
        rulesNote: rules.note,
        steps: [
          {
            icon: "trophy",
            title: `Held ${holdYrs} years — LTCG applies`,
            body: `You held for more than 12 months. This qualifies as Long-Term Capital Gain (LTCG), which is taxed at a lower rate.`,
          },
          {
            icon: "gift",
            title: `First ${fmt(exemption)} is tax-free`,
            body: `Every financial year, the government gives a free exemption of ${fmt(exemption)} on equity LTCG. You don't pay even 1 rupee on this portion.`,
          },
          {
            icon: "calculator",
            title: "How tax is calculated",
            body:
              taxableGain <= 0
                ? `Your gain of ${fmt(gain)} is within the ${fmt(exemption)} exemption limit — tax payable is ₹0!`
                : `Taxable gain = ${fmt(gain)} − ${fmt(exemption)} = ${fmt(taxableGain)}. Tax = ${fmt(taxableGain)} × ${ratePct}% = ${fmt(tax)}.`,
          },
          {
            icon: "info",
            title: "⚠️ Section 87A does NOT cover this",
            body: "Even if your total income is under ₹12 lakh, the Section 87A rebate does NOT apply to capital gains tax (STCG or LTCG). This tax is payable separately.",
          },
        ],
        pillColor:
          "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
      };
    }
  }

  // ── Gold / International ──────────────────────────────────────────────────
  if (fundType === "Gold/Intl") {
    if (holdingMonths < 24) {
      const tax = gain * (taxSlab / 100);
      return {
        taxType: `STCG @ Slab (${taxSlab}%)`,
        taxAmount: tax,
        fyLabel,
        rulesNote: rules.note,
        steps: [
          {
            icon: "clock",
            title: `Held less than 24 months`,
            body: `For gold and international funds, holding less than 2 years means gains are added to your income and taxed at your slab rate.`,
          },
          {
            icon: "bank",
            title: `Slab rate applied: ${taxSlab}%`,
            body: `Tax = ${fmt(gain)} × ${taxSlab}% = ${fmt(tax)}.`,
          },
        ],
        pillColor:
          "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300",
      };
    } else {
      const tax = gain * 0.125;
      return {
        taxType: `LTCG @ 12.5%`,
        taxAmount: tax,
        fyLabel,
        rulesNote: rules.note,
        steps: [
          {
            icon: "trophy",
            title: `Held 24+ months (LTCG)`,
            body: `You held for more than 24 months. For gold and international funds, this qualifies for a flat 12.5% LTCG rate.`,
          },
          {
            icon: "calculator",
            title: "No ₹1.25L Exemption",
            body: `Unlike equity funds, there is no tax-free exemption for gold/international funds. The entire gain is taxable. Tax = ${fmt(gain)} × 12.5% = ${fmt(tax)}.`,
          },
        ],
        pillColor:
          "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300",
      };
    }
  }

  // ── Grandfathered Debt (Pre Apr 2023) ─────────────────────────────────────
  if (fundType === "Debt_Pre2023") {
    if (holdingMonths < 24) {
      const tax = gain * (taxSlab / 100);
      return {
        taxType: `STCG @ Slab (${taxSlab}%)`,
        taxAmount: tax,
        fyLabel,
        rulesNote: "Old Debt Rules: Units purchased before 1 Apr 2023",
        steps: [
          {
            icon: "clock",
            title: `Held less than 24 months`,
            body: `Short-term gains on grandfathered debt funds are taxed at your slab rate.`,
          },
        ],
        pillColor:
          "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
      };
    } else {
      const tax = gain * 0.125;
      return {
        taxType: `LTCG @ 12.5%`,
        taxAmount: tax,
        fyLabel,
        rulesNote: "Grandfathered Debt Rules",
        steps: [
          {
            icon: "calendar",
            title: "Grandfathered Debt Units",
            body: `Because these units were purchased before April 1, 2023, they retain LTCG benefits. Held for >24 months, taxed at a flat 12.5%.`,
          },
          {
            icon: "calculator",
            title: "Tax calculation",
            body: `Tax = ${fmt(gain)} × 12.5% = ${fmt(tax)}. (Indexation benefit is no longer applicable after Budget 2024).`,
          },
        ],
        pillColor:
          "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
      };
    }
  }

  // ── Debt / Liquid (Post Apr 2023) ─────────────────────────────────────────
  if (fundType === "Debt" || fundType === "debt" || fundType === "Liquid") {
    const tax = gain * (taxSlab / 100);
    return {
      taxType: `Slab Rate @ ${taxSlab}%`,
      taxAmount: tax,
      fyLabel,
      rulesNote: rules.note,
      steps: [
        {
          icon: "scale",
          title: "Debt funds lost LTCG benefit (Apr 2023)",
          body: `From April 1, 2023, all debt fund gains — whether you held for 1 month or 10 years — are added to your income and taxed at your income tax slab rate.`,
        },
        {
          icon: "bank",
          title: `Your slab rate is ${taxSlab}%`,
          body: `Tax = ${fmt(gain)} × ${taxSlab}% = ${fmt(tax)}. This is the same as how Fixed Deposit interest is taxed.`,
        },
        {
          icon: "info",
          title: "Smarter alternatives",
          body: `If you want lower tax, consider Equity Savings Funds (65%+ equity) which qualify for equity LTCG, or Tax-Free Bonds for post-tax efficiency.`,
        },
      ],
      pillColor:
        "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300",
    };
  }
}

function renderTabIcon(id, cls) {
  switch (id) {
    case "calc":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/></svg>;
    case "swp":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6.125c0-.621.504-1.125 1.125-1.125H9.75M9 5.25h6m-6 3h6m-6 3h6m-6 3h6"/></svg>;
    case "goal":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;
    case "elss":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>;
    case "fire":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z"/></svg>;
    case "tax":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21V10m0 10a2 2 0 01-2-2V8a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 01-2 2m-6-3a2 2 0 002 2h2a2 2 0 002-2m0-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3zm12-3a2 2 0 01-2-2V6a2 2 0 012-2h2a2 2 0 012 2v6a2 2 0 01-2 2h-2z"/></svg>;
    case "date":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>;
    case "clock":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;
    default:
      return null;
  }
}

export default function SIPCalculator() {
  const [isLumpsum, setIsLumpsum] = useState(false);
  const [inflationMode, setInflationMode] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [pageTab, setPageTab] = useState("calc"); // 'calc' | 'swp' | 'goal' | 'elss' | 'fire'
  const [amount, setAmount] = useState(5000);
  const [years, setYears] = useState(10);
  const [returns, setReturns] = useState(12);
  const [stepUp, setStepUp] = useState(0);
  const [inflation, setInflation] = useState(6);
  const [expenseRatio, setExpenseRatio] = useState(0.5);
  const [fdRate, setFdRate] = useState(6.5);
  const [ppfRate, setPpfRate] = useState(7.1);
  // Goal Calculator state
  const [goalTarget, setGoalTarget] = useState(5000000);
  const [goalYears, setGoalYears] = useState(10);
  const [goalReturn, setGoalReturn] = useState(12);
  // ELSS state
  const [elssAmount, setElssAmount] = useState(150000);
  const [taxSlab, setTaxSlab] = useState(30);
  // SWP state
  const [swpInvestment, setSwpInvestment] = useState(1000000);
  const [swpWithdrawal, setSwpWithdrawal] = useState(10000);
  const [swpReturn, setSwpReturn] = useState(8);
  const [swpYears, setSwpYears] = useState(10);
  const [swpFundType, setSwpFundType] = useState("Equity");
  const [swpShowTable, setSwpShowTable] = useState(false);
  // FIRE state
  const [fireMonthlyExpense, setFireMonthlyExpense] = useState(50000);
  const [fireCurrentAge, setFireCurrentAge] = useState(28);
  const [fireRetireAge, setFireRetireAge] = useState(45);
  const [fireReturnRate, setFireReturnRate] = useState(12);
  const [fireWithdrawalRate, setFireWithdrawalRate] = useState(4);
  const [fireCurrentCorpus, setFireCurrentCorpus] = useState(500000);
  const [fireInflation, setFireInflation] = useState(6);

  // Tax P&L state
  const [taxFundType, setTaxFundType] = useState("equity");
  const [taxIsSIP, setTaxIsSIP] = useState(false);
  const [taxBuyAmount, setTaxBuyAmount] = useState(100000);
  const [taxSellAmount, setTaxSellAmount] = useState(150000);
  const [taxBuyDate, setTaxBuyDate] = useState("2023-01-15");
  const [taxSellDate, setTaxSellDate] = useState("2025-01-15");

  // SIP Date Optimizer state
  const { funds } = useFunds();
  const [dateQuery, setDateQuery] = useState("");
  const debouncedDateQuery = useDebounce(dateQuery, 300);
  const [dateSearchOpen, setDateSearchOpen] = useState(false);
  const [selectedDateFund, setSelectedDateFund] = useState(null);
  const [dateFundData, setDateFundData] = useState(null);
  const [dateFundLoading, setDateFundLoading] = useState(false);
  const [dateSipAmount, setDateSipAmount] = useState(5000);
  const [dateSipYears, setDateSipYears] = useState(5);

  const dateFundSearch = useMemo(() => {
    if (!debouncedDateQuery.trim() || debouncedDateQuery.length < 2) return [];
    const q = debouncedDateQuery.toLowerCase();
    return (funds || [])
      .filter(
        (f) =>
          f.schemeName.toLowerCase().includes(q) ||
          String(f.schemeCode).includes(q),
      )
      .slice(0, 8);
  }, [debouncedDateQuery, funds]);

  const handleDateFundSelect = async (fund) => {
    setSelectedDateFund(fund);
    setDateQuery(fund.schemeName);
    setDateSearchOpen(false);
    setDateFundLoading(true);
    setDateFundData(null);
    try {
      const data = await fetchFundDetail(String(fund.schemeCode));
      setDateFundData(data);
    } catch { /* loading failure is silent — UI stays as-is */ }
    setDateFundLoading(false);
  };

  // Simulate SIP for each day 1-28 and return sorted XIRR results
  const dateOptimizerResults = useMemo(() => {
    if (!dateFundData?.data || dateFundData.data.length === 0) return [];
    const navData = dateFundData.data;
    
    const sortedNavs = [...navData]
      .reverse()
      .map((d) => {
        const [dd, mm, yyyy] = d.date.split("-");
        return {
          ts: Date.UTC(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10)),
          nav: parseFloat(d.nav),
        };
      })
      .filter((d) => !isNaN(d.ts) && d.nav > 0);
      
    if (sortedNavs.length === 0) return [];

    const latest = sortedNavs[sortedNavs.length - 1];
    const oldestTs = sortedNavs[0].ts;

    // Binary search to find the NAV on or immediately after the target date (mimicking weekend/holiday delays)
    function getNextAvailableNav(targetTs) {
      if (targetTs < oldestTs) return null; // Fund didn't exist yet
      if (targetTs > latest.ts) return null; // In the future
      let lo = 0;
      let hi = sortedNavs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sortedNavs[mid].ts < targetTs) lo = mid + 1;
        else hi = mid;
      }
      return sortedNavs[lo].nav;
    }

    const out = [];
    const monthsBack = dateSipYears * 12;

    // Precompute target year and month in UTC to avoid creating Date objects inside the days loop
    const monthsInfo = [];
    for (let m = 0; m < monthsBack; m++) {
      const targetDate = new Date(latest.ts);
      targetDate.setUTCMonth(targetDate.getUTCMonth() - m);
      monthsInfo.push({
        year: targetDate.getUTCFullYear(),
        month: targetDate.getUTCMonth(),
      });
    }

    for (let day = 1; day <= 28; day++) {
      let totalInvested = 0;
      let totalUnits = 0;
      let validMonths = 0;

      for (let m = 0; m < monthsBack; m++) {
        const { year, month } = monthsInfo[m];
        const targetTs = Date.UTC(year, month, day);

        const nav = getNextAvailableNav(targetTs);
        if (nav !== null) {
          totalInvested += dateSipAmount;
          totalUnits += dateSipAmount / nav;
          validMonths++;
        }
      }

      if (totalInvested === 0) continue;
      const currentValue = totalUnits * latest.nav;
      
      // Calculate XIRR using the generic formula over the valid months invested
      let xirr = null;
      try {
        let lo = -0.5,
          hi = 2.0,
          rate = 0;
        for (let iter = 0; iter < 100; iter++) {
          rate = (lo + hi) / 2;
          if (Math.abs(hi - lo) < 1e-8) break;
          if (Math.abs(rate) < 1e-10) {
            rate = 0;
            break;
          }
          const fv = (dateSipAmount * (1 + rate) * (Math.pow(1 + rate, validMonths) - 1)) / rate;
          if (fv > currentValue) hi = rate;
          else lo = rate;
        }
        xirr = parseFloat(((Math.pow(1 + rate, 12) - 1) * 100).toFixed(2));
        if (!isFinite(xirr) || xirr < -100 || xirr > 500) xirr = null;
      } catch {
        xirr = null;
      }
      
      out.push({ date: day, xirr, currentValue, invested: totalInvested });
    }
    return out;
  }, [dateFundData, dateSipAmount, dateSipYears]);

  const bestDateResult =
    dateOptimizerResults.length > 0
      ? [...dateOptimizerResults].sort(
          (a, b) => (b.xirr ?? -99) - (a.xirr ?? -99),
        )[0]
      : null;
  const worstDateResult =
    dateOptimizerResults.length > 0
      ? [...dateOptimizerResults].sort(
          (a, b) => (a.xirr ?? 99) - (b.xirr ?? 99),
        )[0]
      : null;

  const effectiveReturn = Math.max(0, returns - expenseRatio);
  const effectiveReturnWarning = expenseRatio > 0 && effectiveReturn === 0;

  const result = useMemo(() => {
    let baseRes;
    let fdRes;
    let ppfRes;
    
    if (isLumpsum) {
      baseRes = calculateLumpsum(amount, years, effectiveReturn);
      fdRes = calculateLumpsum(amount, years, fdRate);
      ppfRes = calculateLumpsum(amount, years, ppfRate);
    } else {
      baseRes = calculateSIP(amount, years, effectiveReturn, stepUp);
      fdRes = calculateSIP(amount, years, fdRate, stepUp);
      ppfRes = calculateSIP(amount, years, ppfRate, stepUp);
    }

    // Merge FD and PPF projection data into the main yearlyData array for the chart
    baseRes.yearlyData = baseRes.yearlyData.map((d, i) => ({
      ...d,
      fdValue: fdRes.yearlyData[i]?.value || 0,
      ppfValue: ppfRes.yearlyData[i]?.value || 0,
    }));
    
    baseRes.fdMaturity = fdRes.maturity;
    baseRes.ppfMaturity = ppfRes.maturity;
    
    return baseRes;
  }, [isLumpsum, amount, years, effectiveReturn, stepUp, fdRate, ppfRate]);

  const realValue = useMemo(() => {
    if (!inflationMode) return null;
    return adjustForInflation(result.maturity, inflation, years);
  }, [inflationMode, result.maturity, inflation, years]);

  const taxResult = useMemo(() => {
    // For SIP with step-up, the final year SIP amount is amount * (1 + stepUp/100)^(years - 1)
    const finalSip = isLumpsum ? 0 : amount * Math.pow(1 + stepUp / 100, years - 1);
    return calculateTaxes("Equity", !isLumpsum, result.invested, result.maturity, years, effectiveReturn, finalSip);
  }, [isLumpsum, result, years, effectiveReturn, amount, stepUp]);

  const wealthMultiple =
    result.invested > 0 ? (result.maturity / result.invested).toFixed(2) : "—";

  const goalSIP = useMemo(
    () => calculateGoalSIP(goalTarget, goalYears, goalReturn),
    [goalTarget, goalYears, goalReturn],
  );
  const goalTotal = goalSIP * goalYears * 12;
  const elssResult = useMemo(
    () => calculateELSSTaxSaving(elssAmount, taxSlab),
    [elssAmount, taxSlab],
  );
  const swpResult = useMemo(
    () => calculateSWP(swpInvestment, swpWithdrawal, swpReturn, swpYears, swpFundType),
    [swpInvestment, swpWithdrawal, swpReturn, swpYears, swpFundType],
  );

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Wealth Simulator
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Estimate returns, plan your goal, save tax with ELSS, and structure
            SWP withdrawals
          </p>
        </div>

        {/* Page Tabs — swipeable on mobile */}
        <div className="pill-scroll bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
          {[
            ["calc", "SIP / Lumpsum", "SIP"],
            ["swp", "SWP", "SWP"],
            ["goal", "Goal", "Goal"],
            ["elss", "ELSS Tax", "ELSS"],
            ["fire", "FIRE", "FIRE"],
            ["tax", "Tax P&L", "Tax"],
            ["date", "SIP Date", "Date"],
          ].map(([id, label, mobileLabel]) => (
            <button
              key={id}
              onClick={() => setPageTab(id)}
              className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${pageTab === id ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
            >
              {renderTabIcon(id, `w-4 h-4 ${pageTab === id ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`)}
              <span className="sm:hidden">{mobileLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ─ SIP / LUMPSUM ─ */}
        {pageTab === "calc" && (
          <div className="grid lg:grid-cols-[420px,1fr] gap-6">
            {/* Left: Controls */}
            <div className="space-y-5">
              {/* Mode toggles */}
              <div className="card p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Investment Mode
                  </span>
                  <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 gap-0.5">
                    <button
                      id="mode-sip"
                      onClick={() => setIsLumpsum(false)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${!isLumpsum ? "bg-white dark:bg-slate-600 text-blue-600 shadow-sm" : "text-slate-500 dark:text-slate-400"}`}
                    >
                      SIP
                    </button>
                    <button
                      id="mode-lumpsum"
                      onClick={() => setIsLumpsum(true)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${isLumpsum ? "bg-white dark:bg-slate-600 text-blue-600 shadow-sm" : "text-slate-500 dark:text-slate-400"}`}
                    >
                      Lumpsum
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Inflation-Adjusted
                  </span>
                  <button
                    id="inflation-toggle"
                    onClick={() => setInflationMode(!inflationMode)}
                    role="switch"
                    aria-checked={inflationMode}
                    aria-label="Toggle inflation adjustment"
                    className={`relative w-11 h-6 rounded-full transition-colors ${inflationMode ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${inflationMode ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </div>
              </div>

              {/* Sliders */}
              <div className="card p-5 space-y-6">
                <div className="space-y-3">
                  <SIPSlider
                    id="amount-slider"
                    label={
                      isLumpsum ? "One-time Investment" : "Monthly SIP Amount"
                    }
                    value={amount}
                    onChange={setAmount}
                    min={isLumpsum ? 1000 : 100}
                    max={isLumpsum ? 5000000 : 100000}
                    step={isLumpsum ? 1000 : 100}
                    prefix="₹"
                    formatFn={(v) => formatINR(v)}
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(isLumpsum
                      ? [10000, 50000, 100000, 500000]
                      : [500, 1000, 5000, 10000]
                    ).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setAmount(preset)}
                        className={`px-3 py-1 text-xs rounded-full border transition-all ${amount === preset ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                      >
                        {preset >= 100000
                          ? `₹${preset / 100000}L`
                          : preset >= 1000
                            ? `₹${preset / 1000}K`
                            : `₹${preset}`}
                      </button>
                    ))}
                  </div>
                </div>
                <SIPSlider
                  id="years-slider"
                  label="Investment Duration"
                  value={years}
                  onChange={setYears}
                  min={1}
                  max={30}
                  suffix=" yr"
                />
                <SIPSlider
                  id="return-slider"
                  label="Expected Annual Return"
                  value={returns}
                  onChange={setReturns}
                  min={1}
                  max={30}
                  step={0.5}
                  suffix="%"
                />
                <SIPSlider
                  id="expense-ratio-slider"
                  label="Expense Ratio"
                  value={expenseRatio}
                  onChange={setExpenseRatio}
                  min={0}
                  max={3}
                  step={0.05}
                  suffix="%"
                />
                {expenseRatio > 0 && (
                  <div
                    className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${effectiveReturnWarning ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800" : "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"}`}
                  >
                    <span
                      className={`flex items-center gap-1 ${
                        effectiveReturnWarning
                          ? "text-red-700 dark:text-red-300"
                          : "text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {effectiveReturnWarning ? (
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                      )}
                      <span>
                        {effectiveReturnWarning
                          ? "Expense ratio cancels all returns!"
                          : "Effective Return"}
                      </span>
                    </span>
                    <span
                      className={`font-bold ${effectiveReturnWarning ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}
                    >
                      {returns}% − {expenseRatio}% ={" "}
                      <strong>{effectiveReturn.toFixed(2)}%</strong> p.a.
                    </span>
                  </div>
                )}
                {!isLumpsum && (
                  <SIPSlider
                    id="stepup-slider"
                    label="Annual Step-Up"
                    value={stepUp}
                    onChange={setStepUp}
                    min={0}
                    max={25}
                    suffix="%"
                  />
                )}
                {inflationMode && (
                  <SIPSlider
                    id="inflation-slider"
                    label="Inflation Rate"
                    value={inflation}
                    onChange={setInflation}
                    min={1}
                    max={10}
                    suffix="%"
                  />
                )}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-4">
                  <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                    Custom Benchmark Rates
                  </span>
                  <SIPSlider
                    id="fd-rate-slider"
                    label="Fixed Deposit (FD) Rate"
                    value={fdRate}
                    onChange={setFdRate}
                    min={1}
                    max={15}
                    step={0.1}
                    suffix="%"
                  />
                  <SIPSlider
                    id="ppf-rate-slider"
                    label="Public Provident Fund (PPF) Rate"
                    value={ppfRate}
                    onChange={setPpfRate}
                    min={1}
                    max={15}
                    step={0.1}
                    suffix="%"
                  />
                </div>
              </div>
            </div>

            {/* Right: Results */}
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <ResultCard
                  label="Total Invested"
                  value={formatINR(result.invested)}
                />
                <ResultCard
                  label="Estimated Returns"
                  value={formatINR(result.returns)}
                />
                <ResultCard
                  label="Post-Tax Maturity"
                  value={formatINR(taxResult.postTaxMaturity)}
                  sub={`₹${formatINR(taxResult.tax)} tax deducted`}
                />
                <ResultCard
                  label="Pre-Tax Maturity"
                  value={formatINR(result.maturity)}
                  accent
                  sub={`${wealthMultiple}× wealth multiple`}
                />
                <ResultCard
                  label="FD Maturity"
                  value={formatINR(result.fdMaturity)}
                  sub={`at ${fdRate}% interest`}
                />
                <ResultCard
                  label="PPF Maturity"
                  value={formatINR(result.ppfMaturity)}
                  sub={`at ${ppfRate}% interest`}
                />
                {inflationMode && realValue !== null && (
                  <ResultCard
                    label={`Real Value (at ${inflation}% inflation)`}
                    value={formatINR(realValue)}
                    sub="Inflation-adjusted"
                  />
                )}
              </div>

              <div className="card p-4 space-y-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 border-emerald-100 dark:border-emerald-800">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    Tax Breakdown (Equity Fund)
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                      <div className="text-[10px] text-slate-500 uppercase">STCG (20%)</div>
                      <div className="font-bold text-slate-700 dark:text-slate-300">{formatINR(taxResult.stcg)}</div>
                    </div>
                    <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                      <div className="text-[10px] text-slate-500 uppercase">LTCG (12.5%)</div>
                      <div className="font-bold text-slate-700 dark:text-slate-300">{formatINR(taxResult.ltcg)}</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    *Assumes 1.25L LTCG exemption. SIPs have split STCG/LTCG. 
                  </p>
                </div>
              </div>

              <div className="card p-4 space-y-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 border-emerald-100 dark:border-emerald-800">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    What this means
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {wealthMultiple}×
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Your money grew {wealthMultiple} times in {years} year
                      {years > 1 ? "s" : ""}.
                    </p>
                  </div>
                </div>
                <div className="border-t border-emerald-200/50 dark:border-emerald-800/50 pt-3">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">
                      Equivalent fixed deposit rate:
                    </span>{" "}
                    <span className="font-bold text-slate-900 dark:text-white">
                      {result.invested > 0
                        ? (
                            (Math.pow(
                              result.maturity / result.invested,
                              1 / years,
                            ) -
                              1) *
                            100
                          ).toFixed(2)
                        : 0}
                      % p.a.
                    </span>
                  </p>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-bold text-slate-900 dark:text-white mb-4">
                  Growth Over Time
                </h2>
                <div className="chart-height-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={result.yearlyData}
                      margin={{ top: 5, right: 5, left: 10, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="investedGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#2563eb"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#2563eb"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                        <linearGradient
                          id="stepUpGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#8b5cf6"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#8b5cf6"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                        <linearGradient
                          id="returnsGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#10b981"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#10b981"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(148,163,184,0.12)"
                      />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `Yr ${v}`}
                        stroke="rgba(148,163,184,0.5)"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        stroke="rgba(148,163,184,0.5)"
                        tickFormatter={(v) => {
                          if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
                          if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
                          return `₹${(v / 1000).toFixed(0)}K`;
                        }}
                        width={65}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="baseInvested"
                        stackId="1"
                        name="Base SIP"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        fill="url(#investedGrad)"
                      />
                      {!isLumpsum && stepUp > 0 && (
                        <Area
                          type="monotone"
                          dataKey="stepUpInvested"
                          stackId="1"
                          name="Step-Up Extra"
                          stroke="#8b5cf6"
                          strokeWidth={2.5}
                          fill="url(#stepUpGrad)"
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="returns"
                        stackId="1"
                        name="Wealth Generated"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fill="url(#returnsGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="ppfValue"
                        name={`PPF (${ppfRate}%)`}
                        stroke="#fca5a5"
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        fill="transparent"
                        fillOpacity={0}
                      />
                      <Area
                        type="monotone"
                        dataKey="fdValue"
                        name={`FD (${fdRate}%)`}
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        fill="transparent"
                        fillOpacity={0}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card overflow-hidden">
                <button
                  onClick={() => setShowTable(!showTable)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/></svg>
                    <span>
                      {showTable
                        ? "Hide Breakdown"
                        : "Show Year-by-Year Breakdown"}
                    </span>
                  </span>
                </button>
                {showTable && (
                  <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-700">
                    <div className="min-w-[500px] max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider shadow-sm">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">
                              Year
                            </th>
                            <th className="px-4 py-3 text-right font-semibold">
                              SIP Amount That Year (₹)
                            </th>
                            <th className="px-4 py-3 text-right font-semibold">
                              Total Invested So Far (₹)
                            </th>
                            <th className="px-4 py-3 text-right font-semibold">
                              Estimated Portfolio Value (₹)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {result.yearlyData.map((row, index) => {
                            const prevInvested =
                              index > 0
                                ? result.yearlyData[index - 1].invested
                                : 0;
                            const yearlyInvested = row.invested - prevInvested;
                            return (
                              <tr
                                key={row.year}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                              >
                                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                                  Yr {row.year}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                  {formatINR(yearlyInvested)}
                                </td>
                                <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                  {formatINR(row.invested)}
                                </td>
                                <td className="px-4 py-2 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                                  {formatINR(row.value)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <strong>Disclaimer:</strong> Estimated returns are based on
                    assumed rates and are not guaranteed. Past performance does
                    not indicate future results. Please consult a
                    SEBI-registered financial advisor before investing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─ SWP ─ */}
        {pageTab === "swp" && (
          <div className="grid lg:grid-cols-[420px,1fr] gap-6">
            <div className="card p-6 space-y-6">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white mb-1">
                  Systematic Withdrawal Plan (SWP)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Calculate how much regular income you can withdraw from your
                  lump sum corpus and how long it will last.
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                  Fund Type (For Exit Load)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Equity", "Equity (1% for <1Yr)"],
                    ["ELSS", "ELSS (0% after 3Yr)"],
                    ["Debt", "Debt / Liquid (0%)"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setSwpFundType(v)}
                      className={`py-2 px-1 text-[10px] font-semibold rounded-xl border transition-all text-center ${swpFundType === v ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <SIPSlider
                id="swp-investment"
                label="Total Investment (Initial Corpus)"
                value={swpInvestment}
                onChange={setSwpInvestment}
                min={50000}
                max={100000000}
                step={50000}
                prefix="₹"
                formatFn={(v) => formatINR(v)}
              />
              <div className="flex flex-wrap gap-2">
                {[500000, 1000000, 5000000, 10000000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setSwpInvestment(preset)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all ${swpInvestment === preset ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                  >
                    {preset >= 10000000
                      ? `₹${preset / 10000000}Cr`
                      : `₹${preset / 100000}L`}
                  </button>
                ))}
              </div>
              <SIPSlider
                id="swp-withdrawal"
                label="Monthly Withdrawal Amount"
                value={swpWithdrawal}
                onChange={setSwpWithdrawal}
                min={1000}
                max={1000000}
                step={1000}
                prefix="₹"
                formatFn={(v) => formatINR(v)}
              />
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                <span className="font-semibold">
                  Recommended monthly withdrawal:{" "}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {formatINR(Math.round(swpInvestment * 0.005))} -{" "}
                  {formatINR(Math.round(swpInvestment * 0.008))}
                </span>{" "}
                (0.5% - 0.8% of corpus)
              </div>
              <SIPSlider
                id="swp-return"
                label="Expected Annual Return"
                value={swpReturn}
                onChange={setSwpReturn}
                min={1}
                max={30}
                step={0.5}
                suffix="%"
              />
              <SIPSlider
                id="swp-years"
                label="Withdrawal Duration"
                value={swpYears}
                onChange={setSwpYears}
                min={1}
                max={40}
                suffix=" yr"
              />
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <ResultCard
                  label="Total Investment"
                  value={formatINR(swpResult.invested)}
                />
                <ResultCard
                  label="Total Withdrawn"
                  value={formatINR(swpResult.totalWithdrawn)}
                />
                <ResultCard
                  label="Final Value (Corpus Remaining)"
                  value={formatINR(swpResult.finalValue)}
                  accent={swpResult.finalValue > 0}
                  sub={
                    swpResult.finalValue === 0
                      ? "Corpus exhausted early"
                      : "Portfolio left"
                  }
                />
                <ResultCard
                  label="Total Returns Earned"
                  value={formatINR(swpResult.totalReturns)}
                  sub="Accrued interest"
                />
                <ResultCard
                  label="Est. Exit Load"
                  value={formatINR(swpResult.totalExitLoad)}
                  sub="Deducted in Year 1"
                />
              </div>

              {swpResult.ranOutYear !== null ? (
                <div className="card p-5 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300">
                  <div className="flex gap-3 items-start">
                    <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <div>
                      <p className="font-bold text-sm">
                        Corpus Exhausted Early!
                      </p>
                      <p className="text-xs mt-1">
                        At your current withdrawal rate, your corpus will last
                        only{" "}
                        <strong className="text-red-700 dark:text-red-400">
                          {swpResult.ranOutYear} Year
                          {swpResult.ranOutYear > 1 ? "s" : ""}
                          {swpResult.ranOutMonth > 0
                            ? ` & ${swpResult.ranOutMonth} Month${swpResult.ranOutMonth > 1 ? "s" : ""}`
                            : ""}
                        </strong>
                        .
                      </p>
                      <p className="text-xs mt-2 text-slate-500 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span>Try lowering monthly withdrawal or a higher return allocation.</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card p-5 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                  <div className="flex gap-3 items-start">
                    <svg className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
                    <div>
                      <p className="font-bold text-sm">
                        Highly Sustainable Plan!
                      </p>
                      <p className="text-xs mt-1">
                        Your corpus lasts the full {swpYears} years and still
                        grows to{" "}
                        <strong>{formatINR(swpResult.finalValue)}</strong>.
                      </p>
                      <p className="text-xs mt-1">
                        Total withdrawn:{" "}
                        <strong>{formatINR(swpResult.totalWithdrawn)}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="card p-5">
                <h3 className="font-bold text-slate-900 dark:text-white mb-4">
                  Portfolio Balance &amp; Total Withdrawals
                </h3>
                <div className="chart-height-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={swpResult.yearlyData}
                      margin={{ top: 5, right: 5, left: 10, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="swpBalanceGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#10b981"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#10b981"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                        <linearGradient
                          id="swpWithdrawnGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#ef4444"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#ef4444"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(148,163,184,0.2)"
                      />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `Yr ${v}`}
                        stroke="rgba(148,163,184,0.5)"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        stroke="rgba(148,163,184,0.5)"
                        tickFormatter={(v) => {
                          if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
                          if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
                          return `₹${(v / 1000).toFixed(0)}K`;
                        }}
                        width={65}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name="Remaining Portfolio Value"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#swpBalanceGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="withdrawn"
                        name="Cumulative Withdrawn"
                        stroke="#ef4444"
                        strokeWidth={2}
                        fill="url(#swpWithdrawnGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card overflow-hidden">
                <button
                  onClick={() => setSwpShowTable(!swpShowTable)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    📋{" "}
                    {swpShowTable
                      ? "Hide SWP Schedule ▲"
                      : "Show SWP Year-by-Year Schedule ▼"}
                  </span>
                </button>
                {swpShowTable && (
                  <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-700">
                    <div className="min-w-[500px] max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider shadow-sm">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">
                              Year
                            </th>
                            <th className="px-4 py-3 text-right font-semibold">
                              Total Withdrawn So Far (₹)
                            </th>
                            <th className="px-4 py-3 text-right font-semibold">
                              Interest Earned So Far (₹)
                            </th>
                            <th className="px-4 py-3 text-right font-semibold text-orange-500/80">
                              Exit Load Deducted (₹)
                            </th>
                            <th className="px-4 py-3 text-right font-semibold">
                              Remaining Balance (₹)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {swpResult.yearlyData.map((row) => (
                            <tr
                              key={row.year}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                            >
                              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                                Yr {row.year}
                              </td>
                              <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                {formatINR(row.withdrawn)}
                              </td>
                              <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                {formatINR(row.returns)}
                              </td>
                              <td className="px-4 py-2 text-right text-orange-600 dark:text-orange-400 tabular-nums font-semibold">
                                {row.exitLoad > 0 ? `-${formatINR(row.exitLoad)}` : "—"}
                              </td>
                              <td
                                className={`px-4 py-2 text-right font-bold tabular-nums ${row.value === 0 ? "text-red-500" : "text-slate-900 dark:text-white"}`}
                              >
                                {formatINR(row.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─ GOAL CALCULATOR ─ */}
        {pageTab === "goal" && (
          <div className="grid lg:grid-cols-[420px,1fr] gap-6">
            <div className="card p-6 space-y-6">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white mb-1">
                  🎯 Goal Calculator
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Find out how much monthly SIP you need to reach your financial
                  goal.
                </p>
              </div>
              <SIPSlider
                id="goal-target"
                label="Target Amount"
                value={goalTarget}
                onChange={setGoalTarget}
                min={100000}
                max={100000000}
                step={100000}
                prefix="₹"
                formatFn={(v) => formatINR(v)}
              />
              <div className="flex flex-wrap gap-2">
                {[500000, 1000000, 5000000, 10000000].map((p) => (
                  <button
                    key={p}
                    onClick={() => setGoalTarget(p)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all ${goalTarget === p ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"}`}
                  >
                    {p >= 10000000 ? `₹${p / 10000000}Cr` : `₹${p / 100000}L`}
                  </button>
                ))}
              </div>
              <SIPSlider
                id="goal-years"
                label="Time Horizon"
                value={goalYears}
                onChange={setGoalYears}
                min={1}
                max={30}
                suffix=" yr"
              />
              <SIPSlider
                id="goal-return"
                label="Expected Annual Return"
                value={goalReturn}
                onChange={setGoalReturn}
                min={1}
                max={30}
                step={0.5}
                suffix="%"
              />
            </div>
            <div className="space-y-5">
              <div className="card p-8 text-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                  Monthly SIP Required
                </p>
                <p className="text-5xl font-black text-blue-600 dark:text-blue-400 tabular-nums">
                  {formatINR(goalSIP)}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  per month for {goalYears} year{goalYears > 1 ? "s" : ""} at{" "}
                  {goalReturn}% p.a.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500 mb-1">Total Invested</p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {formatINR(goalTotal)}
                  </p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-500 mb-1">Gains</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatINR(Math.max(0, goalTarget - goalTotal))}
                  </p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-xs text-slate-400 mb-1">Goal</p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {formatINR(goalTarget)}
                  </p>
                </div>
              </div>
              <div className="card p-4 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                  💡 <strong>Tip:</strong> Even a 10% yearly step-up can
                  significantly reduce the required monthly SIP amount.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─ ELSS TAX SAVER ─ */}
        {pageTab === "elss" && (
          <div className="grid lg:grid-cols-[420px,1fr] gap-6">
            <div className="card p-6 space-y-6">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white mb-1">
                  🧾 ELSS Tax Saver
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ELSS funds qualify for Section 80C deduction (max ₹1.5L).
                  Calculate your tax savings.
                </p>
              </div>
              <SIPSlider
                id="elss-amount"
                label="Annual ELSS Investment"
                value={elssAmount}
                onChange={setElssAmount}
                min={500}
                max={150000}
                step={500}
                prefix="₹"
                formatFn={(v) => formatINR(v)}
              />
              <div>
                <p
                  id="tax-slab-label"
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2"
                >
                  Your Tax Slab
                </p>
                <div
                  className="flex gap-2 flex-wrap"
                  role="radiogroup"
                  aria-labelledby="tax-slab-label"
                >
                  {[5, 10, 15, 20, 25, 30].map((slab) => (
                    <button
                      key={slab}
                      onClick={() => setTaxSlab(slab)}
                      role="radio"
                      aria-checked={taxSlab === slab}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-all ${taxSlab === slab ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900 dark:text-violet-200" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                    >
                      {slab}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="card p-4 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700">
                <p className="text-xs text-amber-800 dark:text-amber-200 font-semibold">
                  ⚠️ Old Tax Regime Only — Section 80C deductions (including
                  ELSS) are{" "}
                  <strong>not available under the New Tax Regime</strong>{" "}
                  (default from FY 2023-24). If you have opted for the new
                  regime, your tax saving from ELSS is ₹0.
                  <a
                    href="https://incometaxindia.gov.in/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline ml-1 text-amber-700 dark:text-amber-300"
                    aria-label="Income Tax India website for regime information"
                  >
                    Learn more →
                  </a>
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-5 text-center border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950">
                  <p className="text-xs text-slate-400 mb-1">Tax Saved</p>
                  <p className="text-3xl font-black text-violet-600 dark:text-violet-400">
                    {formatINR(elssResult.taxSaved)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    at {taxSlab}% slab + 4% cess
                  </p>
                </div>
                <div className="card p-5 text-center">
                  <p className="text-xs text-slate-400 mb-1">80C Eligible</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {formatINR(elssResult.eligible)}
                  </p>
                </div>
                <div className="card p-5 text-center">
                  <p className="text-xs text-slate-400 mb-1">Effective Cost</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatINR(elssResult.effectiveCost)}
                  </p>
                </div>
              </div>
              <div className="card p-5 space-y-3">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                  Why ELSS?
                </h3>
                <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
                  {[
                    [
                      "clock",
                      "Shortest Lock-in",
                      "Only 3 years — vs 5 years for PPF/NSC",
                    ],
                    [
                      "calc",
                      "Equity Returns",
                      "Historically 12–15% CAGR over 10+ years",
                    ],
                    [
                      "elss",
                      "Tax Efficient",
                      "LTCG up to ₹1L is tax-free annually",
                    ],
                    [
                      "swp",
                      "SIP Friendly",
                      "Start with ₹500/month in ELSS funds",
                    ],
                  ].map(([id, title, desc]) => (
                    <div key={title} className="flex gap-2">
                      <span className="flex-shrink-0 mt-0.5">
                        {renderTabIcon(id, "w-4 h-4 text-violet-600 dark:text-violet-400")}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {title}
                        </p>
                        <p>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-4 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <span>Tax savings shown are indicative. Actual savings depend on
                total 80C investments and your income. Consult a CA for precise
                calculations.</span>
              </div>
            </div>
          </div>
        )}

        {/* ─ FIRE CALCULATOR ─ */}
        {pageTab === "fire" &&
          (() => {
            const yearsToFire = Math.max(1, fireRetireAge - fireCurrentAge);
            const ageError = fireRetireAge <= fireCurrentAge;
            const futureMonthlyExpense =
              fireMonthlyExpense *
              Math.pow(1 + fireInflation / 100, yearsToFire);
            const futureAnnualExpense = futureMonthlyExpense * 12;
            const fireCorpus = futureAnnualExpense / (fireWithdrawalRate / 100);
            const r = fireReturnRate / 100 / 12;
            const n = yearsToFire * 12;
            const existingGrowth = fireCurrentCorpus * Math.pow(1 + r, n);
            const remaining = Math.max(0, fireCorpus - existingGrowth);
            const monthlySIP =
              remaining > 0 && r > 0
                ? (remaining * r) / ((Math.pow(1 + r, n) - 1) * (1 + r))
                : remaining / Math.max(n, 1);
            const progress = Math.min(
              100,
              Math.round((fireCurrentCorpus / fireCorpus) * 100),
            );
            const fmt = (v) =>
              v >= 10000000
                ? `₹${(v / 10000000).toFixed(2)} Cr`
                : v >= 100000
                  ? `₹${(v / 100000).toFixed(1)} L`
                  : `₹${Math.round(v).toLocaleString("en-IN")}`;

            const calculateMilestoneAge = (targetPct) => {
              const milestoneTarget = fireCorpus * targetPct;
              if (fireCurrentCorpus >= milestoneTarget)
                return { reached: true, age: fireCurrentAge, years: 0 };
              const S = monthlySIP;
              const rateVal = fireReturnRate / 100 / 12;
              if (rateVal <= 0) {
                const totalSaved = fireCurrentCorpus + S * yearsToFire * 12;
                if (S <= 0 || totalSaved < milestoneTarget)
                  return { reached: false, age: null, years: null };
                const months =
                  S > 0 ? (milestoneTarget - fireCurrentCorpus) / S : Infinity;
                const yrs = months / 12;
                return {
                  reached: false,
                  age: Math.round(fireCurrentAge + yrs),
                  years: parseFloat(yrs.toFixed(1)),
                };
              }
              const annuityFactor = (S * (1 + rateVal)) / rateVal;
              const numerator = milestoneTarget + annuityFactor;
              const denominator = fireCurrentCorpus + annuityFactor;
              if (denominator <= 0 || numerator / denominator <= 0)
                return { reached: false, age: null, years: null };
              const months =
                Math.log(numerator / denominator) / Math.log(1 + rateVal);
              if (!isFinite(months) || months < 0)
                return { reached: false, age: null, years: null };
              const yrs = months / 12;
              return {
                reached: false,
                age: Math.round(fireCurrentAge + yrs),
                years: parseFloat(yrs.toFixed(1)),
              };
            };

            return (
              <div className="space-y-6">
                {ageError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300 font-semibold">
                    ⚠️ Target retire age must be greater than your current age.
                  </div>
                )}
                <div className="card p-5 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40 border-orange-100 dark:border-orange-900/50">
                  <h2 className="font-bold text-orange-800 dark:text-orange-300 text-base mb-1 flex items-center gap-2">
                    <span>🔥</span> Financial Independence, Retire Early (FIRE)
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    FIRE is the state where your accumulated investments yield
                    returns that fully cover your cost of living. Under the
                    classic{" "}
                    <strong className="text-orange-700 dark:text-orange-400">
                      4% Rule
                    </strong>
                    , saving 25 times your annual expenses allows you to live
                    off returns indefinitely.
                  </p>
                </div>

                <div className="grid lg:grid-cols-[400px,1fr] gap-6">
                  {/* Inputs */}
                  <div className="card p-5 space-y-6 border-slate-100 dark:border-slate-800">
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        Your FIRE Parameters
                      </h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        Adjust inputs or click on any number to type custom
                        values.
                      </p>
                    </div>
                    <SIPSlider
                      accent="orange"
                      id="fire-monthly-expense"
                      label="Current Monthly Expenses"
                      value={fireMonthlyExpense}
                      onChange={setFireMonthlyExpense}
                      min={5000}
                      max={1000000}
                      step={1000}
                      prefix="₹"
                      formatFn={(v) => formatINR(v)}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <SIPSlider
                        accent="orange"
                        id="fire-current-age"
                        label="Current Age"
                        value={fireCurrentAge}
                        onChange={setFireCurrentAge}
                        min={15}
                        max={75}
                        suffix=" yrs"
                      />
                      <SIPSlider
                        accent="orange"
                        id="fire-retire-age"
                        label="Target Retire Age"
                        value={fireRetireAge}
                        onChange={setFireRetireAge}
                        min={20}
                        max={85}
                        suffix=" yrs"
                      />
                    </div>
                    <SIPSlider
                      accent="orange"
                      id="fire-corpus"
                      label="Current Saved Corpus"
                      value={fireCurrentCorpus}
                      onChange={setFireCurrentCorpus}
                      min={0}
                      max={100000000}
                      step={10000}
                      prefix="₹"
                      formatFn={(v) => formatINR(v)}
                    />
                    <SIPSlider
                      accent="orange"
                      id="fire-return-rate"
                      label="Expected Annual Return"
                      value={fireReturnRate}
                      onChange={setFireReturnRate}
                      min={4}
                      max={25}
                      step={0.5}
                      suffix="%"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <SIPSlider
                        accent="orange"
                        id="fire-withdrawal-rate"
                        label="Safe Withdrawal Rate"
                        value={fireWithdrawalRate}
                        onChange={setFireWithdrawalRate}
                        min={1}
                        max={10}
                        step={0.1}
                        suffix="%"
                      />
                      <SIPSlider
                        accent="orange"
                        id="fire-inflation"
                        label="Expected Inflation"
                        value={fireInflation}
                        onChange={setFireInflation}
                        min={1}
                        max={15}
                        step={0.5}
                        suffix="%"
                      />
                    </div>
                  </div>

                  {/* Outputs */}
                  <div className="space-y-5">
                    <div className="card p-6 bg-gradient-to-br from-orange-500 to-red-600 text-white border-none shadow-lg relative overflow-hidden">
                      <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                      <div className="absolute left-1/3 top-2 w-16 h-16 bg-white/5 rounded-full blur-lg" />
                      <p className="text-[10px] tracking-widest font-black uppercase text-orange-100">
                        🔥 Your FIRE Target Number
                      </p>
                      <p className="text-4xl font-extrabold mt-1 tracking-tight tabular-nums">
                        {fmt(fireCorpus)}
                      </p>
                      <p className="text-xs text-orange-50 font-medium mt-2 leading-relaxed">
                        Inflation-adjusted corpus required to sustain{" "}
                        {fmt(futureMonthlyExpense)}/month at age {fireRetireAge}{" "}
                        under a {fireWithdrawalRate}% safe withdrawal rate.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        [
                          "Time Remaining",
                          `${yearsToFire} years`,
                          `Age ${fireCurrentAge} to ${fireRetireAge}`,
                          "",
                        ],
                        [
                          "Monthly SIP Needed",
                          fmt(monthlySIP),
                          "To reach target",
                          "text-emerald-600 dark:text-emerald-400 font-bold",
                        ],
                        [
                          "Future Monthly Spend",
                          fmt(futureMonthlyExpense),
                          `Adjusted for ${fireInflation}% inflation`,
                          "",
                        ],
                        [
                          "Saved Growth Value",
                          fmt(existingGrowth),
                          "Current corpus compounded",
                          "text-blue-600 dark:text-blue-400 font-bold",
                        ],
                      ].map(([label, value, desc, extraClass]) => (
                        <div
                          key={label}
                          className="card p-4 text-center bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 flex flex-col justify-between"
                        >
                          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                            {label}
                          </p>
                          <p
                            className={`text-base font-extrabold ${extraClass || "text-slate-900 dark:text-white"}`}
                          >
                            {value}
                          </p>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">
                            {desc}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="card p-5 border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          FIRE Completion Progress
                        </span>
                        <span className="text-xs font-extrabold text-orange-600 dark:text-orange-400">
                          {progress}%
                        </span>
                      </div>
                      <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
                        <span>Currently Saved: {fmt(fireCurrentCorpus)}</span>
                        <span>Target: {fmt(fireCorpus)}</span>
                      </div>
                    </div>

                    {/* Interactive horizontal timeline tracker */}
                    <div className="card p-6 border-slate-100 dark:border-slate-800 relative overflow-hidden">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-6 flex items-center gap-1.5">
                        <span>🚀</span> Interactive FIRE Journey Timeline
                      </h4>
                      <div className="relative pt-6 pb-2 px-2">
                        {/* Connecting Track Line */}
                        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 via-amber-400 to-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        {/* Nodes along the track */}
                        <div className="relative flex justify-between">
                          {[
                            { pct: 0.25, name: "¼ Coast FIRE", label: "25%" },
                            { pct: 0.5, name: "½ Half FIRE", label: "50%" },
                            { pct: 0.75, name: "¾ Lean FIRE", label: "75%" },
                            { pct: 1.0, name: "Full FIRE", label: "100%" }
                          ].map((node) => {
                            const milestoneTarget = fireCorpus * node.pct;
                            const isCompleted = fireCurrentCorpus >= milestoneTarget;
                            const est = calculateMilestoneAge(node.pct);

                            return (
                              <div
                                key={node.pct}
                                className="flex flex-col items-center group relative"
                                style={{ transform: "translateY(-16px)" }}
                              >
                                {/* Node Bullet */}
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] z-10 border-4 transition-all duration-300 cursor-help ${
                                    isCompleted
                                      ? "bg-emerald-500 text-white border-emerald-100 dark:border-emerald-950/80 hover:scale-110"
                                      : "bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:scale-110"
                                  }`}
                                >
                                  {isCompleted ? "✓" : node.label}
                                </div>
                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-2 text-center">
                                  {node.name}
                                </span>
                                <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 text-center">
                                  {isCompleted ? "Cleared!" : est.age ? `Age ${est.age}` : "—"}
                                </span>

                                {/* Popover Tooltip */}
                                <div className="absolute bottom-full mb-3 hidden group-hover:block z-40 bg-slate-950 text-white text-[10px] p-2.5 rounded-xl shadow-2xl w-44 text-center pointer-events-none border border-slate-800">
                                  <p className="font-extrabold text-orange-400 mb-1">{node.name}</p>
                                  <p className="text-slate-400 border-b border-slate-800 pb-1 mb-1 font-mono">Target: {fmt(milestoneTarget)}</p>
                                  {isCompleted ? (
                                    <p className="text-emerald-400 font-bold">✓ Already Achieved!</p>
                                  ) : (
                                    <>
                                      <p className="text-slate-300">Est. Age: <strong className="text-white">{est.age ?? "N/A"}</strong></p>
                                      <p className="text-slate-300">Time: <strong className="text-white">{est.years ?? "N/A"} yrs</strong></p>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="card p-5 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10">
                      <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-wider">
                        💡 FIRE Variations Guide
                      </h4>
                      <div className="grid sm:grid-cols-3 gap-3 text-xs">
                        {[
                          [
                            "Lean FIRE",
                            "orange",
                            "Retiring on a highly frugal budget that covers only basic survival expenses.",
                          ],
                          [
                            "Coast FIRE",
                            "blue",
                            "Having enough invested early so it will grow to Full FIRE by standard retirement age without further savings.",
                          ],
                          [
                            "Fat FIRE",
                            "purple",
                            "Retiring with an abundant budget allowing for premium healthcare, travel, and luxury living.",
                          ],
                        ].map(([title, color, desc]) => (
                          <div
                            key={title}
                            className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800/80"
                          >
                            <p
                              className={`font-bold text-xs text-${color}-600 dark:text-${color}-400`}
                            >
                              {title}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {desc}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* ─ TAX P&L CALCULATOR ─ */}
        {pageTab === "tax" &&
          (() => {
            const buyD = new Date(taxBuyDate);
            const sellD = new Date(taxSellDate);
            const holdingDays = Math.max(0, Math.round((sellD - buyD) / 86400000));
            const holdingMonths = holdingDays / 30.44;
            const totalInvested = taxIsSIP 
              ? taxBuyAmount * Math.max(1, Math.floor(holdingMonths))
              : taxBuyAmount;
            const gain = taxSellAmount - totalInvested;

            // ✅ Config-driven: picks the right budget year automatically
            const result = buildTaxResult({
              fundType: taxFundType,
              gain,
              holdingMonths,
              taxSlab,
              sellDate: taxSellDate,
              buyDate: taxBuyDate,
              buyAmount: taxBuyAmount,
              sellAmount: taxSellAmount,
              isSIP: taxIsSIP,
            });
            const { taxType, taxAmount, fyLabel, rulesNote, steps, pillColor } =
              result;
            const netInHand = taxSellAmount - Math.round(taxAmount);
            const isEquity = taxFundType === "equity";
            const getSafeThresholdDate = (dateStr) => {
              const d = new Date(dateStr);
              if (isNaN(d.getTime())) return "N/A";
              d.setFullYear(d.getFullYear() + 1);
              return d.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
            };

            return (
              <div className="grid lg:grid-cols-[380px,1fr] gap-6">
                {/* ── Left: Inputs ── */}
                <div className="card p-6 space-y-5">
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white mb-1">
                      🏛️ Tax P&L Calculator
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Auto-detects correct tax rules from your sell date. Rules
                      update when new budget comes.
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Fund Type
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["equity", "📈 Equity / ELSS / Index"],
                        ["Debt", "🏦 Debt / Liquid (Post-Apr'23)"],
                        ["Debt_Pre2023", "🏛️ Debt (Bought Pre-Apr'23)"],
                        ["Gold/Intl", "🌍 Gold / International"],
                      ].map(([v, l]) => (
                        <button
                          key={v}
                          onClick={() => setTaxFundType(v)}
                          className={`flex-1 py-2 px-1 text-[11px] font-semibold rounded-xl border transition-all text-center ${taxFundType === v ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Investment Type
                    </p>
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 w-full">
                      <button
                        onClick={() => setTaxIsSIP(false)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${!taxIsSIP ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
                      >
                        Lumpsum
                      </button>
                      <button
                        onClick={() => setTaxIsSIP(true)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${taxIsSIP ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
                      >
                        SIP
                      </button>
                    </div>
                  </div>

                  <SIPSlider
                    id="tax-buy-amount"
                    label={taxIsSIP ? "Monthly SIP Amount" : "Amount Invested (Buy Value)"}
                    value={taxBuyAmount}
                    onChange={setTaxBuyAmount}
                    min={1000}
                    max={10000000}
                    step={1000}
                    prefix="₹"
                    formatFn={formatINR}
                  />
                  <SIPSlider
                    id="tax-sell-amount"
                    label={taxIsSIP ? "Final Value (Sell Amount)" : "Amount Received (Sell Value)"}
                    value={taxSellAmount}
                    onChange={setTaxSellAmount}
                    min={1000}
                    max={10000000}
                    step={1000}
                    prefix="₹"
                    formatFn={formatINR}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="tax-buy-date"
                        className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1"
                      >
                        {taxIsSIP ? "SIP Start Date" : "Buy Date"}
                      </label>
                      <input
                        id="tax-buy-date"
                        type="date"
                        value={taxBuyDate}
                        onChange={(e) => setTaxBuyDate(e.target.value)}
                        className="input-base py-2 text-sm w-full"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="tax-sell-date"
                        className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1"
                      >
                        Sell Date
                      </label>
                      <input
                        id="tax-sell-date"
                        type="date"
                        value={taxSellDate}
                        onChange={(e) => setTaxSellDate(e.target.value)}
                        className="input-base py-2 text-sm w-full"
                      />
                    </div>
                  </div>

                  {!isEquity && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                        Your Income Tax Slab
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {[5, 10, 20, 30].map((s) => (
                          <button
                            key={s}
                            onClick={() => setTaxSlab(s)}
                            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${taxSlab === s ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200" : "border-slate-200 dark:border-slate-600 text-slate-500"}`}
                          >
                            {s}%
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Choose the slab matching your total annual income.
                      </p>
                    </div>
                  )}

                  {/* Auto-detected FY badge */}
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                    <span className="text-lg">🗓️</span>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Rules Auto-Applied
                      </p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {fyLabel}
                      </p>
                      <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">
                        {rulesNote}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Right: Results ── */}
                <div className="space-y-4">
                  {/* Gain / Loss hero */}
                  <div
                    className={`card p-6 border-2 ${gain >= 0 ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40" : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40"}`}
                  >
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Total Gain / Loss
                        </p>
                        <p
                          className={`text-4xl font-black tabular-nums ${gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {gain >= 0 ? "+" : ""}
                          {formatINR(gain)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Held{" "}
                          <strong className="text-slate-800 dark:text-slate-200">
                            {holdingDays} days
                          </strong>{" "}
                          ({(holdingMonths / 12).toFixed(1)} yrs)
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1.5 rounded-full ${pillColor}`}
                      >
                        {taxType}
                      </span>
                    </div>
                  </div>

                  {/* 3 stat cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="card p-4 text-center">
                      <p className="text-[10px] text-slate-500 mb-1">
                        Tax Type
                      </p>
                      <p className="font-bold text-xs text-slate-900 dark:text-white leading-snug">
                        {taxType}
                      </p>
                    </div>
                    <div className="card p-4 text-center bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900">
                      <p className="text-[10px] text-slate-500 mb-1">
                        Tax Payable
                      </p>
                      <p className="font-bold text-sm text-red-600 dark:text-red-400">
                        {formatINR(Math.round(taxAmount))}
                      </p>
                    </div>
                    <div className="card p-4 text-center bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900">
                      <p className="text-[10px] text-slate-500 mb-1">
                        Net in Hand
                      </p>
                      <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        {formatINR(netInHand)}
                      </p>
                    </div>
                  </div>

                  {/* 💡 Tax Harvesting Opportunity Planner */}
                  {isEquity && (
                    <div className="card p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-100 dark:border-blue-900/40 space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">💡</span>
                        <div>
                          <h4 className="font-bold text-sm text-slate-800 dark:text-white">
                            Tax Harvesting Planner
                          </h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            Legally reduce your mutual fund tax liability to ₹0 using the annual ₹1.25L exemption.
                          </p>
                        </div>
                      </div>

                      {holdingMonths >= 12 ? (
                        <div className="space-y-3 text-xs">
                          <div className="bg-white/80 dark:bg-slate-800/80 p-3.5 rounded-xl border border-blue-200/40 dark:border-blue-900/40">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Unused Annual LTCG Exemption</p>
                            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                              {formatINR(Math.max(0, 125000 - gain))}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                              Since your gain is {formatINR(gain)} (below the annual ₹1,25,000 tax-free limit), you pay **₹0 tax** on this transaction!
                            </p>
                          </div>
                          
                          <div className="space-y-2">
                            <p className="font-bold text-slate-700 dark:text-slate-300">How to Harvest & Save:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] leading-relaxed">
                              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
                                <span className="font-bold text-indigo-600">Step 1: Sell</span>
                                <p className="text-slate-500 mt-1">Redeem your units worth {formatINR(taxSellAmount)} to officially lock in the {formatINR(gain)} profit tax-free.</p>
                              </div>
                              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
                                <span className="font-bold text-indigo-600">Step 2: Re-invest</span>
                                <p className="text-slate-500 mt-1">Re-purchase the same fund immediately. Your new buy price resets to today&apos;s higher NAV.</p>
                              </div>
                              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
                                <span className="font-bold text-emerald-600">Result: Save Tax</span>
                                <p className="text-slate-500 mt-1">Future tax is only calculated on gains *above* today&apos;s price, saving you up to 12.5% in taxes!</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 text-xs">
                          <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl text-amber-800 dark:text-amber-300">
                            <p className="font-bold mb-1">⚠️ Currently in STCG (Held only {Math.round(holdingMonths)} months)</p>
                            <p className="text-[10px] leading-relaxed">
                              Short-Term Capital Gains are taxed at a flat **20%** with **no exemptions**. If you sell today, you will pay a tax of **{formatINR(taxAmount)}**!
                            </p>
                          </div>
                          
                          {holdingMonths < 12 && (
                            <div className="p-3 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-blue-200/20 dark:border-blue-900/20 text-[10px] leading-relaxed">
                              <p className="font-bold text-indigo-600 dark:text-indigo-400">💡 Smart Advice:</p>
                              <p className="text-slate-500 mt-0.5">
                                Hold these units for another **{Math.ceil(12 - holdingMonths)} months** (until {getSafeThresholdDate(taxBuyDate)}). 
                                Once they qualify for LTCG, your tax rate drops from 20% to 12.5% — and you can use the ₹1.25L annual tax-free harvesting limit!
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Step-by-step plain English explanation */}
                  <div className="card p-4 space-y-3">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">
                      Why this tax? (Simple explanation)
                    </p>
                    {steps.map((step, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-base flex-shrink-0">
                          {renderStepIcon(step.icon, "w-4 h-4 text-blue-600 dark:text-blue-400")}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-0.5">
                            {step.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            {step.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tax summary table */}
                  <div className="card p-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                      Complete Tax Breakdown
                    </p>
                    {[
                      ["Amount Invested", formatINR(taxBuyAmount)],
                      ["Amount Received", formatINR(taxSellAmount)],
                      ["Gross Gain / Loss", formatINR(gain)],
                      ["Tax Payable", formatINR(Math.round(taxAmount))],
                      ["+ 4% Cess", formatINR(Math.round(taxAmount * 0.04))],
                      ["Total Tax", formatINR(Math.round(taxAmount * 1.04))],
                      [
                        "Net in Hand",
                        formatINR(taxSellAmount - Math.round(taxAmount * 1.04)),
                      ],
                    ].map(([l, v]) => (
                      <div
                        key={l}
                        className="flex justify-between border-b border-slate-100 dark:border-slate-700 pb-1.5 last:border-0 last:font-bold last:text-slate-900 last:dark:text-white"
                      >
                        <span>{l}</span>
                        <span className="font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="card p-3 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    ⚠️ Indicative only. Consult a CA for exact tax liability.
                    This tool auto-updates rules from the{" "}
                    <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">
                      TAX_RULES
                    </code>{" "}
                    config — to add new budget rates, update the config in the
                    source file.
                  </div>
                </div>
              </div>
            );
          })()}

        {/* ─ SIP DATE OPTIMIZER ─ */}
        {pageTab === "date" && (
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="font-bold text-slate-900 dark:text-white mb-1">
                📅 SIP Date Optimizer
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                See which SIP date historically gave the best XIRR for your
                chosen fund.
              </p>
            </div>
            <div className="grid lg:grid-cols-[380px,1fr] gap-6">
              <div className="card p-6 space-y-5">
                <div className="relative">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                    Select Fund
                  </label>
                  <input
                    type="text"
                    value={dateQuery}
                    onChange={(e) => {
                      setDateQuery(e.target.value);
                      setDateSearchOpen(true);
                    }}
                    onFocus={() => setDateSearchOpen(true)}
                    placeholder="Search by fund name or code..."
                    className="input-base w-full text-sm py-2.5"
                  />
                  {dateSearchOpen && dateFundSearch.length > 0 && (
                    <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-h-52 overflow-y-auto">
                      {dateFundSearch.map((f) => (
                        <button
                          key={f.schemeCode}
                          type="button"
                          onClick={() => handleDateFundSelect(f)}
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors"
                        >
                          <span className="font-medium text-slate-900 dark:text-white line-clamp-1">
                            {f.schemeName}
                          </span>
                          <span className="text-slate-500 ml-2">
                            #{f.schemeCode}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <SIPSlider
                  id="date-sip-amount"
                  label="Monthly SIP Amount"
                  value={dateSipAmount}
                  onChange={setDateSipAmount}
                  min={100}
                  max={100000}
                  step={100}
                  prefix="₹"
                  formatFn={formatINR}
                />
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    SIP Duration
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 3, 5, 7, 10].map((y) => (
                      <button
                        key={y}
                        onClick={() => setDateSipYears(y)}
                        className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${dateSipYears === y ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 dark:border-slate-600 text-slate-500"}`}
                      >
                        {y}Y
                      </button>
                    ))}
                  </div>
                </div>
                {dateFundLoading && (
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
                    Loading NAV data…
                  </div>
                )}
                {selectedDateFund && !dateFundLoading && (
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 text-xs">
                    <p className="font-bold text-slate-800 dark:text-slate-200 line-clamp-2">
                      {selectedDateFund.schemeName}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      #{selectedDateFund.schemeCode}
                    </p>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                {!selectedDateFund && (
                  <div className="card p-12 text-center">
                    <div className="text-4xl mb-3">📅</div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Search for a fund to get started
                    </p>
                    <p className="text-xs text-slate-400">
                      We&apos;ll simulate your SIP on each date 1–28 using actual NAV
                      history.
                    </p>
                  </div>
                )}
                {selectedDateFund &&
                  !dateFundLoading &&
                  dateOptimizerResults.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="card p-4 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-center">
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold mb-1">
                            🏆 Best SIP Date
                          </p>
                          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                            {bestDateResult ? `${bestDateResult.date}th` : "—"}
                          </p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                            {bestDateResult?.xirr != null
                              ? `Est. XIRR: ${bestDateResult.xirr.toFixed(2)}%`
                              : ""}
                          </p>
                        </div>
                        <div className="card p-4 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-center">
                          <p className="text-[10px] text-red-700 dark:text-red-300 font-bold mb-1">
                            📉 Worst SIP Date
                          </p>
                          <p className="text-3xl font-black text-red-600 dark:text-red-400">
                            {worstDateResult
                              ? `${worstDateResult.date}th`
                              : "—"}
                          </p>
                          <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                            {worstDateResult?.xirr != null
                              ? `Est. XIRR: ${worstDateResult.xirr.toFixed(2)}%`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="card p-5">
                        <p className="font-bold text-slate-900 dark:text-white text-sm mb-3 flex items-center gap-1.5">
                          <span>📊</span> Interactive SIP Date Performance Heatmap
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-4 leading-relaxed">
                          Hover over any date to see the simulated investment value, total money invested, and exact annualized return (XIRR).
                        </p>
                        
                        <div className="grid grid-cols-7 gap-2">
                          {dateOptimizerResults.map((r) => {
                            const allXirr = dateOptimizerResults.map((x) => x.xirr ?? 0);
                            const minX = Math.min(...allXirr);
                            const maxX = Math.max(...allXirr);
                            const val = r.xirr ?? 0;
                            const range = maxX - minX;
                            const weight = range > 0 ? (val - minX) / range : 0.5;
                            
                            let bgClass = "bg-slate-50 dark:bg-slate-800/40 text-slate-500";
                            let borderClass = "border-slate-100 dark:border-slate-800/80";
                            
                            if (r.date === bestDateResult?.date) {
                              bgClass = "bg-emerald-500 text-white shadow-md shadow-emerald-500/10";
                              borderClass = "border-emerald-600";
                            } else if (r.date === worstDateResult?.date) {
                              bgClass = "bg-red-500 text-white shadow-md shadow-red-500/10";
                              borderClass = "border-red-600";
                            } else if (weight > 0.75) {
                              bgClass = "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300";
                              borderClass = "border-emerald-200/60 dark:border-emerald-900/40";
                            } else if (weight > 0.45) {
                              bgClass = "bg-blue-50/70 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300";
                              borderClass = "border-blue-100 dark:border-blue-900/30";
                            } else {
                              bgClass = "bg-amber-50/60 dark:bg-amber-950/10 text-amber-800 dark:text-amber-400";
                              borderClass = "border-amber-100 dark:border-amber-900/20";
                            }

                            return (
                              <div
                                key={r.date}
                                className={`p-2 rounded-xl border flex flex-col items-center justify-between min-h-[60px] transition-all duration-150 hover:scale-105 hover:shadow-sm group relative cursor-help ${bgClass} ${borderClass}`}
                              >
                                <span className="text-[11px] font-black">{r.date}</span>
                                <span className="text-[9px] font-bold mt-1 tracking-tight">
                                  {r.xirr != null ? `${r.xirr.toFixed(1)}%` : "N/A"}
                                </span>
                                
                                {/* Popover Tooltip */}
                                <div className="absolute bottom-full mb-2 hidden group-hover:block z-40 bg-slate-900 dark:bg-slate-950 text-white text-[10px] p-2.5 rounded-xl shadow-2xl w-36 text-center pointer-events-none border border-slate-800">
                                  <p className="font-extrabold text-blue-400 mb-1 border-b border-slate-800 pb-1">Day {r.date} Simulation</p>
                                  <p className="text-slate-400">Invested: {formatINR(r.invested)}</p>
                                  <p className="text-slate-400">Value: {formatINR(Math.round(r.currentValue))}</p>
                                  <p className="text-emerald-400 font-black mt-1">XIRR: {r.xirr?.toFixed(2)}%</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        <div className="flex flex-wrap gap-3 mt-4 text-[10px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
                            🏆 Best Date
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 inline-block" />
                            High Yield
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-100 inline-block" />
                            Average Yield
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-100 inline-block" />
                            Lower Yield
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" />
                            📉 Worst Date
                          </span>
                        </div>
                      </div>
                      <div className="card p-3 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-[10px] text-amber-700 dark:text-amber-300">
                        ⚠️ Results are historical simulations. SIP date impact
                        is typically small (&lt;0.5% XIRR difference). Choose a
                        date convenient for your cash flow.
                      </div>
                    </>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
