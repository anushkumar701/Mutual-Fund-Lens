// components/ComparedFundCard.jsx
import { memo, useMemo } from "react";
import CategoryPill from "./CategoryPill";
import {
  getFundAgeYears,
  get52WeekHL,
  getMonthlyWinRate,
  guessMinInvestment,
} from "../utils/chartUtils";
import { calculateFundMetrics, getSmartTags } from "../utils/metrics";

const ComparedFundCard = memo(function ComparedFundCard({
  fund,
  color,
  onRemove,
}) {
  const { meta, navData } = fund;
  const latestNav = navData?.[0]?.nav ? parseFloat(navData[0].nav) : null;
  const schemeName = meta?.scheme_name || "Unknown";
  const hl = get52WeekHL(navData);
  const hlPosition =
    hl && latestNav
      ? Math.min(
          100,
          Math.max(0, ((latestNav - hl.low) / (hl.high - hl.low)) * 100),
        )
      : null;

  // Memoize heavy metric calculations — navData is stable between renders
  const metrics = useMemo(() => calculateFundMetrics(navData), [navData]);
  const tags = useMemo(() => getSmartTags(metrics), [metrics]);
  const winRate = useMemo(() => getMonthlyWinRate(navData), [navData]);

  return (
    <div
      className="card p-5 relative border-l-4"
      style={{ borderLeftColor: color }}
    >
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-red-50 dark:bg-red-900 text-red-500 hover:bg-red-100 flex items-center justify-center text-sm"
        title="Remove fund from comparison"
        aria-label={`Remove ${schemeName} from comparison`}
      >
        ✕
      </button>
      <div className="space-y-3 pr-8">
        <CategoryPill schemeName={schemeName} />
        <h3 className="font-semibold text-sm text-slate-900 dark:text-white leading-snug">
          {schemeName}
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-slate-500">Latest NAV</span>
            <div className="font-bold text-slate-900 dark:text-white text-sm tabular-nums">
              {latestNav ? `₹${latestNav.toFixed(4)}` : "—"}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Fund Age</span>
            <div className="font-bold text-slate-900 dark:text-white text-sm">
              {navData && navData.length > 0
                ? `${Math.floor(getFundAgeYears(navData))} yrs`
                : "—"}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Fund House</span>
            <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs line-clamp-1">
              {meta?.fund_house || "—"}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Scheme Type</span>
            <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs line-clamp-1">
              {meta?.scheme_type || "—"}
            </div>
          </div>
          {(() => {
            const minInvest = guessMinInvestment(schemeName);
            return (
              <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex justify-between">
                <div>
                  <span className="text-slate-500 flex items-center gap-1">
                    Min SIP
                    <span
                      className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-700 rounded-full w-3 h-3 flex items-center justify-center font-bold"
                      aria-label="Estimated minimum SIP amount"
                    >
                      ?
                      <span
                        className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight"
                        role="tooltip"
                      >
                        Estimated minimum SIP amount. Please verify with AMC
                        website.
                      </span>
                    </span>
                  </span>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs tabular-nums">
                    ₹{minInvest.sip}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 flex items-center gap-1">
                    Min Lumpsum
                    <span
                      className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-700 rounded-full w-3 h-3 flex items-center justify-center font-bold"
                      aria-label="Estimated minimum lumpsum amount"
                    >
                      ?
                      <span
                        className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight"
                        role="tooltip"
                      >
                        Estimated minimum Lumpsum amount. Please verify with AMC
                        website.
                      </span>
                    </span>
                  </span>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs tabular-nums">
                    ₹{minInvest.lump}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 52-Week High/Low bar */}
        {hl && latestNav && (
          <div
            className="mt-2"
            aria-label={`52-week range: low ₹${hl.low.toFixed(2)} to high ₹${hl.high.toFixed(2)}`}
          >
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>52W Low: ₹{hl.low.toFixed(2)}</span>
              <span>52W High: ₹{hl.high.toFixed(2)}</span>
            </div>
            <div className="relative h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-400 via-amber-400 to-emerald-400"
                style={{ width: "100%" }}
              />
              <div
                className="absolute top-0 w-2 h-2 bg-white border-2 border-slate-600 dark:border-slate-300 rounded-full -translate-x-1/2"
                style={{ left: `${hlPosition}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5 text-center">
              {hlPosition !== null
                ? `${hlPosition.toFixed(0)}% from 52W low`
                : ""}
            </p>
          </div>
        )}

        {/* Metrics */}
        {!metrics ? (
          <div className="text-xs text-slate-400 mt-3 border-t border-slate-100 dark:border-slate-700 pt-3">
            Metrics not available
          </div>
        ) : (
          (() => {
            let riskLevel = "Unknown";
            let riskDots = "○○○○○";
            if (metrics.volatility != null) {
              if (metrics.volatility < 10) {
                riskLevel = "Low";
                riskDots = "●○○○○";
              } else if (metrics.volatility < 15) {
                riskLevel = "Moderate";
                riskDots = "●●○○○";
              } else if (metrics.volatility < 20) {
                riskLevel = "High";
                riskDots = "●●●○○";
              } else {
                riskLevel = "Very High";
                riskDots = "●●●●●";
              }
            }

            // Guard null before numeric comparison to avoid coercion bugs
            const sharpeColor =
              metrics.sharpe == null
                ? "text-slate-500"
                : metrics.sharpe > 1
                  ? "text-emerald-600 dark:text-emerald-400"
                  : metrics.sharpe > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400";

            const sortinoColor =
              metrics.sortino == null
                ? "text-slate-500"
                : metrics.sortino > 1
                  ? "text-emerald-600 dark:text-emerald-400"
                  : metrics.sortino > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400";

            return (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-0.5">
                      Volatility (Ann.)
                    </span>
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {metrics.volatility != null
                        ? `${metrics.volatility.toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-0.5">
                      Risk Level
                    </span>
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 justify-end">
                      <span>{riskLevel}</span>
                      <span className="text-[10px] tracking-tighter text-blue-500">
                        {riskDots}
                      </span>
                    </div>
                  </div>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[10px] font-semibold border border-blue-100 dark:border-blue-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <div>
                  <h4 className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                    Performance
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">1Y Return</span>
                      <div
                        className={`font-bold text-sm ${metrics.return1Y != null && metrics.return1Y >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {metrics.return1Y != null
                          ? `${metrics.return1Y >= 0 ? "▲" : "▼"} ${Math.abs(metrics.return1Y).toFixed(2)}%`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">3Y CAGR</span>
                      <div
                        className={`font-bold text-sm ${metrics.return3Y != null && metrics.return3Y >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {metrics.return3Y != null
                          ? `${metrics.return3Y >= 0 ? "▲" : "▼"} ${Math.abs(metrics.return3Y).toFixed(2)}%`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">5Y CAGR</span>
                      <div
                        className={`font-bold text-sm ${metrics.return5Y != null && metrics.return5Y >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {metrics.return5Y != null
                          ? `${metrics.return5Y >= 0 ? "▲" : "▼"} ${Math.abs(metrics.return5Y).toFixed(2)}%`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Max Drawdown</span>
                      <div className="font-bold text-sm text-red-600 dark:text-red-400">
                        {metrics.maxDrawdown > 0
                          ? `-${metrics.maxDrawdown.toFixed(2)}%`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 flex items-center gap-1">
                        Sharpe Ratio
                      </span>
                      <div className={`font-bold text-sm ${sharpeColor}`}>
                        {metrics.sharpe != null ? metrics.sharpe : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 flex items-center gap-1">
                        Sortino Ratio
                      </span>
                      <div className={`font-bold text-sm ${sortinoColor}`}>
                        {metrics.sortino != null ? metrics.sortino : "—"}
                      </div>
                    </div>
                    {winRate != null && (
                      <div>
                        <span className="text-slate-400 flex items-center gap-1">
                          Win Rate
                        </span>
                        <div
                          className={`font-bold text-sm ${winRate >= 60 ? "text-emerald-600 dark:text-emerald-400" : winRate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {winRate}%
                          <span className="text-[10px] font-normal text-slate-400 ml-1">
                            {winRate >= 60
                              ? "✓ Consistent"
                              : winRate >= 50
                                ? "Average"
                                : "Volatile"}
                          </span>
                        </div>
                      </div>
                    )}
                    {metrics.return10Y != null && (
                      <div>
                        <span className="text-slate-400">10Y CAGR</span>
                        <div
                          className={`font-bold text-sm ${metrics.return10Y >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {metrics.return10Y >= 0 ? "▲" : "▼"}{" "}
                          {Math.abs(metrics.return10Y).toFixed(2)}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
});

export default ComparedFundCard;
