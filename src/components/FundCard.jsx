// components/FundCard.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from './Toast';
import CategoryPill from './CategoryPill';
import GoalTag from './GoalTag';
import { getGoalForFund, inferCategory } from '../utils/goalFilters';
import { useLocalStorage } from '../hooks/useLocalStorage';

const CATEGORY_BORDERS = {
  Equity: '#3b82f6',
  Debt:   '#10b981',
  Hybrid: '#f59e0b',
  ELSS:   '#8b5cf6',
  Liquid: '#14b8a6',
  Index:  '#6366f1',
  Other:  '#94a3b8',
};

// Detect plan type from scheme name
function getPlanBadge(schemeName) {
  const name = schemeName.toLowerCase();
  if (name.includes('direct')) return { label: 'Direct', cls: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' };
  if (name.includes('regular')) return { label: 'Regular', cls: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' };
  return null;
}

// Estimate minimum investment since API doesn't provide it
function guessMinInvestment(schemeName) {
  if (!schemeName) return { sip: 500, lump: 1000 };
  const lower = schemeName.toLowerCase();
  if (lower.includes('elss') || lower.includes('tax')) return { sip: 500, lump: 500 };
  if (lower.includes('nifty') || lower.includes('index')) return { sip: 100, lump: 500 };
  if (lower.includes('parag parikh')) return { sip: 1000, lump: 1000 };
  return { sip: 500, lump: 1000 };
}

export default function FundCard({ fund, showCompare = false, showBookmark = false }) {
  const { schemeCode, schemeName } = fund;
  const [isExpanded, setIsExpanded] = useState(false);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const toast = useToast();

  // ── TYPE FIX: always compare as strings ──────────────────────────────
  const codeStr = String(schemeCode);
  const category = inferCategory(schemeName);
  const goal = getGoalForFund(fund);
  const planBadge = getPlanBadge(schemeName);

  const [watchlist, setWatchlist] = useLocalStorage('fundlens_watchlist', []);
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);

  const isBookmarked = watchlist.map(String).includes(codeStr);
  const isCompared   = compareList.map(String).includes(codeStr);

  const toggleBookmark = (e) => {
    e.preventDefault();
    setWatchlist((prev) =>
      prev.map(String).includes(codeStr)
        ? prev.filter((c) => String(c) !== codeStr)
        : [...prev, codeStr]
    );
  };

  const toggleCompare = (e) => {
    e.preventDefault();
    setCompareList((prev) => {
      const strPrev = prev.map(String);
      if (strPrev.includes(codeStr)) return prev.filter((c) => String(c) !== codeStr);
      if (prev.length >= 4) return prev;
      return [...prev, codeStr];
    });
  };

  const accentColor = CATEGORY_BORDERS[category] || CATEGORY_BORDERS.Other;

  return (
    <div
      className="card card-hover p-4 flex flex-col gap-2.5 animate-fade-in-up border-l-[3px]"
      style={{ borderLeftColor: accentColor }}
    >
      {/* Top row: Category pill + plan badge + scheme code */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CategoryPill schemeName={schemeName} />
          {planBadge && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${planBadge.cls}`}>
              {planBadge.label}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono bg-slate-50 dark:bg-slate-700/50 px-1.5 py-0.5 rounded flex-shrink-0">
          #{codeStr}
        </span>
      </div>

      {/* Fund name */}
      <h3 className="font-semibold text-sm text-slate-900 dark:text-white leading-snug line-clamp-2 flex-1">
        {schemeName}
      </h3>

      {/* Goal tag */}
      {goal && <GoalTag goal={goal} />}

      {/* Estimated Min Investments */}
      {(() => {
        const minInvest = guessMinInvestment(schemeName);
        return (
          <div className="flex gap-4 text-[10px] mt-1 text-slate-500">
            <span className="flex items-center gap-1">SIP: <span className="font-semibold text-slate-700 dark:text-slate-300">₹{minInvest.sip}</span> <span title="Estimated minimum SIP amount. Please verify with AMC website." className="cursor-help bg-slate-200 dark:bg-slate-700 rounded-full w-3 h-3 flex items-center justify-center font-bold text-[8px]">?</span></span>
            <span className="flex items-center gap-1">Lump: <span className="font-semibold text-slate-700 dark:text-slate-300">₹{minInvest.lump}</span> <span title="Estimated minimum Lumpsum amount. Please verify with AMC website." className="cursor-help bg-slate-200 dark:bg-slate-700 rounded-full w-3 h-3 flex items-center justify-center font-bold text-[8px]">?</span></span>
          </div>
        );
      })()}

      {/* "Added to Compare" indicator */}
      {isCompared && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md w-fit">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Added to Compare
        </div>
      )}

      {/* Quick View Details Expandable */}
      <div className="mt-auto">
        <button 
          onClick={async () => {
            setIsExpanded(!isExpanded);
            if (!isExpanded && !details) {
              setLoadingDetails(true);
              let timerId = setTimeout(() => {
                toast('Fetching live data, please hold on...', 'info', 4000);
              }, 5000);
              try {
                const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
                const data = await res.json();
                setDetails(data);
              } catch(e) { console.error(e); }
              clearTimeout(timerId);
              setLoadingDetails(false);
            }
          }}
          className="w-full text-center text-[10px] font-bold text-slate-400 hover:text-blue-500 uppercase tracking-widest py-1 transition-colors"
        >
          {isExpanded ? 'Hide Details ▲' : 'Quick View ▼'}
        </button>

        {isExpanded && (
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg text-xs space-y-2 mt-1 border border-slate-100 dark:border-slate-700 animate-fade-in-up">
            {loadingDetails ? (
              <div className="animate-pulse space-y-2">
                 <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                 <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
              </div>
            ) : details ? (
              <>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500 shrink-0">Fund House</span>
                  <span className="font-semibold text-right truncate text-slate-700 dark:text-slate-300" title={details.meta.fund_house}>{details.meta.fund_house}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500 shrink-0">Scheme Type</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-right">{details.meta.scheme_type}</span>
                </div>
                <div className="flex justify-between items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-700/50">
                  <span className="text-slate-500 shrink-0">Latest NAV <span className="text-[9px] opacity-70">({details.data[0]?.date})</span></span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">₹{details.data[0]?.nav}</span>
                </div>
              </>
            ) : (
              <span className="text-red-500">Failed to load details.</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <Link
          to={`/compare?code=${codeStr}`}
          id={`view-fund-${codeStr}`}
          className="btn-primary flex-1 text-center text-xs py-1.5"
        >
          View Details →
        </Link>

        {showBookmark && (
          <button
            id={`bookmark-${codeStr}`}
            onClick={toggleBookmark}
            title={isBookmarked ? 'Remove from watchlist' : 'Add to watchlist'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
              isBookmarked
                ? 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950'
            }`}
          >
            <svg className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z" />
            </svg>
          </button>
        )}

        {showCompare && (
          <button
            id={`compare-${codeStr}`}
            onClick={toggleCompare}
            title={isCompared ? 'Remove from compare' : compareList.length >= 4 ? 'Max 4 funds' : 'Add to compare'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
              isCompared
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : compareList.length >= 4
                  ? 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
