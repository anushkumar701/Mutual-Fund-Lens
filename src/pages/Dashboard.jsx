import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFunds } from '../hooks/useFunds';
import { useLocalStorage } from '../hooks/useLocalStorage';
import ErrorState from '../components/ErrorState';
import FundDetailModal from '../components/FundDetailModal';
import { inferCategory } from '../utils/goalFilters';

const CAT = {
  Equity: { e:'📈', b:'#3b82f6', bg:'bg-blue-50 dark:bg-blue-950', t:'text-blue-700 dark:text-blue-300', d:'Long-term wealth. Best for 7+ years.' },
  Debt:   { e:'🏛️', b:'#10b981', bg:'bg-emerald-50 dark:bg-emerald-950', t:'text-emerald-700 dark:text-emerald-300', d:'Stable returns. Good for 1–3 years.' },
  Hybrid: { e:'⚖️', b:'#f59e0b', bg:'bg-amber-50 dark:bg-amber-950', t:'text-amber-700 dark:text-amber-300', d:'Balanced equity & debt exposure.' },
  ELSS:   { e:'🧾', b:'#8b5cf6', bg:'bg-purple-50 dark:bg-purple-950', t:'text-purple-700 dark:text-purple-300', d:'Tax saving under 80C. 3-yr lock-in.' },
  Index:  { e:'📊', b:'#6366f1', bg:'bg-indigo-50 dark:bg-indigo-950', t:'text-indigo-700 dark:text-indigo-300', d:'Low cost. Tracks Nifty/Sensex.' },
  Liquid: { e:'💧', b:'#14b8a6', bg:'bg-teal-50 dark:bg-teal-950', t:'text-teal-700 dark:text-teal-300', d:'Like savings account. Emergency fund.' },
  Other:  { e:'📁', b:'#94a3b8', bg:'bg-slate-50 dark:bg-slate-800', t:'text-slate-600 dark:text-slate-400', d:'Specialty & other funds.' },
};

const GLOSSARY = [
  { e:'💹', t:'NAV', d:'Price of 1 fund unit. Updated daily after market close.' },
  { e:'🔄', t:'SIP', d:'Invest fixed amount monthly. Averages out market ups and downs.' },
  { e:'📈', t:'CAGR', d:'Annualised return. Better than absolute % for fair comparison.' },
  { e:'💸', t:'Expense Ratio', d:'Annual fund fee. Lower is better. Direct plans charge less.' },
  { e:'✅', t:'Direct Plan', d:'No distributor commission. Always prefer Direct over Regular.' },
  { e:'⚠️', t:'Regular Plan', d:'Includes distributor fee (~0.5–1% extra). Costs lakhs over time.' },
  { e:'🧾', t:'ELSS', d:'Tax-saving equity fund. ₹1.5L deduction under 80C. 3-yr lock-in.' },
  { e:'🚪', t:'Exit Load', d:'Penalty for early redemption. Usually 1% if exit within 1 year.' },
  { e:'📐', t:'Sharpe Ratio', d:'Risk-adjusted return. Above 1 = good. Above 2 = excellent.' },
  { e:'🔁', t:'Rolling Returns', d:'Return for every possible start date. More reliable than point-to-point.' },
  { e:'🔥', t:'FIRE', d:'Financial Independence Retire Early. Corpus = 25× annual expenses.' },
  { e:'🏦', t:'AUM', d:'Total money the fund manages. Higher AUM = more trust and stability.' },
];

function QuickCalc() {
  const [amt,setAmt]=useState(5000),[yrs,setYrs]=useState(10),[rate,setRate]=useState(12);
  const mat=Math.round(amt*((Math.pow(1+rate/100/12,yrs*12)-1)/(rate/100/12))*(1+rate/100/12));
  const inv=amt*yrs*12;
  const fmt=n=>n>=10000000?`₹${(n/10000000).toFixed(2)} Cr`:n>=100000?`₹${(n/100000).toFixed(1)} L`:`₹${n.toLocaleString('en-IN')}`;
  return (
    <div className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-100 dark:border-blue-900">
      <h3 className="font-bold text-slate-900 dark:text-white mb-4">🧮 Quick SIP Calculator</h3>
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
      <Link to="/sip" className="btn-primary block text-center text-xs py-2">Full Calculator with Step-Up, FIRE & Tax →</Link>
    </div>

  );
}

export default function Dashboard() {
  const { funds, loading, error, refetch } = useFunds();
  const [watchlist] = useLocalStorage('fundlens_watchlist', []);
  const [modalFund, setModalFund] = useState(null);

  const catStats = useMemo(() => {
    const c = {};
    for (const f of funds) { const cat = inferCategory(f.schemeName); c[cat]=(c[cat]||0)+1; }
    return c;
  }, [funds]);

  const watchlistFunds = useMemo(() =>
    watchlist.map(code => funds.find(f => String(f.schemeCode) === String(code))).filter(Boolean).slice(0, 4),
    [watchlist, funds]
  );

  return (
    <div className="min-h-screen pb-20 md:pb-8">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-blue-950 dark:via-slate-900 dark:to-indigo-950 pt-24 pb-14 px-4 md:pt-28">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 opacity-5 rounded-full -translate-y-1/2 translate-x-1/2"/>
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/50 dark:bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-5 border border-slate-200 dark:border-white/20 shadow-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/>
            <span className="text-slate-700 dark:text-slate-300">Live data · {loading ? '...' : `${funds.length.toLocaleString('en-IN')}+`} funds</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-slate-900 dark:text-white">
            Analyse. Compare.<br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">Invest Smarter.</span>
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-base mb-6 max-w-xl mx-auto">India's most comprehensive mutual fund analysis platform. Free forever.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/screener" className="btn-primary px-6 py-3 shadow-lg">🔍 Find Best Funds →</Link>
            <Link to="/compare" className="bg-white/60 dark:bg-white/10 border border-slate-200 dark:border-white/30 text-slate-900 dark:text-white font-semibold px-5 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/20 transition-all">⚖️ Compare Funds</Link>
            <Link to="/sip" className="bg-white/60 dark:bg-white/10 border border-slate-200 dark:border-white/30 text-slate-900 dark:text-white font-semibold px-5 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/20 transition-all">🔥 SIP + FIRE Calc</Link>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {error && <ErrorState message={error} onRetry={refetch}/>}

        {/* Quick Calc + Guide */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <QuickCalc/>
          <div className="card p-5">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4">🎯 Which Fund for Which Goal?</h3>
            <div className="space-y-2.5">
              {[
                ['Emergency Fund','Liquid Fund','0–6 months','Very Low','teal'],
                ['Short-term Goal','Debt Fund','1–3 years','Low','emerald'],
                ['Tax Saving (80C)','ELSS Fund','3+ years','Medium','purple'],
                ['Long-term Wealth','Equity Fund','7+ years','High','blue'],
                ['FIRE / Retirement','Index Fund','20+ years','Medium','indigo'],
              ].map(([goal,type,horizon,risk,c])=>(
                <div key={goal} className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div><div className="font-semibold text-slate-700 dark:text-slate-300">{goal}</div><div className="text-slate-400">{horizon}</div></div>
                  <div className="text-right">
                    <div className={`font-bold text-${c}-600 dark:text-${c}-400`}>{type}</div>
                    <div className="text-slate-400">Risk: {risk}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/screener" className="btn-secondary w-full text-center text-xs py-2 mt-4 block">Find Funds by Goal →</Link>
          </div>
        </section>

        {/* Category cards */}
        {!error && !loading && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Browse by Category</h2>
                <p className="text-xs text-slate-500 mt-0.5">Click to explore funds in Screener</p>
              </div>
              <Link to="/screener" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline">View All →</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {['Equity','ELSS','Index','Hybrid','Debt','Liquid','Other'].map(cat => {
                const cfg = CAT[cat]||CAT.Other;
                const count = catStats[cat]||0;
                if (!count) return null;
                return (
                  <Link key={cat} to={`/screener?cat=${cat}`}
                    className={`rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${cfg.bg}`}
                    style={{borderColor: cfg.b+'30'}}>
                    <div className="text-2xl mb-2">{cfg.e}</div>
                    <div className={`text-sm font-bold ${cfg.t} mb-1`}>{cat}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 leading-snug">{cfg.d}</div>
                    <div className={`text-[11px] font-bold ${cfg.t}`}>{count.toLocaleString('en-IN')} funds →</div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Watchlist */}
        {!loading && watchlistFunds.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">⭐ My Watchlist</h2>
              <Link to="/screener?tab=watchlist" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline">View all {watchlist.length} →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {watchlistFunds.map(fund => {
                const cfg = CAT[inferCategory(fund.schemeName)]||CAT.Other;
                return (
                  <div key={fund.schemeCode} className="card p-4 border-l-[3px]" style={{borderLeftColor: cfg.b}}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.t} mb-2 inline-block`}>{inferCategory(fund.schemeName)}</span>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 mb-3">{fund.schemeName}</h3>
                    <Link to={`/compare?code=${fund.schemeCode}`} className="btn-primary w-full text-center text-xs py-1.5 block">Analyse →</Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Tips */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">💡 Smart Investing Tips</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ['📅','Start Early','₹5,000/month at 25 = ₹3.5 Cr by 60. Starting at 35 = only ₹1 Cr. Time is your biggest asset.'],
              ['💸','Choose Direct Plans','Direct plans save 0.5–1% per year. On ₹10L over 20 years = ₹5–10 Lakh extra in your pocket.'],
              ['🔁','Step-Up SIP Annually','₹5,000/month with 10% annual step-up grows to ₹11 Cr vs ₹3.5 Cr without step-up over 30 years.'],
              ['🔥','FIRE is Achievable','Save 25× annual expenses. At ₹50K/month spend, FIRE corpus = ₹1.5 Cr. SIP gets you there.'],
              ['⚖️','Diversify Smart','70% Equity + 20% Debt + 10% Liquid suits most long-term investors.'],
              ['🧾','Save Tax with ELSS','ELSS saves up to ₹46,800/year in taxes (30% slab) with just 3-year lock-in.'],
            ].map(([icon,title,body])=>(
              <div key={title} className="card p-5 hover:shadow-md transition-shadow">
                <div className="text-2xl mb-2">{icon}</div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">{title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Glossary */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">📖 Beginner's Glossary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {GLOSSARY.map(item=>(
              <div key={item.t} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 flex gap-3">
                <span className="text-xl flex-shrink-0">{item.e}</span>
                <div><div className="font-bold text-sm text-slate-900 dark:text-white mb-1">{item.t}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.d}</p></div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {t:'Fund Screener',d:'Filter by category, plan, AMC, expense ratio & more.',cta:'Find Funds →',to:'/screener',g:'from-blue-600 to-indigo-600'},
            {t:'Compare Funds',d:'Side-by-side NAV, rolling returns, annual performance.',cta:'Compare →',to:'/compare',g:'from-emerald-600 to-teal-600'},
            {t:'SIP + FIRE Calc',d:'SIP, Goal, ELSS tax saving, and FIRE retirement planning.',cta:'Calculate →',to:'/sip',g:'from-orange-500 to-red-500'},
          ].map(c=>(
            <div key={c.t} className={`rounded-2xl bg-gradient-to-br ${c.g} p-5 text-white`}>
              <h3 className="font-bold text-base mb-1">{c.t}</h3>
              <p className="text-sm opacity-80 mb-4">{c.d}</p>
              <Link to={c.to} className="bg-white/20 hover:bg-white/30 border border-white/30 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-all inline-block">{c.cta}</Link>
            </div>
          ))}
        </section>
      </div>

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
