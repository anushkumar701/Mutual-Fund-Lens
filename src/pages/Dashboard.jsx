import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFunds } from '../hooks/useFunds';
import { useLocalStorage } from '../hooks/useLocalStorage';
import SkeletonCard from '../components/SkeletonCard';
import ErrorState from '../components/ErrorState';
import { inferCategory } from '../utils/goalFilters';

const CATEGORY_CONFIG = {
  Equity:  { emoji: '📈', border: '#3b82f6', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300', desc: 'Long-term wealth creation. Best for 5+ years.' },
  Debt:    { emoji: '🏛️', border: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300', desc: 'Stable income. Good for 1–3 years.' },
  Hybrid:  { emoji: '⚖️', border: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300', desc: 'Balanced equity & debt exposure.' },
  ELSS:    { emoji: '🧾', border: '#8b5cf6', bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300', desc: 'Tax saving under Sec 80C. 3-yr lock-in.' },
  Index:   { emoji: '📊', border: '#6366f1', bg: 'bg-indigo-50 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300', desc: 'Low cost. Tracks Nifty/Sensex index.' },
  Liquid:  { emoji: '💧', border: '#14b8a6', bg: 'bg-teal-50 dark:bg-teal-950', text: 'text-teal-700 dark:text-teal-300', desc: 'Like a savings account. Ultra short-term.' },
  Other:   { emoji: '📁', border: '#94a3b8', bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', desc: 'Specialty and other category funds.' },
};

const GLOSSARY = [
  { term: 'NAV', emoji: '💹', definition: 'Net Asset Value — price of 1 fund unit. Published daily after market close.' },
  { term: 'SIP', emoji: '🔄', definition: 'Invest a fixed amount every month. Averages out market ups and downs automatically.' },
  { term: 'CAGR', emoji: '📈', definition: 'Compound Annual Growth Rate — annualised return. Better than absolute return for comparing.' },
  { term: 'Expense Ratio', emoji: '💸', definition: 'Annual fee charged by the fund. Lower is better. Direct plans charge less than Regular.' },
  { term: 'ELSS', emoji: '🧾', definition: 'Equity fund that saves tax under Section 80C. Max ₹1.5L deduction. 3-year lock-in.' },
  { term: 'Direct Plan', emoji: '✅', definition: 'No distributor commission. Always prefer Direct over Regular to save 0.5–1% per year.' },
  { term: 'Regular Plan', emoji: '⚠️', definition: 'Includes distributor commission — higher expense ratio. Over 20 years this erodes ₹lakhs.' },
  { term: 'Exit Load', emoji: '🚪', definition: 'Penalty for early redemption. Equity funds usually charge 1% if you exit within 1 year.' },
  { term: 'Lumpsum', emoji: '💰', definition: 'One-time investment instead of monthly SIP. Best deployed during market dips.' },
  { term: 'AUM', emoji: '🏦', definition: 'Assets Under Management — total money the fund manages. Higher AUM = more trust.' },
  { term: 'Sharpe Ratio', emoji: '📐', definition: 'Risk-adjusted return. Above 1 = good. Above 2 = excellent. Higher the better.' },
  { term: 'Rolling Returns', emoji: '🔁', definition: 'Return calculated for every possible start & end date. More reliable than point-to-point.' },
];

const TIPS = [
  { icon: '📅', title: 'Start Early, Stay Long', body: '₹5,000/month at 25 grows to ₹3.5 Cr by 60 at 12% CAGR. Starting at 35 gives only ₹1 Cr. Time is your biggest asset.' },
  { icon: '🎯', title: "Don't Exit During Dips", body: 'SIP investors who stayed through 2020 COVID crash doubled their money by 2022. Exiting locks in losses. Stay the course.' },
  { icon: '💸', title: 'Always Choose Direct Plans', body: 'Direct plans save 0.5–1% per year vs Regular. On ₹10L over 20 years, this difference can be ₹5–10 Lakh extra in your pocket.' },
  { icon: '⚖️', title: 'Diversify Across Categories', body: "70% Equity + 20% Debt + 10% Liquid is a solid allocation. Don't put all savings in one fund or category." },
  { icon: '🔁', title: 'Step-Up Your SIP Annually', body: 'Increase SIP by 10% every year. ₹5,000/month with 10% step-up grows to ₹11 Cr vs ₹3.5 Cr without step-up over 30 years.' },
  { icon: '🧾', title: 'Use ELSS for Tax Saving', body: 'ELSS saves up to ₹46,800/year in taxes (30% slab) with only 3-year lock-in vs 5 years for other 80C investments.' },
];

function QuickCalcWidget() {
  const [amount, setAmount] = useState(5000);
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(12);
  
  const maturity = Math.round(amount * ((Math.pow(1 + rate/100/12, years*12) - 1) / (rate/100/12)) * (1 + rate/100/12));
  const invested = amount * years * 12;
  const returns = maturity - invested;
  const fmt = (n) => n >= 10000000 ? `₹${(n/10000000).toFixed(2)} Cr` : n >= 100000 ? `₹${(n/100000).toFixed(1)} L` : `₹${n.toLocaleString('en-IN')}`;

  return (
    <div className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-100 dark:border-blue-900">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🧮</span>
        <h3 className="font-bold text-slate-900 dark:text-white text-base">Quick SIP Calculator</h3>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Monthly (₹)</label>
          <input type="number" value={amount} onChange={e => setAmount(Math.max(100, Number(e.target.value)))}
            className="input-base w-full py-2 text-sm text-center font-semibold" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Years</label>
          <input type="number" value={years} onChange={e => setYears(Math.max(1, Math.min(40, Number(e.target.value))))}
            className="input-base w-full py-2 text-sm text-center font-semibold" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Return %</label>
          <input type="number" value={rate} onChange={e => setRate(Math.max(1, Math.min(30, Number(e.target.value))))}
            className="input-base w-full py-2 text-sm text-center font-semibold" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5">
          <div className="text-[10px] text-slate-400 mb-1">Invested</div>
          <div className="font-bold text-sm text-slate-700 dark:text-slate-200">{fmt(invested)}</div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950 rounded-lg p-2.5 border border-emerald-100 dark:border-emerald-900">
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-1">Returns</div>
          <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400">+{fmt(returns)}</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2.5 border border-blue-100 dark:border-blue-900">
          <div className="text-[10px] text-blue-600 dark:text-blue-400 mb-1">Total</div>
          <div className="font-bold text-sm text-blue-700 dark:text-blue-300">{fmt(maturity)}</div>
        </div>
      </div>
      <Link to="/sip" className="btn-primary block text-center mt-4 text-xs py-2">
        Full SIP Calculator with Step-Up →
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const { funds, loading, error, refetch } = useFunds();
  const navigate = useNavigate();
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);
  const [recentCodes] = useLocalStorage('fundlens_recent', []);
  const [watchlist] = useLocalStorage('fundlens_watchlist', []);
  const [activeCategory, setActiveCategory] = useState('All');

  const categoryStats = useMemo(() => {
    const counts = {};
    for (const f of funds) {
      const c = inferCategory(f.schemeName);
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [funds]);

  const recentFunds = recentCodes
    .map(code => funds.find(f => f.schemeCode.toString() === code.toString()))
    .filter(Boolean).slice(0, 4);

  const watchlistFunds = watchlist
    .map(code => funds.find(f => String(f.schemeCode) === String(code)))
    .filter(Boolean).slice(0, 6);

  const popularAMCs = useMemo(() => {
    if (!funds.length) return [];
    const amcCount = {};
    for (const f of funds) {
      const words = f.schemeName.split(' ');
      const amc = words.slice(0, 2).join(' ');
      amcCount[amc] = (amcCount[amc] || 0) + 1;
    }
    return Object.entries(amcCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [funds]);

  const CATEGORIES_ORDER = ['Equity', 'ELSS', 'Index', 'Hybrid', 'Debt', 'Liquid', 'Other'];

  return (
    <div className="min-h-screen pb-20 md:pb-8">

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-blue-950 dark:via-slate-900 dark:to-indigo-950 pt-24 pb-16 px-4 md:pt-28 md:pb-20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 opacity-5 dark:opacity-10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400 opacity-5 dark:opacity-10 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/50 dark:bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-6 border border-slate-200 dark:border-white/20 shadow-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-slate-700 dark:text-slate-300">Live data from mfapi.in</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight text-slate-900 dark:text-white">
            Analyse. Compare.
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              Invest Smarter.
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-lg mb-8 max-w-xl mx-auto">
            India's beginner-friendly mutual fund analysis platform. Deep analytics for every fund, free forever.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/screener" className="w-full sm:w-auto btn-primary px-6 py-3 shadow-lg text-white">
              Browse All Funds →
            </Link>
            <Link to="/compare" className="w-full sm:w-auto bg-white/50 dark:bg-white/10 backdrop-blur-sm border border-slate-200 dark:border-white/30 text-slate-900 dark:text-white font-semibold px-6 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/20 transition-all">
              Compare Funds
            </Link>
            <Link to="/sip" className="w-full sm:w-auto bg-white/50 dark:bg-white/10 backdrop-blur-sm border border-slate-200 dark:border-white/30 text-slate-900 dark:text-white font-semibold px-6 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/20 transition-all">
              SIP Calculator
            </Link>
          </div>
          {!loading && !error && funds.length > 0 && (
            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto border-t border-slate-200 dark:border-white/10 pt-8">
              {[
                { value: `${funds.length.toLocaleString('en-IN')}+`, label: 'Live Funds' },
                { value: `${Object.keys(categoryStats).length}`, label: 'Categories' },
                { value: 'Daily', label: 'NAV Updates' },
                { value: '100%', label: 'Free to Use' },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{s.value}</div>
                  <div className="text-[10px] text-slate-500 dark:text-blue-200 mt-1 uppercase tracking-widest font-semibold">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {error && <ErrorState message={error} onRetry={refetch} />}

        {/* Quick SIP Calculator */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <QuickCalcWidget />

            {/* What to invest in guide */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">🎯</span>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Where Should I Invest?</h3>
              </div>
              <div className="space-y-3">
                {[
                  { goal: 'Emergency Fund', type: 'Liquid Fund', horizon: '0–6 months', risk: 'Very Low', color: 'text-teal-600' },
                  { goal: 'Short-term Goal (1–3Y)', type: 'Debt Fund', horizon: '1–3 years', risk: 'Low', color: 'text-emerald-600' },
                  { goal: 'Tax Saving (80C)', type: 'ELSS Fund', horizon: '3+ years', risk: 'Medium', color: 'text-purple-600' },
                  { goal: 'Long-term Wealth', type: 'Equity Fund', horizon: '7+ years', risk: 'High', color: 'text-blue-600' },
                  { goal: 'Retirement (SIP)', type: 'Index Fund', horizon: '20+ years', risk: 'Medium', color: 'text-indigo-600' },
                ].map(row => (
                  <div key={row.goal} className="flex items-center justify-between text-xs gap-2 pb-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300">{row.goal}</div>
                      <div className="text-slate-400">{row.horizon}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${row.color}`}>{row.type}</div>
                      <div className="text-slate-400">Risk: {row.risk}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Fund Categories */}
        {!error && !loading && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl">🗂️</span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Browse by Category</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click a category to explore funds</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {CATEGORIES_ORDER.map(cat => {
                const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.Other;
                const count = categoryStats[cat] || 0;
                if (count === 0) return null;
                return (
                  <Link
                    key={cat}
                    to={`/screener?cat=${cat}`}
                    className={`rounded-xl border p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 ${cfg.bg} border-opacity-50`}
                    style={{ borderColor: cfg.border + '40' }}
                  >
                    <div className="text-2xl mb-2">{cfg.emoji}</div>
                    <div className={`text-sm font-bold ${cfg.text} mb-1`}>{cat}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 leading-snug">{cfg.desc}</div>
                    <div className={`text-[11px] font-bold ${cfg.text}`}>{count.toLocaleString('en-IN')} funds →</div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Watchlist */}
        {!error && !loading && watchlistFunds.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="text-xl">⭐</span>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">My Watchlist</h2>
              </div>
              <Link to="/screener?tab=watchlist" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                View all {watchlist.length} →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {watchlistFunds.map(fund => {
                const cat = inferCategory(fund.schemeName);
                const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.Other;
                return (
                  <div key={fund.schemeCode} className="card p-4 border-l-[3px]" style={{ borderLeftColor: cfg.border }}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} mb-2 inline-block`}>{cat}</span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 mb-3">{fund.schemeName}</h3>
                    <Link to={`/compare?code=${fund.schemeCode}`} className="btn-primary w-full text-center text-xs py-1.5 block">
                      Analyse →
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recently Viewed */}
        {!error && !loading && recentFunds.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl">🕒</span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recently Viewed</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentFunds.map(fund => {
                const cat = inferCategory(fund.schemeName);
                const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.Other;
                return (
                  <div key={fund.schemeCode} className="card p-4 border-l-[3px]" style={{ borderLeftColor: cfg.border }}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} mb-2 inline-block`}>{cat}</span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 mb-3">{fund.schemeName}</h3>
                    <Link to={`/compare?code=${fund.schemeCode}`} className="btn-primary w-full text-center text-xs py-1.5 block">
                      Analyse →
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Smart Investing Tips */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">💡</span>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Smart Investing Tips</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Backed by data and long-term market evidence</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TIPS.map(tip => (
              <div key={tip.title} className="card p-5 hover:shadow-md transition-shadow">
                <div className="text-2xl mb-3">{tip.icon}</div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-2">{tip.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{tip.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Glossary */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">📖</span>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Beginner's Glossary</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Key terms explained simply — no jargon</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {GLOSSARY.map(item => (
              <div key={item.term} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 flex gap-3">
                <span className="text-xl flex-shrink-0">{item.emoji}</span>
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white mb-1">{item.term}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.definition}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTAs */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: 'Planning a SIP?', desc: 'Calculate returns with step-up, inflation adjustment, tax saving and more.', cta: 'SIP Calculator →', to: '/sip', color: 'from-blue-600 to-indigo-600' },
            { title: 'Compare Two Funds', desc: 'Side-by-side NAV chart, rolling returns, annual performance, and XIRR.', cta: 'Compare Now →', to: '/compare', color: 'from-emerald-600 to-teal-600' },
            { title: 'Find the Right Fund', desc: 'Filter by category, plan type, goal, and AMC to find your perfect fund.', cta: 'Open Screener →', to: '/screener', color: 'from-purple-600 to-violet-600' },
          ].map(c => (
            <div key={c.title} className={`rounded-2xl bg-gradient-to-br ${c.color} p-5 text-white`}>
              <h3 className="font-bold text-base mb-1">{c.title}</h3>
              <p className="text-sm opacity-80 mb-4 leading-snug">{c.desc}</p>
              <Link to={c.to} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-all inline-block">
                {c.cta}
              </Link>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
