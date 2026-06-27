// pages/Dashboard.jsx
// Future-proof: modular sections, easy to extend
import { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useFunds } from "../hooks/useFunds";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDebounce } from "../hooks/useDebounce";
import ErrorState from "../components/ErrorState";
import { calculateSIP } from "../utils/sipCalculations";
const FundDetailModal = lazy(() => import("../components/FundDetailModal"));
import { inferCategory } from "../utils/goalFilters";
import { isFundClosed } from "../utils/fundFilters";

// ─── Category config ───────────────────────────────────────────
const CAT_CFG = {
  Equity: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color: "#2563eb", // Vivid Blue
  },
  Debt: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    color: "#16a34a", // Forest Green
  },
  Hybrid: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: "#ea580c", // Burnt Orange
  },
  ELSS: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    color: "#7c3aed", // Deep Violet
  },
  Index: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    color: "#0891b2", // Cyan
  },
  Liquid: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    color: "#db2777", // Hot Pink — clearly different from Debt green
  },
  Other: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    color: "#ca8a04", // Gold/Amber — distinct from all others
  },
};

// ─── Per-subcategory distinct color palette ─────────────────────
// 10 visually separated hues cycling through the color wheel
const SUBCAT_PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#ea580c", // orange
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // pink
  "#ca8a04", // amber
  "#dc2626", // red
  "#0d9488", // teal
  "#9333ea", // purple
];


const SUBCAT_DATA = {
  Equity: {
    "Small Cap": [8.5, 62.4, 5.2, 11.2, 48.9, -15.2, -4.1, 28.5, 54.1, -1.5, 38.6, 29.8, 16.5],
    "Mid Cap": [6.1, 48.2, 2.5, 8.4, 39.1, -10.5, 0.2, 22.4, 40.2, 1.8, 30.4, 24.2, 14.1],
    "Large Cap": [4.2, 29.5, -2.1, 5.2, 26.8, 2.5, 10.5, 15.6, 24.5, 4.2, 18.6, 15.1, 10.5],
    "Flexi Cap": [5.3, 37.1, -0.5, 7.8, 31.2, -4.2, 6.8, 18.2, 31.4, 3.2, 22.5, 19.8, 12.1],
    "Multi Cap": [5.8, 41.5, 0.2, 9.1, 33.6, -6.8, 5.1, 19.5, 34.8, 2.8, 24.6, 21.4, 13.0]
  },
  Index: {
    "Nifty 50": [6.5, 31.4, -4.1, 3.0, 28.6, 3.2, 12.0, 14.9, 24.1, 4.3, 19.4, 14.2, 9.5],
    "Nifty Next 50": [4.8, 44.2, 1.2, 7.5, 43.1, -8.5, 1.5, 18.6, 29.8, 2.1, 26.5, 22.1, 13.5],
    "Sensex": [6.8, 29.9, -5.0, 2.0, 28.0, 5.9, 14.4, 15.7, 22.0, 4.4, 18.7, 13.8, 9.2],
    "Nifty Midcap 150": [5.1, 52.6, 3.0, 9.2, 45.4, -12.4, -1.8, 23.0, 44.5, 1.5, 32.0, 26.8, 15.8]
  },
  Hybrid: {
    "Aggressive Hybrid": [7.2, 25.4, 1.8, 6.5, 20.1, -2.5, 8.2, 12.4, 21.0, 5.2, 16.5, 13.5, 9.5],
    "Balanced Advantage (DAA)": [6.8, 18.5, 2.2, 5.8, 14.5, 1.2, 9.1, 10.5, 16.2, 6.1, 13.2, 11.0, 8.2],
    "Arbitrage": [8.1, 8.4, 7.5, 6.8, 6.2, 6.0, 5.8, 4.1, 3.8, 4.5, 6.5, 6.8, 6.2],
    "Multi Asset": [6.5, 16.2, 2.8, 6.0, 12.1, 2.5, 8.5, 9.8, 14.0, 7.0, 12.8, 11.5, 8.5]
  },
  Debt: {
    "Gilt (Govt Bonds)": [9.2, 12.5, 7.8, 11.5, 4.2, 6.5, 10.8, 9.2, 3.1, 0.8, 6.8, 7.2, 6.5],
    "Corporate Bond": [8.8, 10.5, 8.2, 9.5, 6.5, 6.2, 9.0, 8.4, 4.2, 2.1, 6.5, 7.5, 7.0],
    "Short Duration": [8.2, 9.2, 8.0, 8.5, 6.8, 6.5, 8.2, 7.8, 4.5, 3.0, 6.2, 7.0, 6.8],
    "Credit Risk": [9.5, 11.0, 8.5, 9.8, 7.2, 5.1, 7.5, 6.2, 3.0, -1.5, 7.0, 8.2, 7.5]
  },
  Liquid: {
    "Liquid Fund": [8.2, 8.5, 7.8, 7.1, 6.5, 6.8, 6.3, 4.2, 3.6, 4.8, 7.0, 7.2, 6.8],
    "Overnight Fund": [7.8, 7.9, 7.2, 6.5, 6.0, 6.1, 5.5, 3.5, 3.1, 4.0, 6.2, 6.4, 6.0],
    "Money Market": [8.5, 8.8, 8.1, 7.4, 6.8, 7.0, 6.6, 4.5, 3.9, 5.2, 7.2, 7.5, 7.1]
  },
  ELSS: {
    "ELSS Tax Saver (Direct)": [3.2, 34.5, -0.8, 9.1, 28.4, -3.5, 2.3, 13.1, 26.4, 2.4, 21.6, 19.7, 13.1],
    "ELSS Tax Saver (Regular)": [2.0, 32.8, -2.1, 7.8, 26.9, -4.8, 1.0, 11.8, 24.9, 1.1, 20.2, 18.2, 11.8]
  }
};


// ─── Fund Search Box ───────────────────────────────────────────
function FundSearchBox({
  funds,
  onSelectFund,
  loading,
  loadingSlow,
  error,
  refetch,
  onFocus,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const debouncedQuery = useDebounce(query, 300);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useMemo(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return funds
      .filter((f) => f.schemeName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [debouncedQuery, funds]);

  const handleSelect = (fund) => {
    setQuery("");
    setOpen(false);
    onSelectFund(fund);
  };

  const handleTrigger = () => {
    if (onFocus) onFocus();
  };

  return (
    <div ref={ref} className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z"
          />
        </svg>
        <input
          type="text"
          id="fund-search-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.slice(0, 100));
            setOpen(true);
            handleTrigger();
          }}
          onFocus={() => {
            setOpen(true);
            handleTrigger();
          }}
          placeholder={"Search any fund by name or scheme code..."}
          maxLength={100}
          aria-label="Search mutual funds by name or scheme code"
          className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 text-sm shadow-sm transition-all"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-500 mt-2 text-center">
        Type to search · Click a fund to view details · No page change needed
      </p>

      {/* Dropdown results / Loading / Error states */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {open && results.length > 0
          ? `${results.length} funds found`
          : open && debouncedQuery.length >= 2 && results.length === 0
            ? "No funds found"
            : ""}
      </span>

      {open && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl z-50 overflow-hidden">
          {loading && (
            <div className="px-4 py-6 text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Loading 4,000+ mutual funds...
              </p>
              {loadingSlow && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Connection is slow. Please wait.
                </p>
              )}
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-6 text-center space-y-3">
              <p className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (refetch) refetch();
                }}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
              >
                Retry Loading
              </button>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <>
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {results.length} results — click to view details
                </span>
                <span className="text-[10px] text-blue-500 font-semibold">
                  No page navigation
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {results.map((fund) => {
                  const cat = inferCategory(fund.schemeName);
                  const cfg = CAT_CFG[cat] || CAT_CFG.Other;
                  const closed = isFundClosed(fund.schemeName);
                  return (
                    <button
                      key={fund.schemeCode}
                      onClick={() => handleSelect(fund)}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all text-left border-b border-slate-50 dark:border-slate-700/50 last:border-0"
                    >
                      <span className="mt-0.5 flex-shrink-0 text-slate-400 dark:text-slate-500">{cfg.icon("w-5 h-5")}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ background: cfg.color }}
                          >
                            {cat}
                          </span>
                          {closed && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400">
                              CLOSED
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {fund.schemeName}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Code #{fund.schemeCode}
                        </p>
                      </div>
                      <span className="text-[10px] text-blue-500 font-semibold flex-shrink-0 mt-1">
                        View →
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <Link
                  to="/screener"
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                >
                  See all results in Screener →
                </Link>
              </div>
            </>
          )}

          {!loading && !error && debouncedQuery.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
              No funds found matching &quot;{debouncedQuery}&quot;
            </div>
          )}

          {!loading && !error && debouncedQuery.trim().length < 2 && (
            <div className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-xs">
              Type at least 2 characters to search...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Quick SIP Calc ─────────────────────────────────────────────
function QuickCalc() {
  const [amt, setAmt] = useState(5000);
  const [yrs, setYrs] = useState(10);
  const [rate, setRate] = useState(12);
  // Use canonical calculateSIP to prevent formula drift with the full SIP calculator
  const { maturity: mat, invested: inv } = useMemo(
    () => calculateSIP(amt, yrs, rate),
    [amt, yrs, rate],
  );
  const fmt = (n) =>
    n >= 10000000
      ? `₹${(n / 10000000).toFixed(2)} Cr`
      : n >= 100000
        ? `₹${(n / 100000).toFixed(1)} L`
        : `₹${n.toLocaleString("en-IN")}`;
  return (
    <div className="card p-4 sm:p-5 h-full">
      <h3 className="font-bold text-slate-900 dark:text-white mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 00-2-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
        <span>Quick Wealth Simulator</span>
      </h3>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          ["monthly-amt", "Monthly ₹", amt, setAmt, 100, 200000],
          ["sip-years", "Years", yrs, setYrs, 1, 40],
          ["return-rate", "Return %", rate, setRate, 1, 30],
        ].map(([id, l, v, s, mn, mx]) => (
          <div key={l}>
            <label
              htmlFor={id}
              className="text-[10px] text-slate-600 dark:text-slate-400 block mb-1"
            >
              {l}
            </label>
            <input
              id={id}
              type="number"
              value={v}
              onChange={(e) => s(Math.max(mn, Math.min(mx, +e.target.value)))}
              className="input-base w-full py-2 text-sm text-center font-bold"
              inputMode="numeric"
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mb-4">
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
          <div className="text-[10px] text-slate-600 dark:text-slate-400 mb-1">You Invest</div>
          <div className="font-bold text-sm text-slate-900 dark:text-white">
            {fmt(inv)}
          </div>
        </div>
        <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mb-1">
            Gains
          </div>
          <div className="font-bold text-sm text-emerald-700 dark:text-emerald-400">
            +{fmt(mat - inv)}
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-3 border border-blue-100 dark:border-blue-800">
          <div className="text-[10px] text-blue-600 dark:text-blue-400 mb-1">
            Total
          </div>
          <div className="font-bold text-sm text-blue-700 dark:text-blue-300">
            {fmt(mat)}
          </div>
        </div>
      </div>
      <Link
        to="/sip"
        className="btn-primary w-full text-center block py-2.5 text-xs"
      >
        Full Calculator: Step-Up SIP, FIRE & Tax Saving →
      </Link>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const { funds, loading, loadingSlow, error, refetch, triggerFetch } = useFunds({ lazy: true });
  const [watchlist] = useLocalStorage("fundlens_watchlist", []);
  const [modalFund, setModalFund] = useState(null);
  const [activeCategory, setActiveCategory] = useState("Equity");

  const catStats = useMemo(() => {
    const c = {};
    for (const f of funds) {
      const cat = inferCategory(f.schemeName);
      c[cat] = (c[cat] || 0) + 1;
    }
    return c;
  }, [funds]);

  const watchlistFunds = useMemo(
    () =>
      watchlist
        .map((code) => funds.find((f) => String(f.schemeCode) === String(code)))
        .filter(Boolean)
        .slice(0, 4),
    [watchlist, funds],
  );

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-20 pb-12 px-4 md:pt-28 md:pb-16 bg-gradient-to-b from-slate-50/50 via-transparent to-transparent dark:from-slate-900/20">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute top-20 -left-40 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-white/5 backdrop-blur-md px-4 py-2 rounded-full text-sm mb-6 border border-slate-200/60 dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              Live data ·{" "}
              {funds.length > 0 ? `${funds.length.toLocaleString("en-IN")}+` : "37,000+"}{" "}
              mutual funds
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-5 text-slate-900 dark:text-white leading-tight tracking-tight">
            Find & Analyse
            <br />
            <span className="gradient-text">
              Any Mutual Fund
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            Search, view details, compare, and simulate your wealth growth in one click — completely free.
          </p>

          {/* ── Fund Search — Main Feature ── */}
          {/* min-h prevents CLS when switching states */}
          <div className="w-full max-w-2xl mx-auto" style={{ minHeight: '5.5rem' }}>
            <FundSearchBox
              funds={funds}
              onSelectFund={setModalFund}
              loading={loading}
              loadingSlow={loadingSlow}
              error={error}
              refetch={refetch}
              onFocus={triggerFetch}
            />
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 mt-6 w-full max-w-md sm:max-w-none mx-auto">
            <Link
              to="/screener"
              className="btn-primary px-6 py-3.5 shadow-lg shadow-blue-500/10 dark:shadow-blue-500/5 w-full sm:w-auto text-center flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z"/></svg>
              <span>Browse & Filter Funds</span>
            </Link>
            <Link
              to="/compare"
              className="btn-secondary px-6 py-3.5 w-full sm:w-auto text-center flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/80 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <span>Compare Funds</span>
            </Link>
            <Link
              to="/sip"
              className="btn-secondary px-6 py-3.5 w-full sm:w-auto text-center flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/80 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>Wealth Simulator</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {error && <ErrorState message={error} onRetry={refetch} />}

        {/* ── Quick Tools Grid ── */}
        <section
          aria-labelledby="quick-tools-heading"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 320px",
          }}
        >
          <h2
            id="quick-tools-heading"
            className="text-xl font-bold text-slate-900 dark:text-white mb-4"
          >
            Quick Tools
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <QuickCalc />
            <div className="card p-5 h-full">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19a7 7 0 100-14 7 7 0 000 14zM12 15a3 3 0 100-6 3 3 0 000 6z"/></svg>
                <span>Goal-Based Fund Matching</span>
              </h3>
              <div className="space-y-3">
                {[
                  {
                    goal: "Emergency Fund",
                    type: "Liquid Fund",
                    horizon: "0–6 months",
                    risk: "Very Low",
                    color: "text-teal-700 dark:text-teal-400",
                  },
                  {
                    goal: "Short-term Goal",
                    type: "Debt Fund",
                    horizon: "1–3 years",
                    risk: "Low",
                    color: "text-emerald-700 dark:text-emerald-400",
                  },
                  {
                    goal: "Save Tax (80C)",
                    type: "ELSS Fund",
                    horizon: "3+ years (lock-in)",
                    risk: "Moderate",
                    color: "text-purple-600 dark:text-purple-400",
                  },
                  {
                    goal: "Long-term Wealth",
                    type: "Equity Fund",
                    horizon: "7+ years",
                    risk: "High",
                    color: "text-blue-600 dark:text-blue-400",
                  },
                  {
                    goal: "FIRE / Retirement",
                    type: "Index Fund",
                    horizon: "15+ years",
                    risk: "Moderate",
                    color: "text-indigo-600 dark:text-indigo-400",
                  },
                ].map((item) => (
                  <div
                    key={item.goal}
                    className="flex items-center justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.goal}
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                        {item.horizon} · Risk: {item.risk}
                      </div>
                    </div>
                    <span className={`font-bold ${item.color}`}>
                      {item.type}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                to="/screener"
                className="btn-secondary w-full text-center text-xs py-2 mt-4 block"
              >
                Find Funds by Goal →
              </Link>
            </div>
          </div>
        </section>

        {/* ── Browse by Category ── */}
        {!loading && !error && (
          <section
            aria-labelledby="browse-category-heading"
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "auto 280px",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2
                  id="browse-category-heading"
                  className="text-xl font-bold text-slate-900 dark:text-white"
                >
                  Browse by Category
                </h2>
                <p className="text-xs text-slate-700 dark:text-slate-400 mt-0.5">
                  Click any category to explore in Screener
                </p>
              </div>
              <Link
                to="/screener"
                className="text-sm text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {Object.entries(CAT_CFG).map(([cat, cfg]) => {
                const count = catStats[cat] || 0;
                if (!count) return null;
                return (
                  <Link
                    key={cat}
                    to={`/screener?cat=${cat}`}
                    className="card p-4 text-center hover-glow transition-all group duration-300 flex flex-col justify-between"
                  >
                    <div>
                      <div 
                        className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300"
                        style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                      >
                        {cfg.icon("w-6 h-6")}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                        {cat}
                      </div>
                    </div>
                    <div
                      className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80"
                      style={{ color: cfg.color }}
                    >
                      {count.toLocaleString("en-IN")} funds
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Watchlist ── */}
        {!loading && watchlistFunds.length > 0 && (
          <section
            aria-labelledby="watchlist-heading"
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "auto 260px",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                id="watchlist-heading"
                className="text-xl font-bold text-slate-900 dark:text-white"
              >
                ⭐ My Watchlist
              </h2>
              <Link
                to="/screener?tab=watchlist"
                className="text-sm text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                View all {watchlist.length} →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {watchlistFunds.map((fund) => {
                const cat = inferCategory(fund.schemeName);
                const cfg = CAT_CFG[cat] || CAT_CFG.Other;
                return (
                  <div
                    key={fund.schemeCode}
                    className="card p-5 border-t-4 hover-glow transition-all duration-300 flex flex-col justify-between"
                    style={{ borderTopColor: cfg.color }}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span 
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                          style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                        >
                          {cfg.icon("w-3 h-3")}
                          <span>{cat}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">#{fund.schemeCode}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-950 dark:text-slate-50 line-clamp-2 mb-4 leading-snug">
                        {fund.schemeName}
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModalFund(fund)}
                        className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-150"
                      >
                        Details
                      </button>
                      <Link
                        to={`/compare?code=${fund.schemeCode}`}
                        className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-center transition-all duration-150 shadow-sm shadow-blue-500/10"
                      >
                        Analyse →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Fund of the Week ── */}
        <section
          aria-labelledby="fotw-heading"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 280px",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2
                id="fotw-heading"
                className="text-xl font-bold text-slate-900 dark:text-white"
              >
                ⭐ Curated Picks
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Editor-selected funds worth keeping on your radar
              </p>
            </div>
            <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full font-bold border border-amber-200 dark:border-amber-800">
              Updated Weekly
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                code: "122639",
                name: "Parag Parikh Flexi Cap",
                category: "Equity",
                badge: "Flexi Cap",
                highlight: "Global Diversification",
                reason:
                  "Strong multi-cap fund with ~35% overseas allocation. Low overlap with Nifty-heavy peers. Consistent top-quartile 5Y returns.",
                color: "#1d4ed8",
              },
              {
                code: "120503",
                name: "Mirae Asset Large Cap",
                category: "Equity",
                badge: "Large Cap",
                highlight: "Category Leader",
                reason:
                  "One of the lowest expense ratios in large-cap category. Consistent alpha over benchmark across market cycles.",
                color: "#047857",
              },
              {
                code: "120465",
                name: "Axis Small Cap",
                category: "Equity",
                badge: "Small Cap",
                highlight: "High Growth",
                reason:
                  "Top-performing small cap with disciplined portfolio. Ideal for aggressive investors with 7+ year horizon.",
                color: "#6d28d9",
              },
            ].map((pick) => (
              <div
                key={pick.code}
                className="card p-4 border-l-4 hover:shadow-md transition-all group"
                style={{ borderLeftColor: pick.color }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: pick.color }}
                  >
                    {pick.badge}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    {pick.highlight}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 line-clamp-1">
                  {pick.name}
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mb-3 line-clamp-3">
                  {pick.reason}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setModalFund({
                        schemeCode: pick.code,
                        schemeName: pick.name,
                      })
                    }
                    className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                  >
                    View Details
                  </button>
                  <Link
                    to={`/compare?code=${pick.code}`}
                    className="flex-1 text-xs font-bold py-1.5 rounded-lg text-center transition-all text-white"
                    style={{ background: pick.color }}
                  >
                    Analyse →
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-500 mt-2 flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <span>Curated picks are for educational purposes only. Not investment advice. Consult a SEBI-registered advisor before investing.</span>
          </p>
        </section>

        {/* ── Category Performance Heatmap ── */}
        <section
          aria-labelledby="heatmap-heading"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 260px",
          }}
        >
          <div className="mb-4">
            <h2
              id="heatmap-heading"
              className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <svg className="w-5 h-5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <span>Category Returns Heatmap</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Approximate annual returns by fund category — spot market cycles
              at a glance
            </p>
          </div>
          <div className="card p-4 overflow-x-auto">
            {(() => {
              const YEARS = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
              // Approximate median category returns (%) — industry averages
              const DATA = {
                Equity: [4.8, 32.9, -1.2, 8.5, 29.6, -2.1, 4.2, 14.7, 27.3, 3.1, 22.4, 18.2, 12.5],
                Index: [8.1, 31.2, -3.0, 4.4, 30.3, 4.6, 12.1, 15.2, 27.1, 4.6, 21.4, 17.3, 11.2],
                ELSS: [3.2, 34.5, -0.8, 9.1, 28.4, -3.5, 2.3, 13.1, 26.4, 2.4, 21.6, 19.7, 13.1],
                Hybrid: [6.2, 22.8, 1.5, 7.2, 18.9, 2.1, 5.8, 10.7, 19.8, 6.5, 16.7, 13.2, 9.8],
                Debt: [8.5, 10.2, 8.2, 9.8, 6.1, 5.9, 9.4, 8.1, 3.7, 1.2, 6.3, 7.5, 7.1],
                Liquid: [8.2, 8.5, 7.8, 7.1, 6.5, 6.8, 6.3, 4.2, 3.6, 4.8, 7.0, 7.2, 6.8],
              };

              const ranks = [0, 1, 2, 3, 4, 5];

              // Rank categories for each year descending by returns
              const sortedYearsData = YEARS.map((year, i) => {
                const list = Object.entries(DATA).map(([category, returns]) => ({
                  category,
                  returnVal: returns[i],
                }));
                list.sort((a, b) => b.returnVal - a.returnVal);
                return { year, list };
              });

              return (
                <div className="min-w-[1200px]">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left py-2 pr-4 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider w-16">
                          Rank
                        </th>
                        {YEARS.map((y) => (
                          <th
                            key={y}
                            className="text-center py-2.5 px-2 text-slate-700 dark:text-slate-300 font-bold text-sm bg-slate-50/80 dark:bg-slate-800/40 first:rounded-l-xl last:rounded-r-xl"
                          >
                            {y}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {ranks.map((r) => {
                        const rankLabels = ["1st 🏆", "2nd", "3rd", "4th", "5th", "6th ⚠️"];
                        return (
                          <tr key={r} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/5 transition-colors">
                            <td className="py-3 pr-4 font-bold text-slate-500 dark:text-slate-400 text-xs">
                              {rankLabels[r]}
                            </td>
                            {sortedYearsData.map(({ year, list }) => {
                              const item = list[r];
                              const catColor = CAT_CFG[item.category]?.color || "#64748b";
                              // Dynamic opacity based on rank (r goes 0 to 5)
                              const opacity = Math.max(0.60, 1.0 - r * 0.08);
                              const bgHex = Math.round(opacity * 255).toString(16).padStart(2, "0");
                              const borderHex = Math.round(Math.min(1, opacity + 0.2) * 255).toString(16).padStart(2, "0");
                              
                              return (
                                <td key={year} className="px-1 py-1.5 min-w-[105px]">
                                  <div
                                    className="rounded-2xl p-2.5 transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default text-center border"
                                    style={{
                                      backgroundColor: `${catColor}${bgHex}`,
                                      borderColor: `${catColor}${borderHex}`,
                                    }}
                                  >
                                    <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 text-white drop-shadow-sm">
                                      {item.category}
                                    </div>
                                    <div className="text-xs font-black tabular-nums text-white drop-shadow-sm">
                                      {item.returnVal > 0 ? "+" : ""}
                                      {item.returnVal}%
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                    {Object.entries(CAT_CFG).map(([cat, cfg]) => (
                      <span
                        key={cat}
                        className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: cfg.color }}
                        />
                        <span className="font-semibold">{cat}</span>
                      </span>
                    ))}
                  </div>

                  {/* Overall Performance Analysis (Average Returns 2013-2025) */}
                  {(() => {
                    const overallAverages = Object.entries(DATA).map(([category, returns]) => {
                      const sum = returns.reduce((acc, curr) => acc + curr, 0);
                      const avg = sum / returns.length;
                      return { category, avg };
                    });
                    overallAverages.sort((a, b) => b.avg - a.avg);

                    const subcatDataset = SUBCAT_DATA[activeCategory] || {};
                    const subcatList = Object.keys(subcatDataset);
                    const subcatRanks = subcatList.map((_, idx) => idx);

                    // Rank subcategories for each year descending by returns
                    const sortedSubcatYearsData = YEARS.map((year, yearIdx) => {
                      const list = Object.entries(subcatDataset).map(([subcategory, returns]) => ({
                        subcategory,
                        returnVal: returns[yearIdx],
                      }));
                      list.sort((a, b) => b.returnVal - a.returnVal);
                      return { year, list };
                    });

                    const subcatAverages = Object.entries(subcatDataset).map(([subcategory, returns]) => {
                      const sum = returns.reduce((acc, curr) => acc + curr, 0);
                      const avg = sum / returns.length;
                      return { subcategory, avg };
                    });
                    subcatAverages.sort((a, b) => b.avg - a.avg);

                    return (
                      <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/60">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                          Overall Performance Analysis (2013 - 2025 Average)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                          {/* Category Ranking List */}
                          <div className="md:col-span-3 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-3">
                              📊 Category Rankings (Average Return)
                            </span>
                            <div className="space-y-2">
                              {overallAverages.map((item, idx) => {
                                const catColor = CAT_CFG[item.category]?.color || "#64748b";
                                const isActive = activeCategory === item.category;
                                return (
                                  <button
                                    key={item.category}
                                    onClick={() => setActiveCategory(item.category)}
                                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all border text-left ${
                                      isActive
                                        ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm font-black"
                                        : "bg-transparent border-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/20"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 pr-1">
                                      <span className="font-extrabold text-[10px] text-slate-400 dark:text-slate-500 w-3 flex-shrink-0">
                                        {idx + 1}
                                      </span>
                                      <div
                                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{
                                          backgroundColor: `${catColor}15`,
                                          color: catColor,
                                        }}
                                      >
                                        {CAT_CFG[item.category]?.icon("w-4 h-4")}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-[11px] font-extrabold text-slate-900 dark:text-white capitalize truncate">
                                          {item.category}
                                        </div>
                                      </div>
                                    </div>
                                    <span
                                      className="text-[9px] font-extrabold px-2 py-0.5 rounded-md flex-shrink-0 border"
                                      style={{
                                        backgroundColor: `${catColor}18`,
                                        borderColor: `${catColor}55`,
                                        color: catColor,
                                      }}
                                    >
                                      +{item.avg.toFixed(1)}%
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Interactive Subcategory Returns Heatmap */}
                          <div className="md:col-span-9 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex flex-col justify-between overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full inline-block animate-pulse"
                                    style={{ backgroundColor: CAT_CFG[activeCategory]?.color }}
                                  />
                                  Subcategory Periodic Returns: {activeCategory}
                                </h4>
                                <span className="text-[9px] text-slate-500 font-semibold bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full shadow-sm border border-slate-100 dark:border-slate-800">
                                  Yearly Ranked Descending
                                </span>
                              </div>

                              <div className="overflow-x-auto no-scrollbar">
                                <table className="w-full border-collapse">
                                  <thead>
                                    <tr>
                                      <th className="text-left pb-3 text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 pr-4">
                                        Rank
                                      </th>
                                      {YEARS.map((year) => (
                                        <th
                                          key={year}
                                          className="text-center pb-3 text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[110px]"
                                        >
                                          {year}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subcatRanks.map((r) => {
                                      const rankLabels = ["1st 🏆", "2nd", "3rd", "4th", "5th", "6th ⚠️"];
                                      return (
                                        <tr key={r} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/5 transition-colors">
                                          <td className="py-3 pr-4 font-extrabold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                                            {rankLabels[r] || `${r + 1}th`}
                                          </td>
                                          {sortedSubcatYearsData.map(({ year, list }) => {
                                            const item = list[r];
                                            if (!item) return <td key={year} className="px-1.5 py-1.5" />;
                                            // Each subcategory gets its own stable color from the palette
                                            const subcatIdx = subcatList.indexOf(item.subcategory);
                                            const subColor = SUBCAT_PALETTE[subcatIdx % SUBCAT_PALETTE.length];
                                            
                                            // Dynamic opacity based on rank
                                            const opacity = Math.max(0.60, 1.0 - r * 0.08);
                                            const bgHex = Math.round(opacity * 255).toString(16).padStart(2, "0");
                                            const borderHex = Math.round(Math.min(1, opacity + 0.2) * 255).toString(16).padStart(2, "0");

                                            return (
                                              <td key={year} className="px-1.5 py-1.5 min-w-[110px]">
                                                <div
                                                  className="rounded-xl p-2.5 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default text-center border"
                                                  style={{
                                                    backgroundColor: `${subColor}${bgHex}`,
                                                    borderColor: `${subColor}${borderHex}`,
                                                  }}
                                                >
                                                  <div
                                                    className="text-[10px] font-extrabold uppercase tracking-wider mb-0.5 truncate max-w-[85px] mx-auto text-white drop-shadow-sm"
                                                    title={item.subcategory}
                                                  >
                                                    {item.subcategory}
                                                  </div>
                                                  <div className="text-[11px] font-black tabular-nums text-white drop-shadow-sm">
                                                    {item.returnVal > 0 ? "+" : ""}
                                                    {item.returnVal}%
                                                  </div>
                                                </div>
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Average Performance Bar */}
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
                              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500">
                                13-Year Average Return:
                              </span>
                              {subcatAverages.map((item, idx) => {
                                const avgSubColor = SUBCAT_PALETTE[idx % SUBCAT_PALETTE.length];
                                return (
                                  <span
                                    key={item.subcategory}
                                    className="inline-flex items-center gap-1.5 text-[9px] font-extrabold px-2.5 py-1 rounded-full border"
                                    style={{
                                      backgroundColor: `${avgSubColor}18`,
                                      borderColor: `${avgSubColor}55`,
                                      color: avgSubColor,
                                    }}
                                  >
                                    <span>{idx + 1}. {item.subcategory}</span>
                                    <span className="opacity-90">({item.avg.toFixed(2)}%)</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <p className="text-[10px] text-slate-700 dark:text-slate-400 mt-4">
                    * Approximate median category returns. Actual individual
                    fund returns vary. Source: industry estimates.
                  </p>
                </div>
              );
            })()}
          </div>
        </section>

        {/* ── 3 CTA cards ── */}
        <section
          aria-label="Explore FundLens features"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 200px",
          }}
        >
          {[
            {
              t: "Fund Screener",
              d: "Advanced filters to find the right fund for you.",
              cta: "Find Funds →",
              to: "/screener",
              g: "from-blue-600 to-blue-700",
            },
            {
              t: "Compare Funds",
              d: "Compare up to 4 funds side by side.",
              cta: "Compare →",
              to: "/compare",
              g: "from-emerald-600 to-teal-600",
            },
            {
              t: "SIP + FIRE Calc",
              d: "Plan SIP, set goals, calculate FIRE date.",
              cta: "Calculate →",
              to: "/sip",
              g: "from-orange-500 to-red-500",
            },
          ].map((c) => (
            <div
              key={c.t}
              className={`rounded-2xl bg-gradient-to-br ${c.g} p-5 text-white`}
            >
              <h3 className="font-bold text-base mb-1">{c.t}</h3>
              <p className="text-sm opacity-80 mb-4">{c.d}</p>
              <Link
                to={c.to}
                className="bg-white/20 hover:bg-white/30 border border-white/30 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-all inline-block"
              >
                {c.cta}
              </Link>
            </div>
          ))}
        </section>
      </div>

      {/* ── Fund Detail Modal ── */}
      {modalFund && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <FundDetailModal
            schemeCode={modalFund.schemeCode}
            schemeName={modalFund.schemeName}
            onClose={() => setModalFund(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
