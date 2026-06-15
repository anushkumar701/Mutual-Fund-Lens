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
    e: "📈",
    color: "#1d4ed8",
    desc: "Long-term wealth. Best for 7+ years.",
  },
  Debt: {
    e: "🏛️",
    color: "#047857",
    desc: "Stable returns. Good for 1–3 years.",
  },
  Hybrid: {
    e: "⚖️",
    color: "#b45309",
    desc: "Balanced equity & debt exposure.",
  },
  ELSS: {
    e: "🧾",
    color: "#6d28d9",
    desc: "Tax saving under 80C. 3-yr lock-in.",
  },
  Index: { e: "📊", color: "#4338ca", desc: "Low cost. Tracks Nifty/Sensex." },
  Liquid: {
    e: "💧",
    color: "#0f766e",
    desc: "Like savings account. Emergency fund.",
  },
  Other: { e: "📁", color: "#64748b", desc: "Specialty & sector funds." },
};

// ─── Fund Search Box ───────────────────────────────────────────
function FundSearchBox({ funds, onSelectFund }) {
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
          }}
          onFocus={() => setOpen(true)}
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
        🔍 Type to search · Click a fund to view details · No page change needed
      </p>

      {/* Dropdown results */}
      {/* Announce result count to screen readers */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {open && results.length > 0
          ? `${results.length} funds found`
          : open && debouncedQuery.length >= 2 && results.length === 0
            ? "No funds found"
            : ""}
      </span>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {results.length} results — click to view details
            </span>
            <span className="text-[10px] text-blue-500">
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
                  <span className="text-lg mt-0.5 flex-shrink-0">{cfg.e}</span>
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
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl z-50 p-6 text-center">
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            No funds found for &quot;{debouncedQuery}&quot;
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Try a shorter name or use the fund house name
          </p>
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
        🧮 Quick Wealth Simulator
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
  const { funds, loading, loadingSlow, error, refetch } = useFunds();
  const [watchlist] = useLocalStorage("fundlens_watchlist", []);
  const [modalFund, setModalFund] = useState(null);

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
      <section className="relative overflow-hidden pt-20 pb-12 px-4 md:pt-28 md:pb-16">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/70 dark:bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-6 border border-slate-200/50 dark:border-white/20 shadow-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              Live data ·{" "}
              {loading ? "..." : `${funds.length.toLocaleString("en-IN")}+`}{" "}
              mutual funds
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 text-slate-900 dark:text-white leading-tight tracking-tight">
            Find & Analyse
            <br />
            <span className="text-blue-600 dark:text-blue-500">
              Any Mutual Fund
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-base mb-8 max-w-xl mx-auto">
            Search, view details, compare and plan your investments — all free.
          </p>

          {/* ── Fund Search — Main Feature ── */}
          {/* min-h prevents CLS when switching between loading skeleton and search box */}
          <div className="w-full max-w-2xl mx-auto" style={{ minHeight: '5.5rem' }}>
            {!loading && funds.length > 0 && (
              <FundSearchBox funds={funds} onSelectFund={setModalFund} />
            )}

            {loading && (
              <div
                className="space-y-2"
                role="status"
                aria-label="Loading funds"
              >
                <div className="h-14 bg-white/50 dark:bg-slate-800/50 rounded-2xl border-2 border-slate-200 dark:border-slate-600 animate-pulse flex items-center justify-center">
                  <span className="text-slate-600 dark:text-slate-400 text-sm">Loading funds…</span>
                </div>
                {loadingSlow && (
                  <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      ⏳ <strong>Taking longer than usual</strong> — mfapi.in may
                      be slow. Please wait or retry.
                    </p>
                    <button
                      onClick={refetch}
                      className="text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-600 px-3 py-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900 transition-all whitespace-nowrap"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 mt-6 w-full max-w-md sm:max-w-none mx-auto">
            <Link
              to="/screener"
              className="btn-primary px-5 py-3 shadow-md w-full sm:w-auto text-center"
            >
              🔍 Browse & Filter Funds
            </Link>
            <Link
              to="/compare"
              className="btn-secondary px-5 py-3 w-full sm:w-auto text-center"
            >
              ⚖️ Compare Funds
            </Link>
            <Link
              to="/sip"
              className="btn-secondary px-5 py-3 w-full sm:w-auto text-center"
            >
              🔥 SIP + FIRE Calc
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
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">
                🎯 Which Fund for Which Goal?
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
                    className="card p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all group"
                  >
                    <div className="text-2xl mb-2">{cfg.e}</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      {cat}
                    </div>
                    <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug mb-2 hidden sm:block">
                      {cfg.desc}
                    </div>
                    <div
                      className="text-[11px] font-bold"
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
                    className="card p-4 border-l-4"
                    style={{ borderLeftColor: cfg.color }}
                  >
                    <div
                      className="text-xs font-bold mb-2"
                      style={{ color: cfg.color }}
                    >
                      {cfg.e} {cat}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 mb-3 leading-snug">
                      {fund.schemeName}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModalFund(fund)}
                        className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                      >
                        View Details
                      </button>
                      <Link
                        to={`/compare?code=${fund.schemeCode}`}
                        className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-center transition-all"
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
                highlight: "🌍 Global Diversification",
                reason:
                  "Strong multi-cap fund with ~35% overseas allocation. Low overlap with Nifty-heavy peers. Consistent top-quartile 5Y returns.",
                color: "#1d4ed8",
              },
              {
                code: "120503",
                name: "Mirae Asset Large Cap",
                category: "Equity",
                badge: "Large Cap",
                highlight: "🏆 Category Leader",
                reason:
                  "One of the lowest expense ratios in large-cap category. Consistent alpha over benchmark across market cycles.",
                color: "#047857",
              },
              {
                code: "120465",
                name: "Axis Small Cap",
                category: "Equity",
                badge: "Small Cap",
                highlight: "🚀 High Growth",
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
          <p className="text-[10px] text-slate-600 dark:text-slate-500 mt-2">
            ⚠️ Curated picks are for educational purposes only. Not investment
            advice. Consult a SEBI-registered advisor before investing.
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
              className="text-xl font-bold text-slate-900 dark:text-white"
            >
              📊 Category Returns Heatmap
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Approximate annual returns by fund category — spot market cycles
              at a glance
            </p>
          </div>
          <div className="card p-4 overflow-x-auto">
            {(() => {
              const YEARS = [2019, 2020, 2021, 2022, 2023, 2024];
              // Approximate median category returns (%) — industry averages
              const DATA = {
                Equity: [4.2, 14.7, 27.3, 3.1, 22.4, 18.2],
                Index: [12.1, 15.2, 27.1, 4.6, 21.4, 17.3],
                ELSS: [2.3, 13.1, 26.4, 2.4, 21.6, 19.7],
                Hybrid: [5.8, 10.7, 19.8, 6.5, 16.7, 13.2],
                Debt: [9.4, 8.1, 3.7, 1.2, 6.3, 7.5],
                Liquid: [6.3, 4.2, 3.6, 4.8, 7.0, 7.2],
              };
              const getColor = (v) => {
                if (v >= 20) return "bg-emerald-700 text-white";
                if (v >= 12) return "bg-emerald-400 text-emerald-950 dark:text-emerald-950";
                if (v >= 6)
                  return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300";
                if (v >= 2)
                  return "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300";
                if (v >= 0)
                  return "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300";
                return "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300";
              };
              return (
                <div className="min-w-[480px]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-2 pr-3 text-slate-500 dark:text-slate-400 font-semibold w-20">
                          Category
                        </th>
                        {YEARS.map((y) => (
                          <th
                            key={y}
                            className="text-center py-2 px-1 text-slate-500 dark:text-slate-400 font-semibold"
                          >
                            {y}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="space-y-1">
                      {Object.entries(DATA).map(([cat, vals]) => (
                        <tr key={cat}>
                          <td className="pr-3 py-1 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {cat}
                          </td>
                          {vals.map((v, i) => (
                            <td key={i} className="px-1 py-1">
                              <div
                                className={`rounded-lg px-1 py-1.5 text-center font-bold tabular-nums transition-all ${getColor(v)}`}
                              >
                                {v > 0 ? "+" : ""}
                                {v}%
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                    {[
                      ["≥20%", "bg-emerald-700"],
                      ["12–19%", "bg-emerald-400"],
                      ["6–11%", "bg-emerald-100 dark:bg-emerald-900/40"],
                      ["2–5%", "bg-amber-100"],
                      ["<2%", "bg-orange-100"],
                    ].map(([l, c]) => (
                      <span
                        key={l}
                        className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400"
                      >
                        <span className={`w-3 h-3 rounded ${c} inline-block`} />
                        {l}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600 dark:text-slate-500 mt-2">
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
