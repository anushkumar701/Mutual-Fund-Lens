import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFunds } from '../hooks/useFunds';
import { useLocalStorage } from '../hooks/useLocalStorage';
import SkeletonCard from '../components/SkeletonCard';
import ErrorState from '../components/ErrorState';
import FundDetailModal from '../components/FundDetailModal';
import { inferCategory } from '../utils/goalFilters';
import { extractAMC, getPlanType, estimateER, isFundClosed } from '../utils/fundFilters';

const RISK = { Equity:'High', ELSS:'High', Hybrid:'Moderate', Index:'Moderate', Debt:'Low', Liquid:'Very Low', Other:'Moderate' };
const RISK_COLOR = { 'Very Low':'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30', Low:'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30', Moderate:'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30', High:'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30' };
const AVG_RET = { Equity:'12–15% p.a.', ELSS:'12–15% p.a.', Index:'11–13% p.a.', Hybrid:'9–12% p.a.', Debt:'6–8% p.a.', Liquid:'4–6% p.a.', Other:'8–12% p.a.' };
const CAT_COLOR = { Equity:'#3b82f6', Debt:'#10b981', Hybrid:'#f59e0b', ELSS:'#8b5cf6', Index:'#6366f1', Liquid:'#14b8a6', Other:'#94a3b8' };
const HORIZONS = { Equity:'7Y+', ELSS:'3Y+', Index:'7Y+', Hybrid:'3-5Y', Debt:'1-3Y', Liquid:'<1Y', Other:'3Y+' };

function getSubCat(name) {
  const n = name.toLowerCase();
  if (n.includes('flexi cap')||n.includes('flexicap')) return 'Flexi Cap';
  if (n.includes('small cap')||n.includes('smallcap')) return 'Small Cap';
  if (n.includes('mid cap')||n.includes('midcap')) return 'Mid Cap';
  if (n.includes('large & mid')||n.includes('large and mid')) return 'Large & Mid Cap';
  if (n.includes('large cap')||n.includes('largecap')) return 'Large Cap';
  if (n.includes('multi cap')||n.includes('multicap')) return 'Multi Cap';
  return null;
}

// ─── Fund Card ───────────────────────────────────────────────
function FundCard({ fund, watchlist, setWatchlist, compareList, setCompareList, onDetails }) {
  const code = String(fund.schemeCode);
  const cat = inferCategory(fund.schemeName);
  const plan = getPlanType(fund.schemeName);
  const er = estimateER(fund.schemeName);
  const risk = RISK[cat] || 'Moderate';
  const subCat = getSubCat(fund.schemeName);
  const closed = isFundClosed(fund.schemeName);
  const isWL = watchlist.map(String).includes(code);
  const isCmp = compareList.map(String).includes(code);
  const borderColor = CAT_COLOR[cat] || '#94a3b8';

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col overflow-hidden transition-all hover:shadow-lg ${closed ? 'opacity-70' : ''}`}
      style={{ borderTop: `3px solid ${borderColor}` }}>
      {/* Closed banner */}
      {closed && (
        <div className="bg-red-500 text-white text-[10px] font-bold text-center py-1 tracking-wider">
          ⛔ CLOSED / MATURED FUND
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Top badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: borderColor }}>{cat}</span>
          {subCat && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{subCat}</span>}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ml-auto ${plan === 'Direct' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400' : 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400'}`}>
            {plan === 'Direct' ? '✅ Direct' : plan === 'Regular' ? '⚠️ Regular' : plan}
          </span>
        </div>

        {/* Fund name */}
        <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
          {fund.schemeName}
        </h3>

        {/* 3 key stats */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="text-center bg-slate-50 dark:bg-slate-700/50 rounded-xl p-2">
            <div className="text-[9px] text-slate-400 mb-0.5">Est. Returns</div>
            <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{AVG_RET[cat]}</div>
          </div>
          <div className={`text-center rounded-xl p-2 ${RISK_COLOR[risk]}`}>
            <div className="text-[9px] opacity-70 mb-0.5">Risk</div>
            <div className="text-[11px] font-bold">{risk}</div>
          </div>
          <div className="text-center bg-slate-50 dark:bg-slate-700/50 rounded-xl p-2">
            <div className="text-[9px] text-slate-400 mb-0.5">Min. Horizon</div>
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{HORIZONS[cat]}</div>
          </div>
        </div>

        {/* ER + plan tip */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500 dark:text-slate-400">
            Est. Expense Ratio: <strong className={er > 1 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}>{er}%/yr</strong>
          </span>
          {plan === 'Regular' && (
            <span className="text-orange-600 dark:text-orange-400">⚠️ Higher fee</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-2 border-t border-slate-100 dark:border-slate-700">
          <button onClick={() => onDetails(fund)}
            className="flex-1 text-xs font-bold py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition-all">
            View Details 👁
          </button>
          <button
            onClick={() => setCompareList(p => { const s = p.map(String); if (s.includes(code)) return p.filter(x => String(x) !== code); if (p.length >= 4) return p; return [...p, code]; })}
            className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${isCmp ? 'bg-blue-600 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'}`}>
            {isCmp ? '✓ In Compare' : '+ Compare'}
          </button>
          <button onClick={() => setWatchlist(p => p.map(String).includes(code) ? p.filter(x => String(x) !== code) : [...p, code])}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-all flex-shrink-0 ${isWL ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-amber-500'}`}>
            ⭐
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Screener ───────────────────────────────────────────
export default function Screener() {
  const { funds, loading, error, refetch } = useFunds();
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useLocalStorage('fundlens_watchlist', []);
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);
  const [modalFund, setModalFund] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [cat, setCat] = useState('All');
  const [plan, setPlan] = useState('All');
  const [risk, setRisk] = useState('All');
  const [erMax, setErMax] = useState('All');
  const [amc, setAmc] = useState('All');
  const [showClosed, setShowClosed] = useState(false);
  const [sort, setSort] = useState('az');
  const [page, setPage] = useState(48);

  const clearAll = () => { setSearch(''); setCat('All'); setPlan('All'); setRisk('All'); setErMax('All'); setAmc('All'); setShowClosed(false); };

  const topAMCs = useMemo(() => {
    const m = {};
    for (const f of funds) { const a = extractAMC(f.schemeName); m[a] = (m[a] || 0) + 1; }
    return ['All AMCs', ...Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([a]) => a)];
  }, [funds]);

  const catCounts = useMemo(() => {
    const c = {};
    for (const f of funds) { const x = inferCategory(f.schemeName); c[x] = (c[x] || 0) + 1; }
    return c;
  }, [funds]);

  const filtered = useMemo(() => {
    let list = tab === 'watchlist'
      ? funds.filter(f => watchlist.map(String).includes(String(f.schemeCode)))
      : funds;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.schemeName.toLowerCase().includes(q) || String(f.schemeCode).includes(q));
    }
    if (!showClosed) list = list.filter(f => !isFundClosed(f.schemeName));
    if (cat !== 'All') list = list.filter(f => inferCategory(f.schemeName) === cat);
    if (plan !== 'All') list = list.filter(f => getPlanType(f.schemeName) === plan);
    if (risk !== 'All') list = list.filter(f => RISK[inferCategory(f.schemeName)] === risk);
    if (erMax !== 'All') {
      const maxER = { 'Under 0.3%': 0.3, 'Under 0.5%': 0.5, 'Under 1%': 1.0, 'Under 1.5%': 1.5 }[erMax];
      if (maxER) list = list.filter(f => estimateER(f.schemeName) <= maxER);
    }
    if (amc !== 'All AMCs') list = list.filter(f => extractAMC(f.schemeName) === amc);

    switch (sort) {
      case 'za': return [...list].sort((a, b) => b.schemeName.localeCompare(a.schemeName));
      case 'er_low': return [...list].sort((a, b) => estimateER(a.schemeName) - estimateER(b.schemeName));
      case 'er_high': return [...list].sort((a, b) => estimateER(b.schemeName) - estimateER(a.schemeName));
      case 'newest': return [...list].sort((a, b) => b.schemeCode - a.schemeCode);
      default: return [...list].sort((a, b) => a.schemeName.localeCompare(b.schemeName));
    }
  }, [funds, tab, watchlist, search, showClosed, cat, plan, risk, erMax, amc, sort]);

  const activeCount = useMemo(() => funds.filter(f => !isFundClosed(f.schemeName)).length, [funds]);
  const activeFilters = [search.trim(), cat !== 'All', plan !== 'All', risk !== 'All', erMax !== 'All', amc !== 'All AMCs', showClosed].filter(Boolean).length;

  return (
    <div className="min-h-screen pb-32 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Fund Screener</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {loading ? 'Loading...' : `${activeCount.toLocaleString('en-IN')} active funds · ${funds.length.toLocaleString('en-IN')} total`}
            </p>
          </div>
          {activeFilters > 0 && (
            <button onClick={clearAll} className="text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 rounded-xl font-semibold hover:bg-red-100 transition-all self-start sm:self-auto">
              ✕ Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {error && <ErrorState message={error} onRetry={refetch}/>}

        {/* Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 w-fit">
          {[['all', 'All Funds'], ['watchlist', '⭐ Watchlist']].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
              {l}
              {id === 'watchlist' && watchlist.length > 0 && (
                <span className="ml-1.5 bg-amber-400 text-amber-900 text-[10px] rounded-full px-1.5 font-bold">{watchlist.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by fund name, AMC, or scheme code..."
            className="input-base pl-11 py-3 w-full text-sm"/>
          {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm">✕</button>}
        </div>

        {/* ── Filter Panel ── */}
        {tab === 'all' && (
          <div className="card p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                🎛️ Filters
                {activeFilters > 0 && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">{activeFilters} active</span>}
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="rounded accent-red-500"/>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Show closed funds</span>
              </label>
            </div>

            {/* Category */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Fund Category</label>
              <div className="flex gap-2 flex-wrap">
                {['All', 'Equity', 'Index', 'Hybrid', 'Debt', 'ELSS', 'Liquid'].map(c => (
                  <button key={c} onClick={() => setCat(c)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${cat === c ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                    {c}{c !== 'All' && !loading ? ` (${(catCounts[c] || 0).toLocaleString('en-IN')})` : ''}
                  </button>
                ))}
              </div>
              {cat === 'ELSS' && <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1.5">💡 ELSS = Tax saving under Section 80C. 3 year lock-in. Good returns.</p>}
              {cat === 'Index' && <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1.5">💡 Index funds track Nifty/Sensex. Very low cost. Best for beginners.</p>}
              {cat === 'Liquid' && <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1.5">💡 Liquid funds = safe parking for emergency money. Can withdraw anytime.</p>}
            </div>

            {/* Plan + Risk */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Plan Type</label>
                <div className="flex gap-2">
                  {['All', 'Direct', 'Regular'].map(p => (
                    <button key={p} onClick={() => setPlan(p)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${plan === p ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                      {p === 'Direct' ? '✅ Direct' : p === 'Regular' ? '⚠️ Regular' : 'All'}
                    </button>
                  ))}
                </div>
                {plan === 'Direct' && <p className="text-[10px] text-emerald-600 mt-1">Direct plans save 0.5–1% per year in fees vs Regular.</p>}
                {plan === 'Regular' && <p className="text-[10px] text-orange-600 mt-1">Regular plans include distributor commission — costs you more.</p>}
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Risk Appetite</label>
                <div className="flex gap-2 flex-wrap">
                  {['All', 'Very Low', 'Low', 'Moderate', 'High'].map(r => (
                    <button key={r} onClick={() => setRisk(r)}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${risk === r ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-slate-800 dark:border-white' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ER + AMC + Sort */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Max Expense Ratio</label>
                <select value={erMax} onChange={e => setErMax(e.target.value)} className="input-base py-2.5 text-xs w-full">
                  {['All', 'Under 0.3%', 'Under 0.5%', 'Under 1%', 'Under 1.5%'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Lower = more returns stay with you</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Fund House (AMC)</label>
                <select value={amc} onChange={e => setAmc(e.target.value)} className="input-base py-2.5 text-xs w-full">
                  {topAMCs.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Sort By</label>
                <select value={sort} onChange={e => setSort(e.target.value)} className="input-base py-2.5 text-xs w-full">
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
                <span className="text-sm font-bold text-slate-900 dark:text-white">{filtered.length.toLocaleString('en-IN')} funds found</span>
                <span className="text-xs text-slate-400">matching your filters</span>
                {!showClosed && <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">Active only</span>}
              </div>
            )}
          </div>
        )}

        {/* ── Results ── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array(8).fill(0).map((_, i) => <SkeletonCard key={i}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">🔍</div>
            <p className="font-bold text-slate-700 dark:text-slate-300 mb-2">No funds match your filters</p>
            <p className="text-sm text-slate-400 mb-5">Try removing some filters or search differently</p>
            <button onClick={clearAll} className="btn-secondary px-5 py-2">Clear All Filters</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.slice(0, page).map(fund => (
                <FundCard key={fund.schemeCode} fund={fund}
                  watchlist={watchlist} setWatchlist={setWatchlist}
                  compareList={compareList} setCompareList={setCompareList}
                  onDetails={setModalFund}/>
              ))}
            </div>
            {filtered.length > page && (
              <div className="text-center pt-4">
                <p className="text-xs text-slate-400 mb-2">Showing {Math.min(page, filtered.length)} of {filtered.length.toLocaleString('en-IN')}</p>
                <button onClick={() => setPage(p => p + 48)} className="btn-secondary px-6 py-2.5">Load More Funds</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating compare banner */}
      {compareList.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-blue-600 text-white rounded-2xl px-5 py-3 shadow-2xl shadow-blue-900/40">
            <span className="text-sm font-semibold">{compareList.length}/4 fund{compareList.length > 1 ? 's' : ''} selected</span>
            <button onClick={() => navigate('/compare')} className="bg-white text-blue-600 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all">
              Compare Now →
            </button>
            <button onClick={() => setCompareList([])} className="text-blue-200 hover:text-white text-xs">✕</button>
          </div>
        </div>
      )}

      {modalFund && (
        <FundDetailModal
          schemeCode={modalFund.schemeCode}
          schemeName={modalFund.schemeName}
          onClose={() => setModalFund(null)}
        />
      )}
    </div>
  );
}
