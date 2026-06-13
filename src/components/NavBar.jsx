// components/NavBar.jsx
import { NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { useLocalStorage } from '../hooks/useLocalStorage';

const links = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/screener',
    label: 'Screener',
    icon: (
      <svg className="w-5 h-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
      </svg>
    ),
  },
  {
    to: '/compare',
    label: 'Compare',
    badgeKey: 'fundlens_compare',
    badgeColor: 'bg-blue-500',
    icon: (
      <svg className="w-5 h-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    to: '/sip',
    label: 'SIP Calc',
    icon: (
      <svg className="w-5 h-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="w-5 h-5" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function NavBadge({ storageKey, color }) {
  const [list] = useLocalStorage(storageKey, []);
  if (!list.length) return null;
  return (
    <span
      aria-label={`${list.length} items`}
      className={`absolute -top-0.5 -right-0.5 ${color} text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none shadow-sm`}
    >
      {list.length}
    </span>
  );
}

// Slug helper: replaces ALL spaces (not just the first) so multi-word labels
// like "SIP Calc" produce "sip-calc" instead of "sip calc".
function toSlug(str) {
  return str.toLowerCase().replaceAll(' ', '-');
}

export default function NavBar() {
  const [compareList] = useLocalStorage('fundlens_compare', []);
  const [watchlist] = useLocalStorage('fundlens_watchlist', []);

  return (
    <>
      {/* Desktop top navbar */}
      <nav aria-label="Main navigation" className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 bg-white dark:bg-[#0d1117] border-b border-slate-200 dark:border-slate-800 shadow-sm items-center px-6 gap-6">
        {/* Logo */}
        <NavLink to="/" aria-label="FundLens home" className="flex items-center gap-2 mr-6">
          <svg className="w-7 h-7 text-blue-600" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="3,17 9,11 13,15 21,7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="21" cy="7" r="1.5" fill="currentColor" />
          </svg>
          <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Fund<span className="text-blue-600">Lens</span>
          </span>
        </NavLink>

        {/* Nav links */}
        <div className="flex items-center gap-1 flex-1">
          {links.map(({ to, label, icon, badgeKey, badgeColor }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              id={`nav-${toSlug(label)}`}
              aria-label={label}
              className={({ isActive }) =>
                `relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
                }`
              }
            >
              {icon}
              <span>{label}</span>
              {badgeKey && (
                <NavBadge storageKey={badgeKey} color={badgeColor || 'bg-blue-500'} />
              )}
            </NavLink>
          ))}
        </div>

        {/* Desktop watchlist + compare pill indicators */}
        <div className="flex items-center gap-2 text-xs">
          {watchlist.length > 0 && (
            <span aria-label={`${watchlist.length} funds saved to watchlist`} className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 rounded-full px-2.5 py-1 font-medium">
              ⭐ {watchlist.length} saved
            </span>
          )}
          {compareList.length > 0 && (
            <span aria-label={`${compareList.length} funds being compared`} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-full px-2.5 py-1 font-medium">
              ⚖️ {compareList.length} comparing
            </span>
          )}
        </div>

        <ThemeToggle />
      </nav>

      {/* Mobile header bar (logo + theme toggle) */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-white dark:bg-[#0d1117] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4">
        <NavLink to="/" aria-label="FundLens home" className="flex items-center gap-2">
          <svg className="w-6 h-6 text-blue-600" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="3,17 9,11 13,15 21,7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-bold text-slate-900 dark:text-white">
            Fund<span className="text-blue-600">Lens</span>
          </span>
        </NavLink>
        <ThemeToggle />
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Mobile navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#0d1117] border-t border-slate-200 dark:border-slate-800 bottom-nav-safe">
        <div className="flex items-stretch">
          {links.map(({ to, label, icon, badgeKey, badgeColor }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              id={`mobile-nav-${toSlug(label)}`}
              aria-label={label}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[56px] text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                  )}
                  <span className="relative">
                    {icon}
                    {badgeKey && (
                      <NavBadge storageKey={badgeKey} color={badgeColor || 'bg-blue-500'} />
                    )}
                  </span>
                  <span className="leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
