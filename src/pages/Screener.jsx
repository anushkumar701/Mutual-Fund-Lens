import { useState, useMemo } from 'react';
import { useFunds } from '../hooks/useFunds';
import { useLocalStorage } from '../hooks/useLocalStorage';
import FundCard from '../components/FundCard';
import SkeletonCard from '../components/SkeletonCard';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { inferCategory, GOALS, matchesGoal } from '../utils/goalFilters';

const CATEGORIES = ['All', 'Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Liquid'];
const SORTS = ['A to Z', 'Z to A', 'Newest First'];
const PLAN_TYPES = ['All Plans', 'Direct', 'Regular'];

function getPlanType(schemeName) {
  const name = schemeName.toLowerCase();
  if (name.includes('direct')) return 'Direct';
  if (name.includes('regular')) return 'Regular';
  return 'Other';
}

export default function Screener() {
  const { funds, loading, error, refetch } = useFunds();
  // ── type fix: watchlist stores strings ──────────────────────────────
  const [watchlist] = useLocalStorage('fundlens_watchlist', []);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [planType, setPlanType] = useState('All Plans');
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [sort, setSort] = useState('A to Z');
  const [tab, setTab] = useState('all');
  const PAGE_SIZE = 60;
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const toggleGoal = (goalId) =>
    setSelectedGoals((prev) =>
      prev.includes(goalId) ? prev.filter((g) => g !== goalId) : [...prev, goalId]
    );

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (category !== 'All' ? 1 : 0) +
    (planType !== 'All Plans' ? 1 : 0) +
    selectedGoals.length;

  const clearFilters = () => {
    setSearch(''); setCategory('All'); setPlanType('All Plans');
    setSelectedGoals([]); setSort('A to Z');
  };

  const filtered = useMemo(() => {
    // Watchlist: compare as strings (type fix)
    let list = tab === 'watchlist'
      ? funds.filter((f) => watchlist.map(String).includes(String(f.schemeCode)))
      : funds;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.schemeName.toLowerCase().includes(q));
    }

    if (tab !== 'watchlist') {
      if (category !== 'All')
        list = list.filter((f) => inferCategory(f.schemeName) === category);
      if (planType !== 'All Plans')
        list = list.filter((f) => getPlanType(f.schemeName) === planType);
      if (selectedGoals.length > 0)
        list = list.filter((f) => selectedGoals.some((g) => matchesGoal(f, g)));
    }

    switch (sort) {
      case 'Z to A':
        list = [...list].sort((a, b) => b.schemeName.localeCompare(a.schemeName)); break;
      case 'Newest First':
        list = [...list].sort((a, b) => b.schemeCode - a.schemeCode); break;
      default:
        list = [...list].sort((a, b) => a.schemeName.localeCompare(b.schemeName));
    }
    return list;
  }, [funds, search, category, planType, selectedGoals, sort, tab, watchlist]);

  // Reset pagination whenever filters change
  const visibleFunds = filtered.slice(0, pageSize);
  const hasMore = filtered.length > pageSize;


  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Fund Screener</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Search and filter across {funds.length.toLocaleString('en-IN')}+ live funds
            </p>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900 px-3 py-1.5 rounded-lg transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Tab toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit gap-1">
          <button id="tab-all" onClick={() => setTab('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
            All Funds
          </button>
          <button id="tab-watchlist" onClick={() => setTab('watchlist')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${tab === 'watchlist' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
            ⭐ My Watchlist
            {watchlist.length > 0 && (
              <span className="bg-amber-400 text-amber-900 text-xs rounded-full px-1.5 py-0.5 font-bold">{watchlist.length}</span>
            )}
          </button>
        </div>

        {error && <ErrorState message={error} onRetry={refetch} />}

        {!error && (
          <>
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
              </svg>
              <input
                id="fund-search" type="text"
                placeholder={tab === 'watchlist' ? 'Search within watchlist...' : 'Search by fund name or AMC...'}
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="input-base pl-10 py-3 text-base"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 flex items-center justify-center text-xs">
                  ✕
                </button>
              )}
            </div>

            {/* Quick Stats Bar */}
            {!loading && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 my-1">
                {(() => {
                  const counts = { Total: filtered.length, Equity: 0, Debt: 0, ELSS: 0, Liquid: 0, Hybrid: 0 };
                  filtered.forEach(f => {
                    const c = inferCategory(f.schemeName);
                    if (counts[c] !== undefined) counts[c]++;
                  });
                  return Object.entries(counts).map(([k, v]) => (
                    <div key={k} className="flex-shrink-0 flex items-center gap-1.5 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full text-[11px] shadow-sm">
                      <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{k}</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">{v.toLocaleString('en-IN')}</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Filters — only on All tab */}
            {tab === 'all' && (
              <>
                <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
                  {/* Category */}
                  <select id="category-filter" value={category} onChange={(e) => setCategory(e.target.value)}
                    className={`input-base sm:w-44 ${category !== 'All' ? 'border-blue-400 ring-1 ring-blue-400' : ''}`}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* Plan Type filter — Direct vs Regular */}
                  <select id="plan-filter" value={planType} onChange={(e) => setPlanType(e.target.value)}
                    className={`input-base sm:w-44 ${planType !== 'All Plans' ? 'border-emerald-400 ring-1 ring-emerald-400' : ''}`}>
                    {PLAN_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>

                  {/* Sort */}
                  <select id="sort-filter" value={sort} onChange={(e) => setSort(e.target.value)}
                    className="input-base sm:w-44">
                    {SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Plan type info tip */}
                {planType === 'Regular' && (
                  <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2 text-xs text-orange-700 dark:text-orange-300">
                    <span className="mt-0.5 flex-shrink-0">⚠️</span>
                    <span><strong>Regular Plans</strong> include distributor commissions (expense ratio ~0.5–1% higher than Direct). Consider switching to Direct Plans to save costs.</span>
                  </div>
                )}
                {planType === 'Direct' && (
                  <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                    <span className="mt-0.5 flex-shrink-0">✅</span>
                    <span><strong>Direct Plans</strong> have lower expense ratios (no distributor commission). Over 10+ years, this can mean significantly higher returns.</span>
                  </div>
                )}

                {/* Goal filter pills */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Filter by Goal</p>
                  <div className="flex gap-2 flex-wrap">
                    {GOALS.map((goal) => (
                      <button key={goal.id} id={`goal-${goal.id}`} onClick={() => toggleGoal(goal.id)}
                        className={`pill transition-all ${selectedGoals.includes(goal.id)
                          ? 'bg-violet-600 text-white shadow-md shadow-violet-200 dark:shadow-violet-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                        {goal.icon} {goal.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Result count */}
            {!loading && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tab === 'watchlist' ? '⭐ Watchlist:' : 'Showing'}{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{filtered.length.toLocaleString('en-IN')}</span> funds
                  {activeFilterCount > 0 && tab === 'all' && (
                    <span className="ml-2 text-xs text-violet-600 dark:text-violet-400 font-medium">
                      ({activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active)
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Card grid with Load More */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array(9).fill(0).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : filtered.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleFunds.map((fund) => (
                    <FundCard key={fund.schemeCode} fund={fund} showBookmark showCompare />
                  ))}
                </div>
                {hasMore && (
                  <div className="flex flex-col items-center gap-2 pt-4">
                    <p className="text-xs text-slate-400">
                      Showing {visibleFunds.length} of {filtered.length.toLocaleString('en-IN')} funds
                    </p>
                    <button
                      onClick={() => setPageSize((p) => p + PAGE_SIZE)}
                      className="btn-secondary px-6 py-2 text-sm"
                    >
                      Load More ({Math.min(PAGE_SIZE, filtered.length - pageSize)} more)
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="pt-10">
                {tab === 'watchlist'
                  ? <EmptyState title="Your watchlist is empty" subtitle="Bookmark funds from the screener to save them here." />
                  : <EmptyState title="No funds match your filters" subtitle="Try different keywords or clear your filters." />
                }
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
