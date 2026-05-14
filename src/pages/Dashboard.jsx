import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFunds } from '../hooks/useFunds';
import { useLocalStorage } from '../hooks/useLocalStorage';
import FundCard from '../components/FundCard';
import SkeletonCard from '../components/SkeletonCard';
import ErrorState from '../components/ErrorState';
import GlossaryCard from '../components/GlossaryCard';
import { inferCategory } from '../utils/goalFilters';

const CATEGORIES = ['All', 'Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Liquid'];

const GLOSSARY = [
  { term: 'NAV', emoji: '💹', definition: 'Net Asset Value — price of one mutual fund unit, calculated daily.' },
  { term: 'AUM', emoji: '🏦', definition: 'Assets Under Management — total money managed by the fund house.' },
  { term: 'CAGR', emoji: '📈', definition: 'Compound Annual Growth Rate — how fast your investment grows year over year.' },
  { term: 'Expense Ratio', emoji: '💸', definition: 'Annual fee charged by the fund, expressed as a % of your investment.' },
  { term: 'SIP', emoji: '🔄', definition: 'Systematic Investment Plan — invest a fixed amount every month automatically.' },
  { term: 'ELSS', emoji: '🧾', definition: 'Equity Linked Saving Scheme — tax-saving mutual fund with 3-year lock-in.' },
  { term: 'Exit Load', emoji: '🚪', definition: 'Fee charged when you redeem your fund before a specified period.' },
  { term: 'Lumpsum', emoji: '💰', definition: 'A one-time single investment in a mutual fund, as opposed to SIP.' },
];

// Category display config
const CAT_CONFIG = {
  Equity:  { emoji: '📈', color: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' },
  Debt:    { emoji: '🏛️', color: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' },
  Hybrid:  { emoji: '⚖️', color: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300' },
  ELSS:    { emoji: '🧾', color: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300' },
  Index:   { emoji: '📊', color: 'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300' },
  Liquid:  { emoji: '💧', color: 'bg-teal-50 dark:bg-teal-950 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300' },
  Other:   { emoji: '📁', color: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400' },
};

export default function Dashboard() {
  const { funds, loading, error, refetch } = useFunds();
  const [activeCategory, setActiveCategory] = useState('All');
  const [recentCodes] = useLocalStorage('fundlens_recent', []);

  // Map recent codes back to full fund objects
  const recentFunds = recentCodes
    .map((code) => funds.find((f) => f.schemeCode.toString() === code.toString()))
    .filter(Boolean)
    .slice(0, 3);

  // Category-wise counts for the market overview
  const categoryStats = useMemo(() => {
    if (!funds.length) return {};
    const counts = {};
    for (const f of funds) {
      const cat = inferCategory(f.schemeName);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [funds]);

  const filteredFunds = (activeCategory === 'All'
    ? funds
    : funds.filter((f) => inferCategory(f.schemeName) === activeCategory)
  ).slice(0, 6);

  const fotd = useMemo(() => {
    if (!funds.length) return null;
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const storedFotd = localStorage.getItem('fundlens_fotd');
    let fotdData = null;
    if (storedFotd) {
      try {
        const parsed = JSON.parse(storedFotd);
        if (parsed.date === todayStr) fotdData = parsed;
      } catch (e) {}
    }
    if (!fotdData) {
      // Pick random fund based on seeded date
      let seed = 0;
      for (let i = 0; i < todayStr.length; i++) seed += todayStr.charCodeAt(i);
      // add a bit more variance
      seed += parseInt(todayStr.replace(/-/g, ''));
      const randomIndex = seed % funds.length;
      const selectedFund = funds[randomIndex];
      fotdData = { date: todayStr, code: selectedFund.schemeCode };
      localStorage.setItem('fundlens_fotd', JSON.stringify(fotdData));
    }
    return funds.find(f => String(f.schemeCode) === String(fotdData.code)) || funds[0];
  }, [funds]);

  const getFotdReason = (cat) => {
    if (cat === 'Equity') return "Strong long-term wealth creation potential";
    if (cat === 'ELSS') return "Tax-saving under Section 80C with equity growth";
    if (cat === 'Debt') return "Stable returns with lower volatility";
    if (cat === 'Liquid') return "Ideal for short-term parking of funds";
    if (cat === 'Hybrid') return "Balanced exposure to equity and debt";
    return "A solid choice for diversified portfolios";
  };

  return (
    <div className="min-h-screen pb-20 md:pb-8">
      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:from-blue-950 dark:via-slate-900 dark:to-slate-800 text-slate-900 dark:text-white pt-24 pb-16 px-4 md:pt-28 md:pb-20">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 opacity-5 dark:opacity-10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400 opacity-5 dark:opacity-10 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-cyan-400 opacity-5 rounded-full" />

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/50 dark:bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm mb-6 border border-slate-200 dark:border-white/20 shadow-sm">
            <span className="w-2 h-2 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-pulse" />
            Live from mfapi.in
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Analyse. Compare.
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">Invest Smarter.</span>
          </h1>
          <p className="text-slate-600 dark:text-blue-200 text-lg mb-8 max-w-xl mx-auto">
            India's beginner-friendly mutual fund analysis platform. Explore thousands of funds with clarity.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link id="hero-browse-btn" to="/screener" className="w-full sm:w-auto btn-primary px-6 py-3 shadow-lg text-white">
              Browse Funds →
            </Link>
            <Link id="hero-compare-btn" to="/compare" className="w-full sm:w-auto bg-white/50 dark:bg-white/10 backdrop-blur-sm border border-slate-200 dark:border-white/30 text-slate-900 dark:text-white font-semibold px-6 py-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/20 transition-all active:scale-95 shadow-sm">
              Compare Funds
            </Link>
          </div>
          {!loading && !error && funds.length > 0 && (
            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto border-t border-slate-200 dark:border-white/10 pt-8">
              <div>
                <div className="text-2xl font-bold tabular-nums">{funds.length.toLocaleString('en-IN')}+</div>
                <div className="text-[10px] text-slate-500 dark:text-blue-200 mt-1 uppercase tracking-widest font-semibold">Live Funds</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">40+</div>
                <div className="text-[10px] text-slate-500 dark:text-blue-200 mt-1 uppercase tracking-widest font-semibold">AMCs</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">Daily</div>
                <div className="text-[10px] text-slate-500 dark:text-blue-200 mt-1 uppercase tracking-widest font-semibold">NAV Updates</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">100%</div>
                <div className="text-[10px] text-slate-500 dark:text-blue-200 mt-1 uppercase tracking-widest font-semibold">Free to Use</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Market overview ticker strip */}
      <div className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-center py-2.5 text-sm font-medium tracking-wide">
        📊 Explore top-performing funds across categories today. Data refreshed daily.
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {/* Error state */}
        {error && <ErrorState message={error} onRetry={refetch} />}

        {/* Fund of the Day */}
        {!error && !loading && fotd && (
          <section className="animate-fade-in-up">
            <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40 border-blue-200 dark:border-blue-800 p-6 flex flex-col md:flex-row items-center gap-6 shadow-lg shadow-blue-500/5">
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                  <span className="text-xl">⭐</span>
                  <span className="uppercase tracking-widest text-xs font-bold text-blue-600 dark:text-blue-400">Fund of the Day</span>
                  <span className="text-[10px] bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-mono border border-slate-200 dark:border-slate-700">#{fotd.schemeCode}</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 leading-tight">{fotd.schemeName}</h3>
                <div className="flex flex-col sm:flex-row items-center gap-2 justify-center md:justify-start">
                  <span className="pill bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-sm font-semibold uppercase tracking-wide text-[10px]">{inferCategory(fotd.schemeName)}</span>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400 italic">"{getFotdReason(inferCategory(fotd.schemeName))}"</span>
                </div>
              </div>
              <div className="w-full md:w-auto shrink-0">
                <Link to={`/screener?search=${fotd.schemeCode}`} className="btn-primary w-full block text-center shadow-lg shadow-blue-500/20">
                  View in Screener →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── Market Overview by Category ── */}
        {!error && !loading && Object.keys(categoryStats).length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl">🗂️</span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Market Overview</h2>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium ml-1">by category</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              {['Equity', 'Debt', 'Hybrid', 'ELSS', 'Index', 'Liquid', 'Other'].map((cat) => {
                const cfg = CAT_CONFIG[cat] || CAT_CONFIG.Other;
                const count = categoryStats[cat] || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`rounded-xl border p-3 text-center transition-all hover:scale-[1.03] active:scale-95 ${cfg.color}`}
                  >
                    <div className="text-2xl mb-1">{cfg.emoji}</div>
                    <div className="text-xs font-bold">{cat}</div>
                    <div className="text-[11px] font-semibold mt-0.5 opacity-80">
                      {count.toLocaleString('en-IN')} funds
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Recently Viewed Funds */}
        {!error && !loading && recentFunds.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xl">🕒</span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recently Viewed</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentFunds.map((fund) => (
                <FundCard key={`recent-${fund.schemeCode}`} fund={fund} showBookmark showCompare />
              ))}
            </div>
          </section>
        )}

        {/* Browse by Category (with filter) */}
        {!error && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Browse by Category</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {activeCategory === 'All' ? 'Showing a sample from all categories' : `Showing ${activeCategory} funds`}
                </p>
              </div>
              <Link to="/screener" id="view-all-btn" className="btn-secondary text-xs">
                View All →
              </Link>
            </div>

            {/* Category pills */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-6">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  id={`cat-filter-${cat.toLowerCase()}`}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 pill transition-all ${
                    activeCategory === cat
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading
                ? Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
                : filteredFunds.length > 0
                  ? filteredFunds.map((fund) => (
                      <FundCard key={fund.schemeCode} fund={fund} showBookmark showCompare />
                    ))
                  : (
                      <div className="col-span-full text-center py-8 text-slate-500 dark:text-slate-400">
                        No funds found in this category.
                      </div>
                    )}
            </div>
          </section>
        )}

        {/* Investing Tips */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">💡</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Smart Investing Tips</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: '📅', title: 'Start Early', body: 'Even ₹500/month invested at 25 can grow to ₹1.7 Cr by 60 — the power of compounding.' },
              { icon: '🎯', title: 'Stay the Course', body: 'Don\'t exit during market dips. SIP investors who stayed invested through 2020 crash saw 2× returns by 2022.' },
              { icon: '⚖️', title: 'Diversify Wisely', body: 'Mix equity for growth, debt for safety. A 70/30 equity-debt split suits most long-term investors.' },
            ].map((tip) => (
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
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Beginner's Glossary</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Key mutual fund terms explained simply</p>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {GLOSSARY.map((item) => (
              <GlossaryCard key={item.term} {...item} />
            ))}
          </div>
        </section>

        {/* CTA strip */}
        <section className="card p-6 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950 border-indigo-100 dark:border-indigo-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Planning a SIP?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Calculate your potential returns with step-up and inflation adjustment.
              </p>
            </div>
            <Link id="sip-cta-btn" to="/sip" className="btn-primary whitespace-nowrap">
              Open SIP Calculator →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
