import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFunds } from '../hooks/useFunds';
import { useLocalStorage } from '../hooks/useLocalStorage';
import SkeletonCard from '../components/SkeletonCard';
import ErrorState from '../components/ErrorState';
import { inferCategory, GOALS, matchesGoal } from '../utils/goalFilters';
import { extractAMC, getPlanType, getFundType, estimateER, getERBand, filterFunds } from '../utils/fundFilters';

const CATEGORIES = ['All','Equity','Debt','Hybrid','ELSS','Index','Liquid'];
const ER_BANDS = ['All','Ultra Low (<0.3%)','Low (0.3–0.7%)','Medium (0.7–1.2%)','High (>1.2%)'];
const FUND_TYPES = ['All','Growth','IDCW/Dividend'];
const PLAN_TYPES = ['All','Direct','Regular'];

const CAT_COLOR = {
  Equity:'#3b82f6',Debt:'#10b981',Hybrid:'#f59e0b',ELSS:'#8b5cf6',
  Index:'#6366f1',Liquid:'#14b8a6',Other:'#94a3b8',
};

function MiniCard({ fund, compareList, setCompareList, watchlist, setWatchlist }) {
  const codeStr = String(fund.schemeCode);
  const cat = inferCategory(fund.schemeName);
  const plan = getPlanType(fund.schemeName);
  const er = estimateER(fund.schemeName);
  const isWL = watchlist.map(String).includes(codeStr);
  const isCmp = compareList.map(String).includes(codeStr);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 flex flex-col gap-2 hover:shadow-md transition-all border-l-[3px]" style={{borderLeftColor: CAT_COLOR[cat]||'#94a3b8'}}>
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{cat}</span>
        <div className="flex gap-1">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${plan==='Direct'?'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300':'plan'==='Regular'?'bg-orange-100 text-orange-700':'bg-slate-100 text-slate-500'}`}>{plan}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-semibold">ER ~{er}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-800 dark:text-white line-clamp-2 leading-snug">{fund.schemeName}</p>
      <div className="flex gap-1.5 mt-auto pt-2 border-t border-slate-100 dark:border-slate-700">
        <Link to={`/compare?code=${codeStr}`} className="flex-1 text-center text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg transition-all">Analyse →</Link>
        <button onClick={()=>setWatchlist(p=>p.map(String).includes(codeStr)?p.filter(c=>String(c)!==codeStr):[...p,codeStr])}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${isWL?'bg-amber-100 dark:bg-amber-900 text-amber-600':'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-amber-500'}`}>⭐</button>
        <button onClick={()=>setCompareList(p=>{const s=p.map(String);if(s.includes(codeStr))return p.filter(c=>String(c)!==codeStr);if(p.length>=4)return p;return[...p,codeStr];})}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${isCmp?'bg-blue-100 dark:bg-blue-900 text-blue-600':'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-blue-500'}`}>⚖️</button>
      </div>
    </div>
  );
}

function QuickCalc() {
  const [amt,setAmt]=useState(5000);
  const [yrs,setYrs]=useState(10);
  const [rate,setRate]=useState(12);
  const mat=Math.round(amt*((Math.pow(1+rate/100/12,yrs*12)-1)/(rate/100/12))*(1+rate/100/12));
  const inv=amt*yrs*12;
  const fmt=n=>n>=10000000?`₹${(n/10000000).toFixed(2)}Cr`:n>=100000?`₹${(n/100000).toFixed(1)}L`:`₹${n.toLocaleString('en-IN')}`;
  return (
    <div className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-100 dark:border-blue-900">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><span>🧮</span> Quick SIP Calculator</h3>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[['Monthly ₹',amt,setAmt,100,200000],['Years',yrs,setYrs,1,40],['Return %',rate,setRate,1,30]].map(([l,v,s,mn,mx])=>(
          <div key={l}><label className="text-[10px] text-slate-500 block mb-1">{l}</label>
          <input type="number" value={v} onChange={e=>s(Math.max(mn,Math.min(mx,+e.target.value)))} className="input-base w-full py-1.5 text-sm text-center font-semibold"/></div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-2"><div className="text-[10px] text-slate-400">Invested</div><div className="font-bold text-sm">{fmt(inv)}</div></div>
        <div className="bg-emerald-50 dark:bg-emerald-950 rounded-lg p-2 border border-emerald-100 dark:border-emerald-900"><div className="text-[10px] text-emerald-600">Returns</div><div className="font-bold text-sm text-emerald-600">+{fmt(mat-inv)}</div></div>
        <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2 border border-blue-100 dark:border-blue-900"><div className="text-[10px] text-blue-600">Total</div><div className="font-bold text-sm text-blue-700">{fmt(mat)}</div></div>
      </div>
      <Link to="/sip" className="btn-primary block text-center text-xs py-2">Full SIP Calculator with Step-Up →</Link>
    </div>
  );
}

export default function Dashboard() {
  const { funds, loading, error, refetch } = useFunds();
  const navigate = useNavigate();
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);
  const [watchlist, setWatchlist] = useLocalStorage('fundlens_watchlist', []);

  // Fund Finder state
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [planType, setPlanType] = useState('All');
  const [fundType, setFundType] = useState('All');
  const [erBand, setErBand] = useState('All');
  const [amc, setAmc] = useState('All');
  const [selGoals, setSelGoals] = useState([]);
  const [pageSize, setPageSize] = useState(12);
  const [showFinder, setShowFinder] = useState(true);

  const toggleGoal = g => setSelGoals(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g]);

  const topAMCs = useMemo(() => {
    const counts = {};
    for (const f of funds) {
      const a = extractAMC(f.schemeName);
      counts[a] = (counts[a] || 0) + 1;
    }
    return ['All', ...Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([a])=>a)];
  }, [funds]);

  const filtered = useMemo(() =>
    filterFunds(funds, { search, category, planType, fundType, erBand, amc, goals: selGoals, matchesGoal }),
    [funds, search, category, planType, fundType, erBand, amc, selGoals]
  );

  const activeFilters = [search.trim(), category!=='All', planType!=='All', fundType!=='All', erBand!=='All', amc!=='All', selGoals.length>0].filter(Boolean).length;

  const clearAll = () => { setSearch(''); setCategory('All'); setPlanType('All'); setFundType('All'); setErBand('All'); setAmc('All'); setSelGoals([]); };

  const catStats = useMemo(() => {
    const c = {};
    for (const f of funds) { const cat = inferCategory(f.schemeName); c[cat]=(c[cat]||0)+1; }
    return c;
  }, [funds]);

  return (
    <div className="min-h-screen pb-20 md:pb-8">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-blue-950 dark:via-slate-900 dark:to-indigo-950 pt-24 pb-14 px-4 md:pt-28">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 opacity-5 rounded-full -translate-y-1/2 translate-x-1/2"/>
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/50 dark:bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-5 border border-slate-200 dark:border-white/20 shadow-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/><span className="text-slate-700 dark:text-slate-300">Live data · {funds.length.toLocaleString('en-IN')}+ funds</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-slate-900 dark:text-white">Analyse. Compare.<br/><span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">Invest Smarter.</span></h1>
          <p className="text-slate-600 dark:text-slate-300 text-base mb-6 max-w-xl mx-auto">India's most comprehensive mutual fund analysis platform. Free forever.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/screener" className="btn-primary px-6 py-3 shadow-lg">Browse All Funds →</Link>
            <Link to="/compare" className="bg-white/60 dark:bg-white/10 border border-slate-200 dark:border-white/30 text-slate-900 dark:text-white font-semibold px-5 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/20 transition-all">Compare Funds</Link>
            <Link to="/sip" className="bg-white/60 dark:bg-white/10 border border-slate-200 dark:border-white/30 text-slate-900 dark:text-white font-semibold px-5 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/20 transition-all">SIP Calculator</Link>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {error && <ErrorState message={error} onRetry={refetch}/>}

        {/* Quick SIP + Guide */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <QuickCalc/>
          <div className="card p-5">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><span>🎯</span> Which Fund for Which Goal?</h3>
            <div className="space-y-2.5">
              {[
                ['Emergency Fund','Liquid Fund','0–6 months','Very Low','teal'],
                ['Short-term (1–3Y)','Debt Fund','1–3 years','Low','emerald'],
                ['Tax Saving (80C)','ELSS Fund','3+ years','Medium','purple'],
                ['Long-term Wealth','Equity Fund','7+ years','High','blue'],
                ['Passive Investing','Index Fund','10+ years','Medium','indigo'],
              ].map(([goal,type,horizon,risk,c])=>(
                <div key={goal} className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div><div className="font-semibold text-slate-700 dark:text-slate-300">{goal}</div><div className="text-slate-400">{horizon}</div></div>
                  <div className="text-right"><div className={`font-bold text-${c}-600 dark:text-${c}-400`}>{type}</div><div className="text-slate-400">Risk: {risk}</div></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FUND FINDER ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">🔍 Fund Finder
                {activeFilters > 0 && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">{activeFilters} filter{activeFilters>1?'s':''}</span>}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Filter {funds.length.toLocaleString('en-IN')}+ funds with live results</p>
            </div>
            <div className="flex gap-2">
              {activeFilters > 0 && <button onClick={clearAll} className="text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-100 transition-all">✕ Clear All</button>}
            </div>
          </div>

          {/* Filter Panel */}
          <div className="card p-4 mb-5 space-y-4">
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z"/></svg>
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by fund name, AMC..." className="input-base pl-10 py-2.5 w-full"/>
              {search && <button onClick={()=>setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">✕</button>}
            </div>

            {/* Row 1: Category + Plan + Fund Type */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* Category pills */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-6">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 block">Category</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map(c=>(
                    <button key={c} onClick={()=>setCategory(c)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${category===c?'bg-blue-600 text-white border-blue-600':'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                      {c}{c!=='All'&&!loading?<span className="ml-1 opacity-70">({(catStats[c]||0).toLocaleString('en-IN')})</span>:null}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Plan + Fund Type + ER Band */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 block">Plan Type</label>
                <div className="flex gap-1.5">
                  {PLAN_TYPES.map(p=>(
                    <button key={p} onClick={()=>setPlanType(p)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${planType===p?'bg-emerald-600 text-white border-emerald-600':'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                      {p==='Direct'?'✅ Direct':p==='Regular'?'⚠️ Regular':'All'}
                    </button>
                  ))}
                </div>
                {planType==='Regular'&&<p className="text-[9px] text-orange-600 mt-1">⚠️ Regular plans have higher fees. Prefer Direct.</p>}
                {planType==='Direct'&&<p className="text-[9px] text-emerald-600 mt-1">✅ Direct plans save 0.5–1% per year in fees.</p>}
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 block">Fund Type</label>
                <div className="flex gap-1.5">
                  {FUND_TYPES.map(t=>(
                    <button key={t} onClick={()=>setFundType(t)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${fundType===t?'bg-indigo-600 text-white border-indigo-600':'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                      {t==='Growth'?'📈 Growth':t==='IDCW/Dividend'?'💰 IDCW':'All'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 block">Est. Expense Ratio</label>
                <select value={erBand} onChange={e=>setErBand(e.target.value)} className="input-base w-full py-2 text-xs">
                  {ER_BANDS.map(b=><option key={b} value={b}>{b}</option>)}
                </select>
                <p className="text-[9px] text-slate-400 mt-1">Lower ER = more returns for you</p>
              </div>
            </div>

            {/* AMC Filter */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 block">Fund House (AMC)</label>
              <select value={amc} onChange={e=>setAmc(e.target.value)} className="input-base py-2 text-xs sm:w-64">
                {topAMCs.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Goal filter */}
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 block">Investment Goal</label>
              <div className="flex gap-1.5 flex-wrap">
                {GOALS.map(g=>(
                  <button key={g.id} onClick={()=>toggleGoal(g.id)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all ${selGoals.includes(g.id)?'bg-violet-600 text-white border-violet-600':'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                    {g.icon} {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{filtered.length.toLocaleString('en-IN')} funds found</span>
              {activeFilters > 0 && <span className="text-xs text-slate-400 ml-2">matching your filters</span>}
            </div>
            {filtered.length > 0 && compareList.length > 0 && (
              <button onClick={()=>navigate('/compare')} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">
                Compare {compareList.length} fund{compareList.length>1?'s':''} →
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array(8).fill(0).map((_,i)=><SkeletonCard key={i}/>)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">No funds match your filters</p>
              <p className="text-sm text-slate-400 mb-4">Try removing some filters to see more results</p>
              <button onClick={clearAll} className="btn-secondary text-sm px-4 py-2">Clear All Filters</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.slice(0, pageSize).map(fund=>(
                  <MiniCard key={fund.schemeCode} fund={fund} compareList={compareList} setCompareList={setCompareList} watchlist={watchlist} setWatchlist={setWatchlist}/>
                ))}
              </div>
              {filtered.length > pageSize && (
                <div className="text-center mt-6 space-y-2">
                  <p className="text-xs text-slate-400">Showing {Math.min(pageSize, filtered.length)} of {filtered.length.toLocaleString('en-IN')} funds</p>
                  <button onClick={()=>setPageSize(p=>p+12)} className="btn-secondary px-6 py-2 text-sm">Load More</button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Tips */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><span>💡</span> Smart Investing Tips</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ['📅','Start Early','₹5,000/month at 25 grows to ₹3.5 Cr by 60. Starting at 35 gives only ₹1 Cr. Time is your biggest advantage.'],
              ['💸','Choose Direct Plans','Direct plans save 0.5–1% per year. On ₹10L over 20 years, this can mean ₹5–10 Lakh extra in your pocket.'],
              ['🔁','Step-Up SIP Annually','Increase SIP by 10% each year. ₹5,000/month with 10% step-up grows to ₹11 Cr vs ₹3.5 Cr over 30 years.'],
            ].map(([icon,title,body])=>(
              <div key={title} className="card p-5 hover:shadow-md transition-shadow">
                <div className="text-2xl mb-2">{icon}</div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">{title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA strip */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {t:'SIP Calculator',d:'Step-up, inflation-adjusted projections.',cta:'Open →',to:'/sip',g:'from-blue-600 to-indigo-600'},
            {t:'Compare Funds',d:'Side-by-side NAV, rolling returns, XIRR.',cta:'Compare →',to:'/compare',g:'from-emerald-600 to-teal-600'},
            {t:'Full Screener',d:'Advanced search across all 18,000+ funds.',cta:'Explore →',to:'/screener',g:'from-purple-600 to-violet-600'},
          ].map(c=>(
            <div key={c.t} className={`rounded-2xl bg-gradient-to-br ${c.g} p-5 text-white`}>
              <h3 className="font-bold text-base mb-1">{c.t}</h3>
              <p className="text-sm opacity-80 mb-4">{c.d}</p>
              <Link to={c.to} className="bg-white/20 hover:bg-white/30 border border-white/30 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-all inline-block">{c.cta}</Link>
            </div>
          ))}
        </section>
      </div>

      {/* Floating compare banner */}
      {compareList.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-blue-600 text-white rounded-2xl px-5 py-3 shadow-2xl shadow-blue-900/40">
            <span className="text-sm font-semibold">{compareList.length} fund{compareList.length>1?'s':''} selected</span>
            <button onClick={()=>navigate('/compare')} className="bg-white text-blue-600 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-blue-50">Compare Now →</button>
            <button onClick={()=>setCompareList([])} className="text-blue-200 hover:text-white text-xs">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
