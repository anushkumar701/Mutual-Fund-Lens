import { Link } from '@remix-run/react';

export default function Footer() {
  return (
    <footer className="hidden md:block bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 mt-12">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="3,17 9,11 13,15 21,7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                Fund<span className="text-blue-600">Lens</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              India&apos;s beginner-friendly mutual fund analysis platform. For information purposes only.
            </p>
          </div>

          {/* Pages */}
          <div>
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Explore</h4>
            <ul className="space-y-2">
              {[
                { to: '/', label: 'Dashboard' },
                { to: '/screener', label: 'Fund Screener' },
                { to: '/compare', label: 'Compare Funds' },
                { to: '/sip', label: 'SIP Calculator' },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Data */}
          <div>
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Data</h4>
            <ul className="space-y-2">
              <li>
                <a href="https://api.mfapi.in" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors">
                  mfapi.in ↗
                </a>
              </li>
              <li className="text-xs text-slate-500 dark:text-slate-400">AMFI Registered Funds</li>
              <li className="text-xs text-slate-500 dark:text-slate-400">Daily NAV Updates</li>
            </ul>
          </div>

          {/* Disclaimer */}
          <div>
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Disclaimer</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Mutual fund investments are subject to market risks. This platform is for informational purposes only and does not constitute financial advice.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-500">© 2026 FundLens. Built for learning. Not SEBI registered.</p>
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-500">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Live data from mfapi.in
          </div>
        </div>
      </div>
    </footer>
  );
}
