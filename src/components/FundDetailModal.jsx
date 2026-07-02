// components/FundDetailModal.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { fetchFundDetail } from "../hooks/useFunds";
import {
  getExpenseRatio,
  getTERMeta,
  setUserER,
  clearUserER,
} from "../utils/expenseRatio";
import {
  getAllPlatformUrls,
  getUserPlatform,
} from "../utils/platformLinks";

function parseNavDate(s) {
  if (!s || typeof s !== "string") return NaN;
  const parts = s.split("-");
  if (parts.length !== 3) return NaN;
  const [dd, mm, yyyy] = parts;
  const ts = new Date(`${yyyy}-${mm}-${dd}`).getTime();
  return isNaN(ts) ? NaN : ts;
}

// Pre-sort navData ascending by timestamp (called once per modal open)
function buildSortedForModal(navData) {
  return navData
    .map((d) => ({ ts: parseNavDate(d.date), nav: parseFloat(d.nav) }))
    .filter((d) => Number.isFinite(d.ts) && Number.isFinite(d.nav) && d.nav > 0)
    .sort((a, b) => a.ts - b.ts);
}

// Binary search for closest date in pre-sorted array — O(log n) vs O(n)
function binarySearchModal(sorted, targetTs) {
  let lo = 0,
    hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].ts < targetTs) lo = mid + 1;
    else hi = mid;
  }
  if (
    lo > 0 &&
    Math.abs(sorted[lo - 1].ts - targetTs) < Math.abs(sorted[lo].ts - targetTs)
  ) {
    return lo - 1;
  }
  return lo;
}

function calcReturn(sorted, latestNav, latestTs, days) {
  if (!sorted || sorted.length < 2) return null;
  if (
    !Number.isFinite(latestTs) ||
    !Number.isFinite(latestNav) ||
    latestNav <= 0
  )
    return null;
  const cutoffTs = latestTs - days * 86400000;
  // For very short periods (< 1Y) don't look for data older than the fund itself
  if (cutoffTs < sorted[0].ts) return null;
  const idx = binarySearchModal(sorted, cutoffTs);
  const found = sorted[idx];
  // Tolerance scales with the period: 30d for short, 45d for long periods
  const toleranceDays = days <= 365 ? 30 : 45;
  if (Math.abs(found.ts - cutoffTs) > toleranceDays * 86400000) return null;
  const old = found.nav;
  if (old <= 0 || !Number.isFinite(old)) return null;
  if (days > 365) {
    const yrs = days / 365.25;
    const cagr = (Math.pow(latestNav / old, 1 / yrs) - 1) * 100;
    return Number.isFinite(cagr) ? cagr.toFixed(2) : null;
  }
  const ret = ((latestNav - old) / old) * 100;
  return Number.isFinite(ret) ? ret.toFixed(2) : null;
}

export default function FundDetailModal({ schemeCode, schemeName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watchlist, setWatchlist] = useLocalStorage("fundlens_watchlist", []);
  const [compareList, setCompareList] = useLocalStorage("fundlens_compare", []);
  const modalRef = useRef(null);

  const codeStr = String(schemeCode);
  const isWL = watchlist.map(String).includes(codeStr);
  const isCmp = compareList.map(String).includes(codeStr);

  const [editingER, setEditingER] = useState(false);
  const [tempER, setTempER] = useState("");
  const [erState, setERState] = useState(() =>
    getExpenseRatio(schemeName, codeStr),
  );

  useEffect(() => {
    setERState(getExpenseRatio(schemeName, codeStr));
    setEditingER(false);
  }, [schemeName, codeStr]);

  const handleSaveER = (val) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 5) {
      setUserER(codeStr, num);
      setERState({ value: num, source: "user", label: "Custom" });
      setEditingER(false);
    }
  };

  const handleClearER = () => {
    clearUserER(codeStr);
    setERState(getExpenseRatio(schemeName, codeStr));
    setEditingER(false);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(false);
    fetchFundDetail(schemeCode)
      .then((d) => {
        if (mounted) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [schemeCode]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Keyboard: close on Escape + focus trap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusable = Array.from(
        modal.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    // Move focus to modal title for correct screen reader context (not ✕ button)
    const titleEl = modalRef.current?.querySelector("[data-modal-title]");
    const firstFocusable = modalRef.current?.querySelector(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    (titleEl || firstFocusable)?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const toggleWL = () =>
    setWatchlist((p) =>
      p.map(String).includes(codeStr)
        ? p.filter((c) => String(c) !== codeStr)
        : [...p, codeStr],
    );
  const toggleCmp = () =>
    setCompareList((p) => {
      const s = p.map(String);
      if (s.includes(codeStr)) return p.filter((c) => String(c) !== codeStr);
      if (p.length >= 4) return p;
      return [...p, codeStr];
    });

  const nav = data?.data;
  const meta = data?.meta;
  const latestNAV = nav?.[0];

  const returns = useMemo(() => {
    if (!nav || nav.length === 0) return {};
    const sorted = buildSortedForModal(nav);
    if (sorted.length < 2) return {};
    const latestNavVal = parseFloat(latestNAV?.nav || 0);
    const latestTs = parseNavDate(latestNAV?.date);
    if (!Number.isFinite(latestTs) || latestNavVal <= 0) return {};
    return {
      "1M": calcReturn(sorted, latestNavVal, latestTs, 30),
      "3M": calcReturn(sorted, latestNavVal, latestTs, 90),
      "6M": calcReturn(sorted, latestNavVal, latestTs, 180),
      "1Y": calcReturn(sorted, latestNavVal, latestTs, 365),
      "3Y": calcReturn(sorted, latestNavVal, latestTs, 1095),
      "5Y": calcReturn(sorted, latestNavVal, latestTs, 1825),
    };
  }, [nav, latestNAV]);

  // Fund age in years
  const fundAge =
    nav && nav.length > 1
      ? (() => {
          const oldest = parseNavDate(nav[nav.length - 1].date);
          const latest = parseNavDate(nav[0].date);
          return ((latest - oldest) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(
            1,
          );
        })()
      : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">
              Fund Details
            </p>
            <h2
              id="modal-title"
              data-modal-title
              tabIndex={-1}
              className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2 focus:outline-none"
            >
              {schemeName}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close fund details"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-lg font-bold transition-all"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {Array(5)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  />
                ))}
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-slate-500">
              Failed to load fund data. Please try again.
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Fund House", meta?.fund_house || "—"],
                  ["Category", meta?.scheme_category || "—"],
                  ["Type", meta?.scheme_type || "—"],
                  ["Scheme Code", `#${codeStr}`],
                ].map(([l, v]) => (
                  <div
                    key={l}
                    className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3"
                  >
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                      {l}
                    </p>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">
                      {v}
                    </p>
                  </div>
                ))}
              </div>

              {/* NAV + Age */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-xl p-4 border border-blue-100 dark:border-blue-900">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
                    Latest NAV
                  </p>
                  <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                    ₹{parseFloat(latestNAV?.nav || 0).toFixed(4)}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    as of {latestNAV?.date}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    Fund Age
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {fundAge}
                  </p>
                  <p className="text-[10px] text-slate-500">years old</p>
                </div>
              </div>

              {/* Expense Ratio — accurate from AMFI data */}
              {(() => {
                const er = erState;
                const terMetaInfo = getTERMeta();
                return (
                  <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40 rounded-xl p-4 border border-orange-100 dark:border-orange-900/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-orange-600 dark:text-orange-400 uppercase tracking-wider font-bold">
                          Expense Ratio (TER)
                        </span>
                        {er.value !== null && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              er.source === "amfi"
                                ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                                : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400"
                            }`}
                          >
                            {er.source === "amfi" ? "✓ AMFI Data" : "✏️ Custom"}
                          </span>
                        )}
                      </div>

                      {editingER ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="5"
                            value={tempER}
                            onChange={(e) => setTempER(e.target.value)}
                            className="w-16 px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                            placeholder="e.g. 0.3"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveER(tempER)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 rounded"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingER(false)}
                            className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-[10px] font-bold px-2 py-1 rounded"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xl font-black tabular-nums ${
                              er.value === null
                                ? "text-slate-400"
                                : er.value > 1.5
                                  ? "text-red-600 dark:text-red-400"
                                  : er.value > 1
                                    ? "text-orange-600 dark:text-orange-400"
                                    : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {er.value !== null ? `${er.value}%` : "N/A"}
                            {er.value !== null && (
                              <span className="text-xs font-medium text-slate-500 ml-1">
                                p.a.
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => {
                              setTempER(
                                er.value !== null ? String(er.value) : "",
                              );
                              setEditingER(true);
                            }}
                            className="text-slate-400 hover:text-blue-500 text-xs transition-colors"
                            title="Edit Expense Ratio"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </div>

                    {er.value !== null ? (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {er.value <= 0.5
                          ? "✅ Excellent — very low fee. More returns stay with you."
                          : er.value <= 1.0
                            ? "👍 Good — competitive expense ratio for this category."
                            : er.value <= 1.5
                              ? "⚠️ Above average — consider switching to a Direct plan to save ~0.5-1%."
                              : "🚫 High — significant fee drag. A Direct plan alternative can save you ₹ lakhs over time."}
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        ⚠️ No official data found. Click the pencil icon to set
                        your own expense ratio.
                      </p>
                    )}

                    {er.source === "user" && (
                      <button
                        onClick={handleClearER}
                        className="text-[9px] text-red-500 hover:underline mt-1.5 block font-bold"
                      >
                        Reset to AMFI Default
                      </button>
                    )}

                    {terMetaInfo && er.source === "amfi" && (
                      <p className="text-[9px] text-slate-400 mt-1.5">
                        Source: AMFI India · Updated:{" "}
                        {new Date(terMetaInfo.fetchedAt).toLocaleDateString(
                          "en-IN",
                          { month: "short", year: "numeric" },
                        )}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Platform Invest Links */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Invest on Your Platform
                </h3>
                <div className="flex gap-2 flex-wrap">
                  {getAllPlatformUrls(schemeName, codeStr)
                    .slice(0, 6)
                    .map((p) => (
                      <a
                        key={p.id}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={p.tip}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        <span>{p.icon}</span>
                        <span>{p.name}</span>
                      </a>
                    ))}
                </div>
                {(() => {
                  const preferred = getUserPlatform();
                  if (!preferred)
                    return (
                      <p className="text-[10px] text-slate-400 mt-2">
                        💡 Tip: Set your default platform in Settings to see a
                        quick &ldquo;Invest Now&rdquo; button.
                      </p>
                    );
                  return null;
                })()}
              </div>

              {/* Returns */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                  Performance Returns
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {Object.entries(returns).map(([period, ret]) => {
                    const val = ret !== null ? parseFloat(ret) : null;
                    const isPos = val !== null && val >= 0;
                    return (
                      <div
                        key={period}
                        className={`rounded-xl p-3 text-center border flex flex-col justify-center ${val === null ? "bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 col-span-2" : isPos ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-100 dark:border-emerald-900" : "bg-red-50 dark:bg-red-950 border-red-100 dark:border-red-900"}`}
                      >
                        <p className="text-[10px] text-slate-500 mb-1">
                          {period}
                        </p>
                        {val === null ? (
                          <p className="text-[10px] font-medium text-slate-400 italic leading-tight">
                            Launched {nav?.[nav.length - 1]?.date}<br/>(Insufficient history)
                          </p>
                        ) : (
                          <>
                            <p
                              className={`text-sm font-bold ${isPos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                            >
                              {isPos ? "+" : ""}{val}%
                            </p>
                            <p className="text-[9px] text-slate-500">
                              {period.includes("Y") && parseInt(period) > 1
                                ? "CAGR"
                                : "Abs"}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Data history */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>
                  📅 NAV history:{" "}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {nav?.length?.toLocaleString("en-IN")} data points
                  </strong>
                </span>
                <span>Since {nav?.[nav.length - 1]?.date}</span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <button
                  onClick={toggleWL}
                  aria-label={
                    isWL ? "Remove from watchlist" : "Add to watchlist"
                  }
                  aria-pressed={isWL}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all ${isWL ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950 border border-slate-200 dark:border-slate-700"}`}
                >
                  {isWL ? "⭐ Saved" : "⭐ Watchlist"}
                </button>
                <button
                  onClick={toggleCmp}
                  aria-label={
                    isCmp
                      ? "Remove from comparison"
                      : compareList.length >= 4
                        ? "Compare list is full"
                        : "Add to comparison"
                  }
                  aria-pressed={isCmp}
                  disabled={!isCmp && compareList.length >= 4}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all ${isCmp ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800" : compareList.length >= 4 ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 border border-slate-200 dark:border-slate-700"}`}
                >
                  {isCmp ? "⚖️ In Compare" : "⚖️ Compare"}
                </button>
                <Link
                  to={`/compare?code=${codeStr}`}
                  onClick={onClose}
                  className="py-2.5 rounded-xl text-xs font-bold text-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90 transition-all"
                >
                  📊 Full Analysis →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
