import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFunds } from '../hooks/useFunds';
import { useLocalStorage } from '../hooks/useLocalStorage';
import SkeletonCard from '../components/SkeletonCard';
import ErrorState from '../components/ErrorState';
import { inferCategory, GOALS, matchesGoal } from '../utils/goalFilters';
import { extractAMC, getPlanType, getFundType, estimateER, getERBand, filterFunds } from '../utils/fundFilters';

const CATS = ['All','Equity','Debt','Hybrid','ELSS','Index','Liquid'];
const ER_BANDS = ['All','Ultra Low (<0.3%)','Low (0.3–0.7%)','Medium (0.7–1.2%)','High (>1.2%)'];
const FUND_TYPES = ['All','Growth','IDCW/Dividend'];
const PLAN_TYPES = ['All','Direct','Regular'];
const RISK_LEVELS = { Equity:'High', ELSS:'High', Hybrid:'Medium', Index:'Medium', Debt:'Low', Liquid:'Very Low', Other:'Medium' };
const EXP_RETURNS = { Equity:'12–15%', ELSS:'12–15%', Index:'11–13%', Hybrid:'9–12%', Debt:'6–8%', Liquid:'4–6%', Other:'8–12%' };
const SORTS = [
  {v:'az',l:'Name A → Z'},{v:'za',l:'Name Z → A'},
  {v:'er_low',l:'Expense Ratio: Low First'},{v:'er_high',l:'Expense Ratio: High First'},
  {v:'newest',l:'Newest Funds First'},{v:'oldest',l:'Oldest Funds First'},
];

const CC = {
  Equity:{b:'#3b82f6',bg:'bg-blue-50 dark:bg-blue-950',t:'text-blue-700 dark:text-blue-300'},
  Debt:{b:'#10b981',bg:'bg-emerald-50 dark:bg-emerald-950',t:'text-emerald-700 dark:text-emerald-300'},
  Hybrid:{b:'#f59e0b',bg:'bg-amber-50 dark:bg-amber-950',t:'text-amber-700 dark:text-amber-300'},
  ELSS:{b:'#8b5cf6',bg:'bg-purple-50 dark:bg-purple-950',t:'text-purple-700 dark:text-purple-300'},
  Index:{b:'#6366f1',bg:'bg-indigo-50 dark:bg-indigo-950',t:'text-indigo-700 dark:text-indigo-300'},
  Liquid:{b:'#14b8a6',bg:'bg-teal-50 dark:bg-teal-950',t:'text-teal-700 dark:text-teal-300'},
  Other:{b:'#94a3b8',bg:'bg-slate-50 dark:bg-slate-800',t:'text-slate-600 dark:text-slate-400'},
};

function FundCard({ fund, watchlist, setWatchlist, compareList, setCompareList }) {
  const c = String(fund.schemeCode);
  const cat = inferCategory(fund.schemeName);
  const plan = getPlanType(fund.schemeName);
  const ft = getFundType(fund.schemeName);
  const er = estimateER(fund.schemeName);
  const cc = CC[cat]||CC.Other;
  const isWL = watchlist.map(String).includes(c);
  const isCmp = compareList.map(String).includes(c);
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 flex flex-col gap-2.5 hover:shadow-md transition-all border-l-[3px]" style={{borderLeftColor:cc.b}}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex gap-1 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cc.bg} ${cc.t}`}>{cat}</span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${plan==='Direct'?'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300':'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300'}`}>{plan}</span>
          {ft!=='Other'&&<span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{ft}</span>}
        </div>
        <span className="text-[9px] text-slate-400 font-mono flex-shrink-0">#{c}</span>
      </div>
      <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">{fund.schemeName}</p>
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div className="bg-slate-50 dark:bg-slate-700 rounded p-1.5 text-center"><div className="text-slate-400">Est. ER</div><div className="font-bold text-orange-600">{er}%</div></div>
        <div className="bg-slate-50 dark:bg-slate-700 rounded p-1.5 text-center"><div className="text-slate-400">Avg Return</div><div className="font-bold text-emerald-600">{EXP_RETURNS[cat]}</div></div>
        <div className="bg-slate-50 dark:bg-slate-700 rounded p-1.5 text-center"><div className="text-slate-400">Risk</div><div className="font-bold text-blue-600">{RISK_LEVELS[cat]}</div></div>
      </div>
      {plan==='Regular'&&<p className="text-[9px] text-orange-600 bg-orange-50 dark:bg-orange-950 px-2 py-1 rounded">⚠️ Regular plan — higher fees than Direct</p>}
      <div className="flex gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700 mt-auto">
        <Link to={`/compare?code=${c}`} className="flex-1 text-center text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg transition-all">Analyse →</Link>
        <button onClick={()=>setWatchlist(p=>p.map(String).includes(c)?p.filter(x=>String(x)!==c):[...p,c])}
          className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-all ${isWL?'bg-amber-100 dark:bg-amber-900 text-amber-600':'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-amber-500'}`}>⭐</button>
        <button onClick={()=>setCompareList(p=>{const s=p.map(String);if(s.includes(c))return p.filter(x=>String(x)!==c);if(p.length>=4)return p;return[...p,c];})}
          className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-all ${isCmp?'bg-blue-100 dark:bg-blue-900 text-blue-600':'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-blue-500'}`}>⚖️</button>
      </div>
    </div>
  );
}

export default function Screener() {
  const { funds, loading, error, refetch } = useFunds();
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useLocalStorage('fundlens_watchlist', []);
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [plan, setPlan] = useState('All');
  const [ft, setFt] = useState('All');
  const [erBand, setErBand] = useState('All');
  const [amc, setAmc] = useState('All');
  const [risk, setRisk] = useState('All');
  const [selGoals, setSelGoals] = useState([]);
  const [sort, setSort] = useState('az');
  const [pageSize, setPageSize] = useState(60);
  const toggleGoal = g => setSelGoals(p => p.includes(g) ? p.filter(x=>x!==g) : [...p,g]);

  const topAMCs = useMemo(() => {
    const m = {};
    for (const f of funds) { const a = extractAMC(f.schemeName); m[a]=(m[a]||0)+1; }
    return ['All', ...Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([a])=>a)];
  }, [funds]);

  const catStats = useMemo(() => {
    const c = {};
    for (const f of funds) { const x=inferCategory(f.schemeName); c[x]=(c[x]||0)+1; }
    return c;
  }, [funds]);

  const filtered = useMemo(() => {
    let list = tab==='watchlist' ? funds.filter(f=>watchlist.map(String).includes(String(f.schemeCode))) : funds;
    if (search.trim()) { const q=search.toLowerCase(); list=list.filter(f=>f.schemeName.toLowerCase().includes(q)); }
    if (tab!=='watchlist') {
      if (cat!=='All') list=list.filter(f=>inferCategory(f.schemeName)===cat);
      if (plan!=='All') list=list.filter(f=>getPlanType(f.schemeName)===plan);
      if (ft!=='All') list=list.filter(f=>getFundType(f.schemeName)===ft);
      if (erBand!=='All') list=list.filter(f=>getERBand(estimateER(f.schemeName))===erBand);
      if (amc!=='All') list=list.filter(f=>extractAMC(f.schemeName)===amc);
      if (risk!=='All') list=list.filter(f=>RISK_LEVELS[inferCategory(f.schemeName)]===risk);
      if (selGoals.length>0) list=list.filter(f=>selGoals.some(g=>matchesGoal(f,g)));
    }
    switch(sort) {
      case 'za': return [...list].sort((a,b)=>b.schemeName.localeCompare(a.schemeName));
      case 'er_low': return [...list].sort((a,b)=>estimateER(a.schemeName)-estimateER(b.schemeName));
      case 'er_high': return [...list].sort((a,b)=>estimateER(b.schemeName)-estimateER(a.schemeName));
      case 'newest': return [...list].sort((a,b)=>b.schemeCode-a.schemeCode);
      case 'oldest': return [...list].sort((a,b)=>a.schemeCode-b.schemeCode);
      default: return [...list].sort((a,b)=>a.schemeName.localeCompare(b.schemeName));
    }
  }, [funds, tab, watchlist, search, cat, plan, ft, erBand, amc, risk, selGoals, sort]);

  const activeFilters = [search.trim(),cat!=='All',plan!=='All',ft!=='All',erBand!=='All',amc!=='All',risk!=='All',...selGoals].filter(Boolean).length;
  const clearAll = () => { setSearch('');setCat('All');setPlan('All');setFt('All');setErBand('All');setAmc('All');setRisk('All');setSelGoals([]); };

  return (
    <div className="min-h-screen pb-32 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Fund Screener</h1>
            <p className="text-sm text-slate-500 mt-0.5">{funds.length.toLocaleString('en-IN')}+ funds with live filters</p>
          </div>
          {activeFilters>0 && <button onClick={clearAll} className="text-xs text-red-600 border border-red-200 bg-red-50 dark:bg-red-950 px-3 py-1.5 rounded-lg font-semibold">✕ Clear {activeFilters} filter{activeFilters>1?'s':''}</button>}
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 w-fit">
          {[['all','All Funds'],['watchlist','⭐ Watchlist']].map(([id,l])=>(
            <button key={id} onClick={()=>setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab===id?'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm':'text-slate-500'}`}>
              {l}{id==='watchlist'&&watchlist.length>0&&<span className="ml-1.5 bg-amber-400 text-amber-900 text-xs rounded-full px-1.5 py-0.5 font-bold">{watchlist.length}</span>}
            </button>
          ))}
        </div>

        {error && <ErrorState message={error} onRetry={refetch}/>}

        {!error && <>
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z"/></svg>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search fund name, AMC, or scheme code..." className="input-base pl-10 py-3 w-full text-sm"/>
            {search&&<button onClick={()=>setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>}
          </div>

          {/* Filter Panel */}
          {tab==='all' && (
            <div className="card p-4 space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">🎛️ Advanced Filters {activeFilters>0&&<span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">{activeFilters} active</span>}</h3>

              {/* Category with counts */}
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 block">Category</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CATS.map(c=>(
                    <button key={c} onClick={()=>setCat(c)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${cat===c?'bg-blue-600 text-white border-blue-600':'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                      {c}{c!=='All'&&!loading?` (${(catStats[c]||0).toLocaleString('en-IN')})`:''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row: Plan + Fund Type + Risk */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 block">Plan Type</label>
                  <div className="flex gap-1.5">
                    {PLAN_TYPES.map(p=>(
                      <button key={p} onClick={()=>setPlan(p)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${plan===p?'bg-emerald-600 text-white border-emerald-600':'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                        {p==='Direct'?'✅ Direct':p==='Regular'?'⚠️ Regular':'All'}
                      </button>
                    ))}
                  </div>
                  {plan==='Regular'&&<p className="text-[9px] text-orange-600 mt-1">Higher fees — prefer Direct plans</p>}
                  {plan==='Direct'&&<p className="text-[9px] text-emerald-600 mt-1">Saves 0.5–1% per year vs Regular</p>}
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 block">Fund Type</label>
                  <div className="flex gap-1.5">
                    {FUND_TYPES.map(t=>(
                      <button key={t} onClick={()=>setFt(t)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${ft===t?'bg-indigo-600 text-white border-indigo-600':'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                        {t==='Growth'?'📈 Growth':t==='IDCW/Dividend'?'💰 IDCW':'All'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 block">Risk Level</label>
                  <div className="flex gap-1 flex-wrap">
                    {['All','Very Low','Low','Medium','High'].map(r=>(
                      <button key={r} onClick={()=>setRisk(r)}
                        className={`px-2 py-1 text-[10px] font-semibold rounded-lg border transition-all ${risk===r?'bg-red-500 text-white border-red-500':'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row: ER Band + AMC + Sort */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 block">Est. Expense Ratio</label>
                  <select value={erBand} onChange={e=>setErBand(e.target.value)} className="input-base w-full py-2 text-xs">
                    {ER_BANDS.map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                  <p className="text-[9px] text-slate-400 mt-1">Lower ER = more returns in your pocket</p>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 block">Fund House (AMC)</label>
                  <select value={amc} onChange={e=>setAmc(e.target.value)} className="input-base w-full py-2 text-xs">
                    {topAMCs.map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 block">Sort By</label>
                  <select value={sort} onChange={e=>setSort(e.target.value)} className="input-base w-full py-2 text-xs">
                    {SORTS.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
              </div>

              {/* Goals */}
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 block">Investment Goal</label>
                <div className="flex gap-1.5 flex-wrap">
                  {GOALS.map(g=>(
                    <button key={g.id} onClick={()=>toggleGoal(g.id)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${selGoals.includes(g.id)?'bg-violet-600 text-white border-violet-600':'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                      {g.icon} {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter Summary */}
              {!loading && (
                <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{filtered.length.toLocaleString('en-IN')} funds match</span>
                  {cat!=='All'&&<span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{cat}</span>}
                  {plan!=='All'&&<span className="text-xs bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">{plan}</span>}
                  {erBand!=='All'&&<span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">ER: {erBand}</span>}
                  {risk!=='All'&&<span className="text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">Risk: {risk}</span>}
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array(8).fill(0).map((_,i)=><SkeletonCard key={i}/>)}
            </div>
          ) : filtered.length===0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">🔍</div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">No funds match</p>
              <p className="text-sm text-slate-400 mb-4">Try removing some filters</p>
              <button onClick={clearAll} className="btn-secondary px-5 py-2 text-sm">Clear All Filters</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.slice(0,pageSize).map(fund=>(
                  <FundCard key={fund.schemeCode} fund={fund} watchlist={watchlist} setWatchlist={setWatchlist} compareList={compareList} setCompareList={setCompareList}/>
                ))}
              </div>
              {filtered.length>pageSize&&(
                <div className="text-center pt-4 space-y-1">
                  <p className="text-xs text-slate-400">Showing {Math.min(pageSize,filtered.length)} of {filtered.length.toLocaleString('en-IN')}</p>
                  <button onClick={()=>setPageSize(p=>p+60)} className="btn-secondary px-6 py-2 text-sm">Load More</button>
                </div>
              )}
            </>
          )}
        </>}
      </div>

      {compareList.length>0&&(
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-blue-600 text-white rounded-2xl px-5 py-3 shadow-2xl">
            <span className="text-sm font-semibold">{compareList.length} fund{compareList.length>1?'s':''} selected</span>
            <button onClick={()=>navigate('/compare')} className="bg-white text-blue-600 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-blue-50">Compare Now →</button>
            <button onClick={()=>setCompareList([])} className="text-blue-200 hover:text-white text-xs">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
