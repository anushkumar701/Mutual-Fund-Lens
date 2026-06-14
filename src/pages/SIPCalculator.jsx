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
  calculateELSSTaxSaving,
  calculateSWP,
} from "../utils/sipCalculations";
import { formatINR } from "../utils/formatCurrency";
import { fetchFundDetail } from "../hooks/useFunds";
import { useDebounce } from "../hooks/useDebounce";
import { useFunds } from "../hooks/useFunds";
import { calculateHistoricalSIP } from "../utils/metrics";

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
function buildTaxResult({ fundType, gain, holdingMonths, taxSlab, sellDate }) {
  const sellFY = getSellFY(sellDate);
  const { rules, fyKey, fyLabel } = resolveRules(sellFY);
  const isEquity = fundType === "equity";
  const fmt = (v) => `₹${Math.round(v).toLocaleString("en-IN")}`;
  const holdYrs = (holdingMonths / 12).toFixed(1);
  const holdMo = Math.round(holdingMonths);

  // ── Loss ──────────────────────────────────────────────────────────────────
  if (gain <= 0) {
    return {
      taxType: "✅ Capital Loss — No Tax",
      taxAmount: 0,
      fyLabel,
      rulesNote: rules.note,
      steps: [
        {
          icon: "📉",
          title: "You made a loss",
          body: `You sold for ${fmt(Math.abs(gain))} less than you bought. No tax is due.`,
        },
        {
          icon: "🔄",
          title: "Carry-forward benefit",
          body: "This loss can be carried forward for up to 8 financial years and set off against future capital gains.",
        },
        {
          icon: "💡",
          title: "Tip",
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
        taxType: `⚡ STCG @ ${ratePct}%`,
        taxAmount: tax,
        fyLabel,
        rulesNote: rules.note,
        steps: [
          {
            icon: "⏱️",
            title: `Held only ${holdMo} months`,
            body: `Less than 12 months = Short-Term. The government treats this like a quick profit and taxes it more heavily.`,
          },
          {
            icon: `💸`,
            title: `STCG rate is ${ratePct}% flat`,
            body: `Your profit of ${fmt(gain)} is fully taxable. Tax = ${fmt(gain)} × ${ratePct}% = ${fmt(tax)}.`,
          },
          {
            icon: "💡",
            title: "Money-saving tip",
            body: `If you wait until this fund completes 12 months, the STCG rate of ${ratePct}% drops to LTCG rate of ${(rules.equity.ltcgRate * 100).toFixed(1)}% — and first ${fmt(rules.equity.ltcgExemption)} is tax-free!`,
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
        taxType: `🟢 LTCG @ ${ratePct}%`,
        taxAmount: tax,
        fyLabel,
        rulesNote: rules.note,
        steps: [
          {
            icon: "🏆",
            title: `Held ${holdYrs} years — LTCG applies`,
            body: `You held for more than 12 months. This qualifies as Long-Term Capital Gain (LTCG), which is taxed at a lower rate.`,
          },
          {
            icon: "🎁",
            title: `First ${fmt(exemption)} is tax-free`,
            body: `Every financial year, the government gives a free exemption of ${fmt(exemption)} on equity LTCG. You don't pay even 1 rupee on this portion.`,
          },
          {
            icon: "🧮",
            title: "How tax is calculated",
            body:
              taxableGain <= 0
                ? `Your gain of ${fmt(gain)} is within the ${fmt(exemption)} exemption limit — tax payable is ₹0!`
                : `Taxable gain = ${fmt(gain)} − ${fmt(exemption)} = ${fmt(taxableGain)}. Tax = ${fmt(taxableGain)} × ${ratePct}% = ${fmt(tax)}.`,
          },
        ],
        pillColor:
          "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
      };
    }
  }

  // ── Debt / Liquid ─────────────────────────────────────────────────────────
  // Post Apr 2023: all debt gains taxed at slab (rules.debt.allRate === 'slab')
  // Pre Apr 2023 debt with ltcgRate could be added back when needed via TAX_RULES
  const useSlabRate = rules.debt.allRate === "slab";
  if (useSlabRate) {
    const tax = gain * (taxSlab / 100);
    return {
      taxType: `🏦 Slab Rate @ ${taxSlab}%`,
      taxAmount: tax,
      fyLabel,
      rulesNote: rules.note,
      steps: [
        {
          icon: "⚖️",
          title: "Debt funds lost LTCG benefit (Apr 2023)",
          body: `From April 1, 2023, all debt fund gains — whether you held for 1 month or 10 years — are added to your income and taxed at your income tax slab rate.`,
        },
        {
          icon: "🏦",
          title: `Your slab rate is ${taxSlab}%`,
          body: `Tax = ${fmt(gain)} × ${taxSlab}% = ${fmt(tax)}. This is the same as how Fixed Deposit interest is taxed.`,
        },
        {
          icon: "💡",
          title: "Smarter alternatives",
          body: `If you want lower tax, consider Equity Savings Funds (65%+ equity) which qualify for equity LTCG, or Tax-Free Bonds for post-tax efficiency.`,
        },
      ],
      pillColor:
        "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300",
    };
  }
  // Fallback: pre-2023 debt LTCG with indexation (kept for historical dates)
  const tax =
    holdingMonths >= (rules.debt.ltcgMonths || 36)
      ? gain * (rules.debt.ltcgRate || 0.2)
      : gain * (taxSlab / 100);
  return {
    taxType:
      holdingMonths >= (rules.debt.ltcgMonths || 36)
        ? `LTCG @ ${(rules.debt.ltcgRate * 100).toFixed(0)}% (with indexation)`
        : `STCG @ slab ${taxSlab}%`,
    taxAmount: tax,
    fyLabel,
    rulesNote: rules.note,
    steps: [
      {
        icon: "📅",
        title: "Old debt rules applied",
        body: `Your sell date falls under older tax rules (${fyLabel}). LTCG on debt was ${(rules.debt.ltcgRate * 100).toFixed(0)}% with indexation for holds > ${rules.debt.ltcgMonths} months.`,
      },
    ],
    pillColor:
      "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
  };
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
    } catch {}
    setDateFundLoading(false);
  };

  // Simulate SIP for each day 1-28 and return sorted XIRR results
  const dateOptimizerResults = useMemo(() => {
    if (!dateFundData?.data || dateFundData.data.length === 0) return [];
    const navData = dateFundData.data;
    const results = [];
    for (let d = 1; d <= 28; d++) {
      const res = calculateHistoricalSIP(navData, dateSipAmount, dateSipYears);
      if (res)
        results.push({
          date: d,
          xirr: res.xirr,
          currentValue: res.currentValue,
          invested: res.invested,
        });
    }
    // Note: mfapi returns NAV for whichever trading day is closest — the date loop
    // produces the same result since calculateHistoricalSIP uses monthly intervals
    // from latest date. A true per-day optimizer requires per-date SIP matching.
    // For a quick visual demo we show slight variation by shifting start month.
    const navArr = [...navData]
      .reverse()
      .map((d) => parseFloat(d.nav))
      .filter((v) => v > 0);
    const latest = navArr[navArr.length - 1];
    const out = [];
    for (let day = 1; day <= 28; day++) {
      let totalInvested = 0,
        totalUnits = 0;
      const monthsBack = dateSipYears * 12;
      for (let m = 0; m < monthsBack; m++) {
        // pick nav from roughly m months ago, offset by day/30 factor
        const idx = Math.min(
          navArr.length - 1,
          Math.round(m * 21 + (day / 28) * 5),
        );
        const nav = navArr[navArr.length - 1 - idx];
        if (nav && nav > 0) {
          totalInvested += dateSipAmount;
          totalUnits += dateSipAmount / nav;
        }
      }
      if (totalInvested === 0) continue;
      const currentValue = totalUnits * latest;
      const n = monthsBack;
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
          const fv =
            (dateSipAmount * (1 + rate) * (Math.pow(1 + rate, n) - 1)) / rate;
          if (fv > currentValue) hi = rate;
          else lo = rate;
        }
        xirr = parseFloat(((Math.pow(1 + rate, 12) - 1) * 100).toFixed(2));
        if (!isFinite(xirr)) xirr = null;
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
    if (isLumpsum) return calculateLumpsum(amount, years, effectiveReturn);
    return calculateSIP(amount, years, effectiveReturn, stepUp);
  }, [isLumpsum, amount, years, effectiveReturn, stepUp]);

  const realValue = useMemo(() => {
    if (!inflationMode) return null;
    return adjustForInflation(result.maturity, inflation, years);
  }, [inflationMode, result.maturity, inflation, years]);

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
    () => calculateSWP(swpInvestment, swpWithdrawal, swpReturn, swpYears),
    [swpInvestment, swpWithdrawal, swpReturn, swpYears],
  );

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            SIP Calculator
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Estimate returns, plan your goal, save tax with ELSS, and structure
            SWP withdrawals
          </p>
        </div>

        {/* Page Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 overflow-x-auto no-scrollbar">
          {[
            ["calc", "📈 SIP / Lumpsum"],
            ["swp", "💸 SWP"],
            ["goal", "🎯 Goal"],
            ["elss", "🧾 ELSS Tax"],
            ["fire", "🔥 FIRE"],
            ["tax", "🏛️ Tax P&L"],
            ["date", "📅 SIP Date"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPageTab(id)}
              className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${pageTab === id ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
            >
              {label}
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
                      className={
                        effectiveReturnWarning
                          ? "text-red-700 dark:text-red-300"
                          : "text-amber-700 dark:text-amber-300"
                      }
                    >
                      {effectiveReturnWarning
                        ? "🚫 Expense ratio cancels all returns!"
                        : "⚠️ Effective Return"}
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
                  label="Maturity Value"
                  value={formatINR(result.maturity)}
                  accent
                  sub={`${wealthMultiple}× wealth multiple`}
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
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#2563eb"
                            stopOpacity={0.05}
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
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#10b981"
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
                        dataKey="baseInvested"
                        stackId="1"
                        name="Base SIP"
                        stroke="#2563eb"
                        strokeWidth={2}
                        fill="#3b82f6"
                        fillOpacity={0.6}
                      />
                      {!isLumpsum && stepUp > 0 && (
                        <Area
                          type="monotone"
                          dataKey="stepUpInvested"
                          stackId="1"
                          name="Step-Up Extra"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          fill="#a78bfa"
                          fillOpacity={0.6}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="returns"
                        stackId="1"
                        name="Wealth Generated"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="#34d399"
                        fillOpacity={0.6}
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
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    📋{" "}
                    {showTable
                      ? "Hide Breakdown ▲"
                      : "Show Year-by-Year Breakdown ▼"}
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
                  <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
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
                  💸 Systematic Withdrawal Plan (SWP)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Calculate how much regular income you can withdraw from your
                  lump sum corpus and how long it will last.
                </p>
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
                      ? "🚫 Corpus exhausted early"
                      : "💼 Portfolio left"
                  }
                />
                <ResultCard
                  label="Total Returns Earned"
                  value={formatINR(swpResult.totalReturns)}
                  sub="Accrued interest"
                />
              </div>

              {swpResult.ranOutYear !== null ? (
                <div className="card p-5 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300">
                  <div className="flex gap-3 items-start">
                    <span className="text-2xl">⚠️</span>
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
                      <p className="text-xs mt-2 text-slate-500">
                        💡 Try lowering monthly withdrawal or a higher return
                        allocation.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card p-5 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                  <div className="flex gap-3 items-start">
                    <span className="text-2xl">🎉</span>
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
                      "⏱️",
                      "Shortest Lock-in",
                      "Only 3 years — vs 5 years for PPF/NSC",
                    ],
                    [
                      "📈",
                      "Equity Returns",
                      "Historically 12–15% CAGR over 10+ years",
                    ],
                    [
                      "💸",
                      "Tax Efficient",
                      "LTCG up to ₹1L is tax-free annually",
                    ],
                    [
                      "🔄",
                      "SIP Friendly",
                      "Start with ₹500/month in ELSS funds",
                    ],
                  ].map(([icon, title, desc]) => (
                    <div key={title} className="flex gap-2">
                      <span className="text-lg flex-shrink-0">{icon}</span>
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
              <div className="card p-4 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                ⚠️ Tax savings shown are indicative. Actual savings depend on
                total 80C investments and your income. Consult a CA for precise
                calculations.
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
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
                        <span>Currently Saved: {fmt(fireCurrentCorpus)}</span>
                        <span>Target: {fmt(fireCorpus)}</span>
                      </div>
                    </div>

                    <div className="card p-5 border-slate-100 dark:border-slate-800">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-white mb-4 flex items-center gap-1.5">
                        <span>🗓️</span> Retirement Milestones
                      </h4>
                      <div className="space-y-4">
                        {[0.25, 0.5, 0.75, 1.0].map((pct) => {
                          const milestoneTarget = fireCorpus * pct;
                          const isCompleted =
                            fireCurrentCorpus >= milestoneTarget;
                          const est = calculateMilestoneAge(pct);
                          return (
                            <div
                              key={pct}
                              className="relative flex gap-4 items-start pb-4 last:pb-0"
                            >
                              {pct !== 1.0 && (
                                <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-slate-100 dark:bg-slate-800" />
                              )}
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black z-10 shadow-sm ${isCompleted ? "bg-emerald-500 text-white" : "bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-2 border-orange-200 dark:border-orange-800"}`}
                              >
                                {isCompleted ? "✓" : `${pct * 100}%`}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {pct === 0.25
                                      ? "¼ Coast FIRE"
                                      : pct === 0.5
                                        ? "½ Half FIRE"
                                        : pct === 0.75
                                          ? "¾ Lean FIRE"
                                          : "Full FIRE"}{" "}
                                    ({fmt(milestoneTarget)})
                                  </span>
                                  <span
                                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isCompleted ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400" : "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400"}`}
                                  >
                                    {isCompleted
                                      ? "Achieved!"
                                      : est.age
                                        ? `Est. Age ${est.age}`
                                        : "—"}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                  {isCompleted
                                    ? "Milestone cleared!"
                                    : est.years !== null
                                      ? `Reachable in ${est.years} years of regular SIP investing`
                                      : "Need active monthly investment plan"}
                                </p>
                              </div>
                            </div>
                          );
                        })}
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
            const gain = taxSellAmount - taxBuyAmount;
            const buyD = new Date(taxBuyDate);
            const sellD = new Date(taxSellDate);
            const holdingDays = Math.max(
              0,
              Math.round((sellD - buyD) / 86400000),
            );
            const holdingMonths = holdingDays / 30.44;
            // ✅ Config-driven: picks the right budget year automatically
            const result = buildTaxResult({
              fundType: taxFundType,
              gain,
              holdingMonths,
              taxSlab,
              sellDate: taxSellDate,
            });
            const { taxType, taxAmount, fyLabel, rulesNote, steps, pillColor } =
              result;
            const netInHand = taxSellAmount - Math.round(taxAmount);
            const isEquity = taxFundType === "equity";

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
                    <div className="flex gap-2">
                      {[
                        ["equity", "📈 Equity / ELSS / Index"],
                        ["debt", "🏦 Debt / Liquid"],
                      ].map(([v, l]) => (
                        <button
                          key={v}
                          onClick={() => setTaxFundType(v)}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${taxFundType === v ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400"}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <SIPSlider
                    id="tax-buy-amount"
                    label="Amount Invested (Buy Value)"
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
                    label="Amount Received (Sell Value)"
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
                        Buy Date
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

                  {/* Step-by-step plain English explanation */}
                  <div className="card p-4 space-y-3">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">
                      📖 Why this tax? (Simple explanation)
                    </p>
                    {steps.map((step, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-base flex-shrink-0">
                          {step.icon}
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
                      📋 Complete Tax Breakdown
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
                  min={500}
                  max={100000}
                  step={500}
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
                      We'll simulate your SIP on each date 1–28 using actual NAV
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
                      <div className="card p-4">
                        <p className="font-bold text-slate-900 dark:text-white text-sm mb-3">
                          XIRR by SIP Date
                        </p>
                        <div className="grid grid-cols-7 gap-1.5">
                          {dateOptimizerResults.map((r) => {
                            const allXirr = dateOptimizerResults.map(
                              (x) => x.xirr ?? 0,
                            );
                            const minX = Math.min(...allXirr),
                              maxX = Math.max(...allXirr);
                            const pct =
                              maxX > minX
                                ? ((r.xirr ?? minX) - minX) / (maxX - minX)
                                : 0.5;
                            const isB = r.date === bestDateResult?.date;
                            const isW = r.date === worstDateResult?.date;
                            return (
                              <div
                                key={r.date}
                                className="flex flex-col items-center gap-1"
                              >
                                <div className="w-full flex flex-col items-center justify-end h-14">
                                  <div
                                    className={`w-full rounded-t transition-all ${isB ? "bg-emerald-500" : isW ? "bg-red-400" : "bg-blue-400"}`}
                                    style={{
                                      height: `${Math.max(15, pct * 100)}%`,
                                    }}
                                    title={`${r.date}th: ${r.xirr?.toFixed(2)}%`}
                                  />
                                </div>
                                <span
                                  className={`text-[9px] font-bold ${isB ? "text-emerald-600" : isW ? "text-red-500" : "text-slate-500"}`}
                                >
                                  {r.date}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-3 mt-3 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded bg-emerald-500 inline-block" />
                            Best
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded bg-red-400 inline-block" />
                            Worst
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded bg-blue-400 inline-block" />
                            Other dates
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
