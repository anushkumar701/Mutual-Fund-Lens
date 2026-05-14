import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFunds } from '../hooks/useFunds';
import { useLocalStorage } from '../hooks/useLocalStorage';
import SkeletonCard from '../components/SkeletonCard';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { inferCategory, GOALS, matchesGoal } from '../utils/goalFilters';

const CATEGORIES = ['All', 'Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Liquid'];
const PLAN_TYPES = ['All Plans', 'Direct', 'Regular'];
const SORTS = [
  { value: 'az', label: 'Name A → Z' },
  { value: 'za', label: 'Name Z → A' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

const CATEGORY_COLORS = {
  Equity: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300', border: '#3b82f6', badge: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' },
  Debt:   { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300', border: '#10b981', badge: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' },
  Hybrid: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300', border: '#f59e0b', badge: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  ELSS:   { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300', border: '#8b5cf6', badge: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' },
  Index:  { bg: 'bg-indigo-50 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300', border: '#6366f1', badge: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' },
  Liquid: { bg: 'bg-teal-50 dark:bg-teal-950', text: 'text-teal-700 dark:text-teal-300', border: '#14b8a6', badge: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300' },
  Other:  { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', border: '#94a3b8', badge: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' },
};

const CATEGORY_DESCRIPTIONS = {
  Equity: 'High growth potential. Best for 5+ year goals.',
  Debt: 'Stable returns. Good for 1–3 year goals.',
  Hybrid: 'Mix of equity & debt. Balanced risk.',
  ELSS: 'Tax saving under 80C with 3-year lock-in.',
  Index: 'Tracks market index. Low cost, passive.',
  Liquid: 'Like a savings account. For emergency funds.',
  Other: 'Diversified or specialty category.',
};

function getPlanType(name) {
  const l = name.toLowerCase();
  if (l.includes('direct')) return 'Direct';
  if (l.includes('regular')) return 'Regular';
  return 'Other';
}

function extractAMC(name) {
  // Try to extract first 2 words as AMC
  const words = name.split(' ');
  return words.slice(0, 2).join(' ');
}

function FundCard({ fund, watchlist, setWatchlist, compareList, setCompareList }) {
  const { schemeCode, schemeName } = fund;
  const codeStr = String(schemeCode);
  const category = inferCategory(schemeName);
  const planType = getPlanType(schemeName);
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;

  const isBookmarked = watchlist.map(String).includes(codeStr);
  const isCompared = compareList.map(String).includes(codeStr);

  const toggleBookmark = (e) => {
    e.preventDefault();
    setWatchlist(prev =>
      prev.map(String).includes(codeStr) ? prev.filter(c => String(c) !== codeStr) : [...prev, codeStr]
    );
  };
  const toggleCompare = (e) => {
    e.preventDefault();
    setCompareList(prev => {
      const s = prev.map(String);
      if (s.includes(codeStr)) return prev.filter(c => String(c) !== codeStr);
      if (prev.length >= 4) return prev;
      return [...prev, codeStr];
    });
  };

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 flex flex-col gap-3 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 border-l-[3px]"
      style={{ borderLeftColor: colors.border }}
    >
      {/* Top: Category + Plan + Code */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>{category}</span>
          {planType !== 'Other' && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${planType === 'Direct' ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' : 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300'}`}>
              {planType}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 font-mono bg-slate-50 dark:bg-slate-700/50 px-1.5 py-0.5 rounded flex-shrink-0">
          #{codeStr}
        </span>
      </div>

      {/* Fund Name */}
      <h3 className="font-semibold text-sm text-slate-900 dark:text-white leading-snug line-clamp-2 flex-1">
        {schemeName}
      </h3>

      {/* Category description */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
        {CATEGORY_DESCRIPTIONS[category] || CATEGORY_DESCRIPTIONS.Other}
      </p>

      {/* Plan type info */}
      {planType === 'Regular' && (
        <div className="flex items-center gap-1 text-[10px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 rounded px-2 py-1">
          ⚠️ Regular plan — higher fees than Direct
        </div>
      )}
      {planType === 'Direct' && (
        <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 rounded px-2 py-1">
          ✅ Direct plan — lower expense ratio
        </div>
      )}

      {/* Compare indicator */}
      {isCompared && (
        <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md w-fit">
          ✓ Added to Compare
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 mt-auto">
        <Link
          to={`/compare?code=${codeStr}`}
          className="btn-primary flex-1 text-center text-xs py-1.5"
        >
          Analyse →
        </Link>
        <button onClick={toggleBookmark}
          title={isBookmarked ? 'Remove from watchlist' : 'Add to watchlist'}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
            isBookmarked ? 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-amber-500 hover:bg-amber-50'
          }`}>
          <svg className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z" />
          </svg>
        </button>
        <button onClick={toggleCompare}
          title={isCompared ? 'Remove from compare' : compareList.length >= 4 ? 'Max 4 funds' : 'Add to compare'}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
            isCompared ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
              : compareList.length >= 4 ? 'bg-slate-50 dark:bg-slate-800 text-slate-300 cursor-not-allowed'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-blue-500 hover:bg-blue-50'
          }`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function Screener() {
  const { funds, loading, error, refetch } = useFunds();
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useLocalStorage('fundlens_watchlist', []);
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [planType, setPlanType] = useState('All Plans');
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [sort, setSort] = useState('az');
  const [tab, setTab] = useState('all');
  const PAGE_SIZE = 60;
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const toggleGoal = (goalId) =>
    setSelectedGoals(prev => prev.includes(goalId) ? prev.filter(g => g !== goalId) : [...prev, goalId]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (category !== 'All' ? 1 : 0) +
    (planType !== 'All Plans' ? 1 : 0) +
    selectedGoals.length;

  const clearFilters = () => { setSearch(''); setCategory('All'); setPlanType('All Plans'); setSelectedGoals([]); setSort('az'); };

  // Category stats
  const categoryStats = useMemo(() => {
    const counts = {};
    for (const f of funds) {
      const c = inferCategory(f.schemeName);
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [funds]);

  const filtered = useMemo(() => {
    let list = tab === 'watchlist'
      ? funds.filter(f => watchlist.map(String).includes(String(f.schemeCode)))
      : funds;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.schemeName.toLowerCase().includes(q));
    }
    if (tab !== 'watchlist') {
      if (category !== 'All') list = list.filter(f => inferCategory(f.schemeName) === category);
      if (planType !== 'All Plans') list = list.filter(f => getPlanType(f.schemeName) === planType);
      if (selectedGoals.length > 0) list = list.filter(f => selectedGoals.some(g => matchesGoal(f, g)));
    }
    switch (sort) {
      case 'za': list = [...list].sort((a, b) => b.schemeName.localeCompare(a.schemeName)); break;
      case 'newest': list = [...list].sort((a, b) => b.schemeCode - a.schemeCode); break;
      case 'oldest': list = [...list].sort((a, b) => a.schemeCode - b.schemeCode); break;
      default: list = [...list].sort((a, b) => a.schemeName.localeCompare(b.schemeName));
    }
    return list;
  }, [funds, search, category, planType, selectedGoals, sort, tab, watchlist]);

  const visibleFunds = filtered.slice(0, pageSize);
  const hasMore = filtered.length > pageSize;

  // If compare list has items, show floating banner
  const showCompareBanner = compareList.length > 0;

  return (
    <div className="min-h-screen pb-32 md:pb-8 md:pt-20 pt-16">
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
            <button onClick={clearFilters}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all">
              ✕ Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Tab toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit gap-1">
          <button onClick={() => setTab('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
            All Funds
          </button>
          <button onClick={() => setTab('watchlist')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${tab === 'watchlist' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
            ⭐ Watchlist
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
                type="text" placeholder="Search fund name, AMC, or scheme code..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="input-base pl-10 py-3 text-base w-full"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 flex items-center justify-center text-xs">✕</button>
              )}
            </div>

            {/* Category pill strip */}
            {tab === 'all' && !loading && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {CATEGORIES.map(cat => {
                  const count = cat === 'All' ? funds.length : (categoryStats[cat] || 0);
                  return (
                    <button key={cat} onClick={() => setCategory(cat)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        category === cat
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}>
                      {cat}
                      <span className={`text-[10px] px-1 rounded-full ${category === cat ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                        {count.toLocaleString('en-IN')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Filters row */}
            {tab === 'all' && (
              <div className="flex flex-wrap gap-3 items-center">
                <select value={planType} onChange={e => setPlanType(e.target.value)}
                  className={`input-base text-sm py-2 ${planType !== 'All Plans' ? 'border-emerald-400 ring-1 ring-emerald-400' : ''}`}>
                  {PLAN_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>

                <select value={sort} onChange={e => setSort(e.target.value)} className="input-base text-sm py-2">
                  {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                {/* Goal filters */}
                <div className="flex gap-1.5 flex-wrap">
                  {GOALS.map(goal => (
                    <button key={goal.id} onClick={() => toggleGoal(goal.id)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${
                        selectedGoals.includes(goal.id)
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}>
                      {goal.icon} {goal.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Plan type tip */}
            {planType === 'Regular' && (
              <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2 text-xs text-orange-700 dark:text-orange-300">
                ⚠️ <span><strong>Regular Plans</strong> include distributor commissions (~0.5–1% higher expense ratio). Switch to Direct Plans to save on fees.</span>
              </div>
            )}

            {/* Result count */}
            {!loading && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{filtered.length.toLocaleString('en-IN')}</span> funds
                  {activeFilterCount > 0 && <span className="ml-2 text-xs text-violet-600 dark:text-violet-400">({activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active)</span>}
                </p>
              </div>
            )}

            {/* Fund grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array(9).fill(0).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : filtered.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleFunds.map(fund => (
                    <FundCard
                      key={fund.schemeCode}
                      fund={fund}
                      watchlist={watchlist}
                      setWatchlist={setWatchlist}
                      compareList={compareList}
                      setCompareList={setCompareList}
                    />
                  ))}
                </div>
                {hasMore && (
                  <div className="flex flex-col items-center gap-2 pt-4">
                    <p className="text-xs text-slate-400">Showing {visibleFunds.length} of {filtered.length.toLocaleString('en-IN')} funds</p>
                    <button onClick={() => setPageSize(p => p + PAGE_SIZE)} className="btn-secondary px-6 py-2 text-sm">
                      Load {Math.min(PAGE_SIZE, filtered.length - pageSize)} more
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="pt-10">
                {tab === 'watchlist'
                  ? <EmptyState title="Your watchlist is empty" subtitle="Bookmark funds from the screener to save them here." />
                  : <EmptyState title="No funds match your filters" subtitle="Try different keywords or clear your filters." />}
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Compare Banner */}
      {showCompareBanner && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="flex items-center gap-3 bg-blue-600 text-white rounded-2xl px-5 py-3 shadow-2xl shadow-blue-900/40">
            <span className="text-sm font-semibold">{compareList.length} fund{compareList.length > 1 ? 's' : ''} selected</span>
            <button onClick={() => navigate('/compare')}
              className="bg-white text-blue-600 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all">
              Compare Now →
            </button>
            <button onClick={() => setCompareList([])} className="text-blue-200 hover:text-white text-xs ml-1">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
