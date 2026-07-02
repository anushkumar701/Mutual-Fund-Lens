import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFunds } from "../hooks/useFunds";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDebounce } from "../hooks/useDebounce";
import SkeletonCard from "../components/SkeletonCard";
import ErrorState from "../components/ErrorState";
import { inferCategory, isSolutionOriented } from "../utils/goalFilters";
import { extractAMC, getPlanType, isFundClosed } from "../utils/fundFilters";
import { getExpenseRatio, getER } from "../utils/expenseRatio";
import { List as VirtualList } from "react-window";
import Fuse from "fuse.js";

// lazy must be declared after all static imports
const FundDetailModal = lazy(() => import("../components/FundDetailModal"));

const RISK = {
  Equity: "High",
  ELSS: "High",
  Hybrid: "Moderate",
  Index: "Moderate",
  Debt: "Low",
  Liquid: "Very Low",
  Other: "Moderate",
};
const RISK_COLOR = {
  "Very Low": "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30",
  Low: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
  Moderate:
    "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30",
  High: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30",
};
const AVG_RET = {
  Equity: "12–15% p.a.",
  ELSS: "12–15% p.a.",
  Index: "11–13% p.a.",
  Hybrid: "9–12% p.a.",
  Debt: "6–8% p.a.",
  Liquid: "4–6% p.a.",
  Other: "8–12% p.a.",
};
const CAT_COLOR = {
  Equity: "#3b82f6",
  Debt: "#10b981",
  Hybrid: "#f59e0b",
  ELSS: "#8b5cf6",
  Index: "#6366f1",
  Liquid: "#14b8a6",
  Other: "#94a3b8",
};
const HORIZONS = {
  Equity: "7Y+",
  ELSS: "3Y+",
  Index: "7Y+",
  Hybrid: "3-5Y",
  Debt: "1-3Y",
  Liquid: "<1Y",
  Other: "3Y+",
};

function getSubCat(name) {
  const n = name.toLowerCase();
  if (n.includes("flexi cap") || n.includes("flexicap")) return "Flexi Cap";
  if (n.includes("small cap") || n.includes("smallcap")) return "Small Cap";
  if (n.includes("mid cap") || n.includes("midcap")) return "Mid Cap";
  if (n.includes("large & mid") || n.includes("large and mid"))
    return "Large & Mid Cap";
  if (n.includes("large cap") || n.includes("largecap")) return "Large Cap";
  if (n.includes("multi cap") || n.includes("multicap")) return "Multi Cap";
  return null;
}

const FundCard = memo(function FundCard({
  fund,
  watchlist,
  setWatchlist,
  compareList,
  setCompareList,
  onDetails,
}) {
  const code = String(fund.schemeCode);
  const cat = inferCategory(fund.schemeName);
  const plan = getPlanType(fund.schemeName);
  const erData = getExpenseRatio(fund.schemeName, fund.schemeCode);
  const er = erData.value;
  const risk = RISK[cat] || "Moderate";
  const subCat = getSubCat(fund.schemeName);
  const closed = isFundClosed(fund.schemeName);
  const isWL = watchlist.map(String).includes(code);
  const isCmp = compareList.map(String).includes(code);
  const borderColor = CAT_COLOR[cat] || "#94a3b8";

  return (
    <div
      className={`bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 border-t-4 hover-glow flex flex-col overflow-hidden transition-all ${closed ? "opacity-70" : ""}`}
      style={{ borderTopColor: borderColor }}
    >
      {/* Closed banner */}
      {closed && (
        <div className="bg-red-500 text-white text-[10px] font-bold text-center py-1 tracking-wider">
          CLOSED / MATURED FUND
        </div>
      )}
      
      {/* SEBI 2026 Solution-Oriented warning */}
      {!closed && isSolutionOriented(fund.schemeName) && (
        <div className="bg-red-50 dark:bg-red-950/80 border-b border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300 text-[9px] font-bold text-center py-1.5 px-2 uppercase tracking-wide">
          ⚠️ SEBI '26: Closed to New Subscriptions
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Top badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
            style={{ background: borderColor }}
          >
            {cat}
          </span>
          {subCat && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
              {subCat}
            </span>
          )}
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ml-auto ${plan === "Direct" ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400" : "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400"}`}
          >
            {plan === "Direct"
              ? "Direct"
              : plan === "Regular"
                ? "Regular"
                : plan}
          </span>
        </div>

        {/* Fund name */}
        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
          {fund.schemeName}
        </h3>

        {/* 3 key stats */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="text-center bg-slate-50 dark:bg-slate-700/50 rounded-xl p-2">
            <div className="text-[9px] text-slate-500 mb-0.5">Est. Returns</div>
            <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              {AVG_RET[cat]}
            </div>
          </div>
          <div className={`text-center rounded-xl p-2 ${RISK_COLOR[risk]}`}>
            <div className="text-[9px] opacity-70 mb-0.5">Risk</div>
            <div className="text-[11px] font-bold">{risk}</div>
          </div>
          <div className="text-center bg-slate-50 dark:bg-slate-700/50 rounded-xl p-2">
            <div className="text-[9px] text-slate-500 mb-0.5">Min. Horizon</div>
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              {HORIZONS[cat]}
            </div>
          </div>
        </div>

        {/* ER + plan tip */}
        <div className="flex flex-col gap-0.5 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">
              Expense Ratio:{" "}
              <strong
                className={
                  er > 1 ? "text-red-500" : "text-slate-700 dark:text-slate-300"
                }
              >
                {er !== null ? `${er}%/yr` : "N/A"}
              </strong>
              {er !== null && (
                <span
                  className={`ml-1 text-[8px] font-bold px-1 py-0.5 rounded ${
                    erData.source === "amfi"
                      ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400"
                      : "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {erData.source === "amfi" ? "AMFI" : "Custom"}
                </span>
              )}
            </span>
            {plan === "Regular" && (
              <span className="text-orange-600 dark:text-orange-400 font-medium text-[9px]">
                Higher fee
              </span>
            )}
          </div>
          {erData.ber !== null && (
            <span className="text-[9px] text-slate-400 dark:text-slate-500">
              (BER: {erData.ber}% + Levies: {erData.levies}%)
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-2 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={() => onDetails(fund)}
            className="flex-1 text-xs font-bold py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition-all flex items-center justify-center gap-1"
          >
            <span>View Details</span>
            <svg className="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          </button>
          <button
            onClick={() =>
              setCompareList((p) => {
                const s = p.map(String);
                if (s.includes(code))
                  return p.filter((x) => String(x) !== code);
                if (p.length >= 4) return p;
                return [...p, code];
              })
            }
            className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${isCmp ? "bg-blue-600 text-white" : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"}`}
          >
            {isCmp ? "✓ In Compare" : "+ Compare"}
          </button>
          <button
            onClick={() =>
              setWatchlist((p) =>
                p.map(String).includes(code)
                  ? p.filter((x) => String(x) !== code)
                  : [...p, code],
              )
            }
            aria-label={isWL ? "Remove from watchlist" : "Add to watchlist"}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${isWL ? "bg-amber-100 dark:bg-amber-900/50" : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"}`}
          >
            <svg className={`w-4 h-4 ${isWL ? "text-amber-500 fill-current" : "text-slate-400 dark:text-slate-500"}`} viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  const prevCode = String(prevProps.fund.schemeCode);
  const nextCode = String(nextProps.fund.schemeCode);
  if (prevCode !== nextCode) return false;

  const prevIsWL = prevProps.watchlist.map(String).includes(prevCode);
  const nextIsWL = nextProps.watchlist.map(String).includes(nextCode);
  if (prevIsWL !== nextIsWL) return false;

  const prevIsCmp = prevProps.compareList.map(String).includes(prevCode);
  const nextIsCmp = nextProps.compareList.map(String).includes(nextCode);
  if (prevIsCmp !== nextIsCmp) return false;

  return true;
});

// ─── Main Screener ───────────────────────────────────────────
export default function Screener() {
  const { funds, loading, loadingSlow, error, refetch } = useFunds();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [watchlist, setWatchlist] = useLocalStorage("fundlens_watchlist", []);
  const [compareList, setCompareList] = useLocalStorage("fundlens_compare", []);
  const [modalFund, setModalFund] = useState(null);

  const initialTab =
    searchParams.get("tab") === "watchlist" ? "watchlist" : "all";
  const initialCategory = [
    "Equity",
    "Index",
    "Hybrid",
    "Debt",
    "ELSS",
    "Liquid",
  ].includes(searchParams.get("cat"))
    ? searchParams.get("cat")
    : "All";

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [tab, setTab] = useState(initialTab);
  const [cat, setCat] = useState(initialCategory);
  const [subCategory, setSubCategory] = useState("All");
  const [preset, setPreset] = useState("All");
  const [plan, setPlan] = useState("All");
  const [risk, setRisk] = useState("All");
  const [erMax, setErMax] = useState("All");
  const [amc, setAmc] = useState("All AMCs");
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState("az");
  const [page, setPage] = useState(48);

  const clearAll = () => {
    setSearch("");
    setCat("All");
    setSubCategory("All");
    setPreset("All");
    setPlan("All");
    setRisk("All");
    setErMax("All");
    setAmc("All AMCs");
    setShowClosed(false);
  };

  // Reset pagination whenever filters change
  useEffect(() => {
    setPage(48);
  }, [
    debouncedSearch,
    cat,
    subCategory,
    preset,
    plan,
    risk,
    erMax,
    amc,
    showClosed,
    tab,
  ]);

  const topAMCs = useMemo(() => {
    const m = {};
    for (const f of funds) {
      const a = extractAMC(f.schemeName);
      m[a] = (m[a] || 0) + 1;
    }
    return [
      "All AMCs",
      ...Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([a]) => a),
    ];
  }, [funds]);

  const catCounts = useMemo(() => {
    const c = {};
    for (const f of funds) {
      const x = inferCategory(f.schemeName);
      c[x] = (c[x] || 0) + 1;
    }
    return c;
  }, [funds]);

  const fuseIndex = useMemo(() => {
    if (!funds || funds.length === 0) return null;
    return new Fuse(funds, {
      keys: ["schemeName", "schemeCode"],
      threshold: 0.3, // fuzzy threshold
      distance: 100,
    });
  }, [funds]);

  const filtered = useMemo(() => {
    let list = funds;

    // Search is handled first via Fuse.js if query exists
    if (debouncedSearch.trim() && fuseIndex) {
      list = fuseIndex.search(debouncedSearch).map(result => result.item);
    }

    // Tab filter
    if (tab === "watchlist") {
      list = list.filter((f) =>
        watchlist.map(String).includes(String(f.schemeCode)),
      );
    }
    if (!showClosed) list = list.filter((f) => !isFundClosed(f.schemeName));

    if (preset === "Tax Saving (80C)")
      list = list.filter((f) => inferCategory(f.schemeName) === "ELSS");
    else if (preset === "Beginner Safe")
      list = list.filter(
        (f) =>
          inferCategory(f.schemeName) === "Index" ||
          inferCategory(f.schemeName) === "Liquid",
      );
    else if (preset === "High Risk/Return")
      list = list.filter((f) => {
        const c = inferCategory(f.schemeName);
        const sc = getSubCat(f.schemeName);
        return c === "Equity" && (sc === "Small Cap" || sc === "Mid Cap");
      });
    else if (preset === "Stable Income")
      list = list.filter(
        (f) =>
          inferCategory(f.schemeName) === "Debt" ||
          inferCategory(f.schemeName) === "Hybrid",
      );

    if (cat !== "All")
      list = list.filter((f) => inferCategory(f.schemeName) === cat);
    if (subCategory !== "All")
      list = list.filter((f) => getSubCat(f.schemeName) === subCategory);
    if (plan !== "All")
      list = list.filter((f) => getPlanType(f.schemeName) === plan);
    if (risk !== "All")
      list = list.filter((f) => RISK[inferCategory(f.schemeName)] === risk);
    if (erMax !== "All") {
      const maxER = {
        "Under 0.3%": 0.3,
        "Under 0.5%": 0.5,
        "Under 1%": 1.0,
        "Under 1.5%": 1.5,
      }[erMax];
      if (maxER)
        list = list.filter((f) => getER(f.schemeName, f.schemeCode) <= maxER);
    }
    if (amc !== "All AMCs")
      list = list.filter((f) => extractAMC(f.schemeName) === amc);

    switch (sort) {
      case "za":
        return [...list].sort((a, b) =>
          b.schemeName.localeCompare(a.schemeName),
        );
      case "er_low":
        return [...list].sort(
          (a, b) =>
            getER(a.schemeName, a.schemeCode) -
            getER(b.schemeName, b.schemeCode),
        );
      case "er_high":
        return [...list].sort(
          (a, b) =>
            getER(b.schemeName, b.schemeCode) -
            getER(a.schemeName, a.schemeCode),
        );
      case "newest":
        return [...list].sort((a, b) => b.schemeCode - a.schemeCode);
      default:
        return [...list].sort((a, b) =>
          a.schemeName.localeCompare(b.schemeName),
        );
    }
  }, [
    funds,
    tab,
    watchlist,
    debouncedSearch,
    showClosed,
    preset,
    cat,
    subCategory,
    plan,
    risk,
    erMax,
    amc,
    sort,
  ]);

  const activeCount = useMemo(
    () => funds.filter((f) => !isFundClosed(f.schemeName)).length,
    [funds],
  );
  const activeFilters = [
    search.trim(),
    cat !== "All",
    subCategory !== "All",
    preset !== "All",
    plan !== "All",
    risk !== "All",
    erMax !== "All",
    amc !== "All AMCs",
    showClosed,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen pb-32 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Fund Screener
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {loading
                ? "Loading..."
                : `${activeCount.toLocaleString("en-IN")} active funds · ${funds.length.toLocaleString("en-IN")} total`}
            </p>
          </div>
          {activeFilters > 0 && (
            <button
              onClick={clearAll}
              className="text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 rounded-xl font-semibold hover:bg-red-100 transition-all self-start sm:self-auto"
            >
              ✕ Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
            </button>
          )}
        </div>

        {error && <ErrorState message={error} onRetry={refetch} />}

        {/* Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 w-fit">
          {[
            ["all", "All Funds"],
            ["watchlist", "Watchlist"],
          ].map(([id, l]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${tab === id ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
            >
              {id === "watchlist" && (
                <svg className="w-3.5 h-3.5 text-amber-500 fill-current" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              )}
              <span>{l}</span>
              {id === "watchlist" && watchlist.length > 0 && (
                <span className="ml-0.5 bg-amber-400 text-amber-900 text-[10px] rounded-full px-1.5 font-bold">
                  {watchlist.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
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
            id="screener-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value.slice(0, 100))}
            placeholder="Search by fund name, AMC, or scheme code..."
            className="input-base pl-11 py-3 w-full text-sm"
            maxLength={100}
            aria-label="Search funds by name, AMC, or scheme code"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Filter Panel ── */}
        {tab === "all" && (
          <div className="card p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                <span>Filters</span>
                {activeFilters > 0 && (
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                    {activeFilters} active
                  </span>
                )}
              </h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showClosed}
                  onChange={(e) => setShowClosed(e.target.checked)}
                  className="rounded accent-red-500"
                />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Show closed funds
                </span>
              </label>
            </div>

            {/* Quick Presets */}
            <div>
              <label
                id="quick-preset-label"
                className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block"
              >
                Quick Presets
              </label>
              <div
                className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1"
                role="radiogroup"
                aria-labelledby="quick-preset-label"
              >
                {[
                  "All",
                  "Tax Saving (80C)",
                  "Beginner Safe",
                  "High Risk/Return",
                  "Stable Income",
                ].map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPreset(p);
                      if (p !== "All") {
                        setCat("All");
                        setSubCategory("All");
                      }
                    }}
                    role="radio"
                    aria-checked={preset === p}
                    className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${preset === p ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                  >
                    {p === "All" ? "None" : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label
                id="fund-category-label"
                className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block"
              >
                Fund Category
              </label>
              <div
                className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1"
                role="radiogroup"
                aria-labelledby="fund-category-label"
              >
                {[
                  "All",
                  "Equity",
                  "Index",
                  "Hybrid",
                  "Debt",
                  "ELSS",
                  "Liquid",
                ].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    role="radio"
                    aria-checked={cat === c}
                    className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${cat === c ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                  >
                    {c}
                    {c !== "All" && !loading
                      ? ` (${(catCounts[c] || 0).toLocaleString("en-IN")})`
                      : ""}
                  </button>
                ))}
              </div>
              {cat === "ELSS" && (
                <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1.5 flex items-start gap-1">
                  <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span>ELSS = Tax saving under Section 80C. 3 year lock-in. Good returns.</span>
                </p>
              )}
              {cat === "Index" && (
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1.5 flex items-start gap-1">
                  <svg className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span>Index funds track Nifty/Sensex. Very low cost. Best for beginners.</span>
                </p>
              )}
              {cat === "Liquid" && (
                <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1.5 flex items-start gap-1">
                  <svg className="w-3.5 h-3.5 text-teal-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span>Liquid funds = safe parking for emergency money. Can withdraw anytime.</span>
                </p>
              )}
            </div>

            {/* Sub-Category (only show if Equity or All) */}
            {(cat === "Equity" || cat === "All") && preset === "All" && (
              <div>
                <label
                  id="fund-subcat-label"
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block"
                >
                  Equity Sub-Category
                </label>
                <div
                  className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1"
                  role="radiogroup"
                  aria-labelledby="fund-subcat-label"
                >
                  {[
                    "All",
                    "Large Cap",
                    "Mid Cap",
                    "Small Cap",
                    "Flexi Cap",
                    "Large & Mid Cap",
                    "Multi Cap",
                  ].map((sc) => (
                    <button
                      key={sc}
                      onClick={() => setSubCategory(sc)}
                      role="radio"
                      aria-checked={subCategory === sc}
                      className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${subCategory === sc ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Plan + Risk */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  id="plan-type-label"
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block"
                >
                  Plan Type
                </label>
                <div
                  className="flex gap-2"
                  role="radiogroup"
                  aria-labelledby="plan-type-label"
                >
                  {["All", "Direct", "Regular"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlan(p)}
                      role="radio"
                      aria-checked={plan === p}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${plan === p ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                    >
                      {p === "Direct"
                        ? "Direct"
                        : p === "Regular"
                          ? "Regular"
                          : "All"}
                    </button>
                  ))}
                </div>
                {plan === "Direct" && (
                  <p className="text-[10px] text-emerald-600 mt-1">
                    Direct plans save 0.5–1% per year in fees vs Regular.
                  </p>
                )}
                {plan === "Regular" && (
                  <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-lg">
                    <p className="text-[11px] font-bold text-orange-800 dark:text-orange-400 mb-2 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                      Hidden Commission Impact (Assuming 1% higher ER)
                    </p>
                    <div className="flex gap-2 text-center">
                      <div className="flex-1 bg-white dark:bg-[#111622] rounded p-2 border border-orange-100 dark:border-orange-800/30">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">₹10k/mo SIP • 10 Yrs</div>
                        <div className="text-xs font-black text-rose-500 mt-0.5">Lose ~₹2.1 Lakhs</div>
                      </div>
                      <div className="flex-1 bg-white dark:bg-[#111622] rounded p-2 border border-orange-100 dark:border-orange-800/30">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">₹10k/mo SIP • 20 Yrs</div>
                        <div className="text-xs font-black text-rose-500 mt-0.5">Lose ~₹12.8 Lakhs</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label
                  id="risk-label"
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block"
                >
                  Risk Appetite
                </label>
                <div
                  className="flex gap-2 flex-wrap"
                  role="radiogroup"
                  aria-labelledby="risk-label"
                >
                  {["All", "Very Low", "Low", "Moderate", "High"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRisk(r)}
                      role="radio"
                      aria-checked={risk === r}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${risk === r ? "bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-slate-800 dark:border-white" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ER + AMC + Sort */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="max-er-select"
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block"
                >
                  Max Expense Ratio
                </label>
                <select
                  id="max-er-select"
                  value={erMax}
                  onChange={(e) => setErMax(e.target.value)}
                  className="input-base py-2.5 text-xs w-full"
                >
                  {[
                    "All",
                    "Under 0.3%",
                    "Under 0.5%",
                    "Under 1%",
                    "Under 1.5%",
                  ].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Lower = more returns stay with you
                </p>
              </div>
              <div>
                <label
                  htmlFor="amc-select"
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block"
                >
                  Fund House (AMC)
                </label>
                <select
                  id="amc-select"
                  value={amc}
                  onChange={(e) => setAmc(e.target.value)}
                  className="input-base py-2.5 text-xs w-full"
                >
                  {topAMCs.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="sort-select"
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block"
                >
                  Sort By
                </label>
                <select
                  id="sort-select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="input-base py-2.5 text-xs w-full"
                >
                  <option value="az">Name A → Z</option>
                  <option value="za">Name Z → A</option>
                  <option value="er_low">Lowest Expense Ratio First</option>
                  <option value="er_high">Highest Expense Ratio First</option>
                  <option value="newest">Newest Funds First</option>
                </select>
              </div>
            </div>

            {/* Result count */}
            {!loading && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {filtered.length.toLocaleString("en-IN")} funds found
                </span>
                <span className="text-xs text-slate-500">
                  matching your filters
                </span>
                {!showClosed && (
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                    Active only
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Results ── */}
        <div aria-live="polite" aria-busy={loading}>
          {loading ? (
            <div className="space-y-4">
              {loadingSlow && (
                <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    <strong>Taking longer than usual</strong> — mfapi.in may
                    be slow or down. Please wait or try again.
                  </p>
                  <button
                    onClick={refetch}
                    className="text-sm font-bold text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900 transition-all whitespace-nowrap"
                  >
                    Retry
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array(8)
                  .fill(0)
                  .map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="flex justify-center mb-3">
                <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803zM10 10h.01M14 10h.01M12 14h.01"/></svg>
              </div>
              <p className="font-bold text-slate-700 dark:text-slate-300 mb-2">
                No funds match your filters
              </p>
              <p className="text-sm text-slate-400 mb-5">
                Try removing some filters or search differently
              </p>
              <button onClick={clearAll} className="btn-secondary px-5 py-2">
                Clear All Filters
              </button>
            </div>
          ) : (
            <>
              {(() => {
                // Determine column count based on a rough viewport estimate
                const colCount = typeof window !== "undefined"
                  ? window.innerWidth >= 1280 ? 4
                  : window.innerWidth >= 1024 ? 3
                  : window.innerWidth >= 640  ? 2
                  : 1
                  : 1;
                const rowCount = Math.ceil(filtered.length / colCount);
                const ROW_HEIGHT = 260; // px per card row
                const listHeight = Math.min(rowCount * ROW_HEIGHT, 800); // cap visible window

                const Row = ({ index, style }) => {
                  const startIdx = index * colCount;
                  return (
                    <div style={style} className={`grid gap-4`} key={index}
                      // Inline grid-template-columns for dynamic col count
                      // so Tailwind breakpoints aren't needed inside the virtual list
                      // eslint-disable-next-line
                      {...{ style: { ...style, display: "grid", gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`, gap: "1rem", paddingRight: "4px" } }}
                    >
                      {Array.from({ length: colCount }).map((_, colIdx) => {
                        const fund = filtered[startIdx + colIdx];
                        if (!fund) return <div key={colIdx} />;
                        return (
                          <FundCard
                            key={fund.schemeCode}
                            fund={fund}
                            watchlist={watchlist}
                            setWatchlist={setWatchlist}
                            compareList={compareList}
                            setCompareList={setCompareList}
                            onDetails={setModalFund}
                          />
                        );
                      })}
                    </div>
                  );
                };

                return (
                  <>
                    <VirtualList
                      height={listHeight}
                      itemCount={rowCount}
                      itemSize={ROW_HEIGHT}
                      width="100%"
                      overscanCount={3}
                    >
                      {Row}
                    </VirtualList>
                    <p className="text-center text-xs text-slate-400 mt-3">
                      Showing {filtered.length.toLocaleString("en-IN")} funds (virtualised)
                    </p>
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Floating compare banner */}
      {compareList.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-blue-600 text-white rounded-2xl px-5 py-3 shadow-2xl shadow-blue-900/40">
            <span className="text-sm font-semibold">
              Compare Selected Funds
            </span>
            <button
              onClick={() => navigate("/compare")}
              className="bg-white text-blue-600 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all"
            >
              Compare Now →
            </button>
            <button
              onClick={() => setCompareList([])}
              aria-label="Clear comparison list"
              className="text-blue-200 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
