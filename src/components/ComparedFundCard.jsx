// components/ComparedFundCard.jsx
import { memo } from "react";
import CategoryPill from "./CategoryPill";
import {
  getFundAgeYears,
  get52WeekHL,
  guessMinInvestment,
} from "../utils/chartUtils";

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

  return (
    <div
      className="card p-5 relative border-t-4 transition-shadow hover:shadow-lg"
      style={{ borderTopColor: color }}
    >
      {/* Color accent strip at top already via border-t-4 */}
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/60 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center text-sm transition-all duration-150"
        title="Remove fund from comparison"
        aria-label={`Remove ${schemeName} from comparison`}
      >
        ✕
      </button>

      <div className="space-y-3 pr-8">
        {/* Category + Name */}
        <div>
          <CategoryPill schemeName={schemeName} />
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white leading-snug mt-1.5">
            {schemeName}
          </h3>
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
            <span className="text-slate-400">AMFI</span>
            <span
              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold border border-slate-200 dark:border-slate-700/60"
              style={{ fontSize: "10px" }}
            >
              #{fund.schemeCode}
            </span>
          </p>
        </div>

        {/* Key stats grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">NAV</span>
            <div className="font-bold text-slate-900 dark:text-white tabular-nums">
              {latestNav ? `₹${latestNav.toFixed(4)}` : "—"}
            </div>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Age</span>
            <div className="font-bold text-slate-900 dark:text-white">
              {navData && navData.length > 0
                ? `${Math.floor(getFundAgeYears(navData))} yrs`
                : "—"}
            </div>
          </div>
          <div className="col-span-2">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Fund House</span>
            <div className="font-semibold text-slate-700 dark:text-slate-300 line-clamp-1">
              {meta?.fund_house || "—"}
            </div>
          </div>
          <div className="col-span-2">
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Scheme Type</span>
            <div className="font-semibold text-slate-700 dark:text-slate-300 line-clamp-1">
              {meta?.scheme_type || "—"}
            </div>
          </div>

          {/* Min investment */}
          {(() => {
            const minInvest = guessMinInvestment(schemeName);
            return (
              <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold">
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
                        Estimated. Verify with AMC.
                      </span>
                    </span>
                  </span>
                  <div className="font-bold text-slate-900 dark:text-white tabular-nums">
                    ₹{minInvest.sip}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold">
                    Min Lump
                    <span
                      className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-700 rounded-full w-3 h-3 flex items-center justify-center font-bold"
                      aria-label="Estimated minimum lumpsum amount"
                    >
                      ?
                      <span
                        className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight"
                        role="tooltip"
                      >
                        Estimated. Verify with AMC.
                      </span>
                    </span>
                  </span>
                  <div className="font-bold text-slate-900 dark:text-white tabular-nums">
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
            className="mt-1"
            aria-label={`52-week range: low ₹${hl.low.toFixed(2)} to high ₹${hl.high.toFixed(2)}`}
          >
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>52W Low: ₹{hl.low.toFixed(2)}</span>
              <span>52W High: ₹{hl.high.toFixed(2)}</span>
            </div>
            <div className="relative h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-400 via-amber-400 to-emerald-400"
                style={{ width: "100%" }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white dark:bg-slate-900 border-2 rounded-full shadow-sm -translate-x-1/2"
                style={{ left: `${hlPosition}%`, borderColor: color }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 text-center">
              {hlPosition !== null ? `${hlPosition.toFixed(0)}% from 52W low` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

export default ComparedFundCard;
