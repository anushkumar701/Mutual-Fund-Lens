// pages/Settings.jsx
import { useState } from 'react';
import { PLATFORMS, getUserPlatform, setUserPlatform, clearUserPlatform } from '../utils/platformLinks';
import { getTERMeta } from '../utils/expenseRatio';

export default function Settings() {
  const [selectedPlatform, setSelectedPlatform] = useState(() => getUserPlatform()?.id || null);
  const [saved, setSaved] = useState(false);

  const terMeta = getTERMeta();

  const handleSelect = (platformId) => {
    if (selectedPlatform === platformId) {
      // Deselect
      clearUserPlatform();
      setSelectedPlatform(null);
    } else {
      setUserPlatform(platformId);
      setSelectedPlatform(platformId);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Personalize your FundLens experience
          </p>
        </div>

        {/* ─ Investment Platform ─ */}
        <div className="card p-6 space-y-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl">
                📱
              </div>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-lg">My Investment Platform</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose where you invest — we'll show a quick "Invest Now" button on fund pages
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PLATFORMS.map((p) => {
              const isSelected = selectedPlatform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p.id)}
                  className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-md shadow-blue-100 dark:shadow-blue-950'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ backgroundColor: `${p.color}15` }}
                  >
                    {p.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{p.name}</span>
                      {isSelected && (
                        <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                          ✓ Selected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {p.tip}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {saved && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5 animate-pulse">
              <span>✅</span>
              <span className="font-semibold">
                {selectedPlatform ? `${PLATFORMS.find(p => p.id === selectedPlatform)?.name} saved as your default!` : 'Platform preference cleared.'}
              </span>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              <strong>💡 How this works:</strong> When you open a fund detail modal, your preferred platform will be highlighted with a prominent
              "Invest Now" button. All other platforms remain accessible too — this is just a convenience shortcut.
            </p>
          </div>
        </div>

        {/* ─ Data Sources ─ */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xl">
              📊
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-lg">Data Sources</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Where FundLens gets its data from</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* NAV Data */}
            <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-sm flex-shrink-0">📈</div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">NAV Data</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Real-time NAV from <a href="https://api.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">mfapi.in</a> (primary) with <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">AMFI India</a> fallback
                </p>
                <p className="text-[10px] text-slate-400 mt-1">37,000+ schemes · Updated daily · Cached 24hr</p>
              </div>
            </div>

            {/* TER Data */}
            <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900 flex items-center justify-center text-sm flex-shrink-0">💰</div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Expense Ratios (TER)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Official AMFI Total Expense Ratio data via{' '}
                  <a href="https://github.com/captn3m0/india-mutual-fund-ter-tracker" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                    community tracker
                  </a>
                </p>
                {terMeta && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {terMeta.count.toLocaleString('en-IN')} fund families · Last updated: {new Date(terMeta.fetchedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>

            {/* Tax Rules */}
            <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-sm flex-shrink-0">🏛️</div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Tax Rules</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  STCG/LTCG rates based on Indian Finance Act. Auto-selects rules by sell date FY.
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Covers FY 2022-23 to FY 2024-25 · Budget 2024 rates included</p>
              </div>
            </div>
          </div>
        </div>

        {/* ─ About ─ */}
        <div className="card p-6 space-y-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xl">
              🔍
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-lg">About FundLens</h2>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            FundLens is a <strong>free, open-source</strong> mutual fund research platform built for Indian investors.
            It helps you screen, compare, and analyze 37,000+ mutual funds with real NAV data, accurate expense ratios,
            and smart calculators — all without requiring an account or sharing personal data.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {['No Login Required', 'No Ads', 'Offline Capable (PWA)', 'Dark Mode', 'Mobile Friendly'].map(tag => (
              <span key={tag} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-800">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Disclaimer:</strong> FundLens is for informational purposes only. Investment decisions should be made after consulting a SEBI-registered financial advisor. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
