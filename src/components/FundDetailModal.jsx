// components/FundDetailModal.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { fetchFundDetail } from '../hooks/useFunds';

function parseNavDate(s) {
  const [dd, mm, yyyy] = s.split('-');
  return new Date(`${yyyy}-${mm}-${dd}`).getTime();
}

// Pre-sort navData ascending by timestamp (called once per modal open)
function buildSortedForModal(navData) {
  return navData.map(d => ({ ts: parseNavDate(d.date), nav: parseFloat(d.nav) }))
    .filter(d => !isNaN(d.ts) && isFinite(d.nav))
    .sort((a, b) => a.ts - b.ts);
}

// Binary search for closest date in pre-sorted array — O(log n) vs O(n)
function binarySearchModal(sorted, targetTs) {
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].ts < targetTs) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sorted[lo - 1].ts - targetTs) < Math.abs(sorted[lo].ts - targetTs)) {
    return lo - 1;
  }
  return lo;
}

function calcReturn(sorted, latestNav, latestTs, days) {
  if (!sorted || sorted.length < 2) return null;
  const cutoffTs = latestTs - days * 86400000;
  const idx = binarySearchModal(sorted, cutoffTs);
  const found = sorted[idx];
  // Reject if more than 30 days off (fund may not have data that far back)
  if (Math.abs(found.ts - cutoffTs) > 30 * 86400000) return null;
  const old = found.nav;
  if (old <= 0) return null;
  if (days > 365) {
    const yrs = days / 365.25;
    return ((Math.pow(latestNav / old, 1 / yrs) - 1) * 100).toFixed(2);
  }
  return (((latestNav - old) / old) * 100).toFixed(2);
}

export default function FundDetailModal({ schemeCode, schemeName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watchlist, setWatchlist] = useLocalStorage('fundlens_watchlist', []);
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);

  const codeStr = String(schemeCode);
  const isWL = watchlist.map(String).includes(codeStr);
  const isCmp = compareList.map(String).includes(codeStr);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(false);
    fetchFundDetail(schemeCode)
      .then((d) => { if (mounted) { setData(d); setLoading(false); } })
      .catch(() => { if (mounted) { setError(true); setLoading(false); } });
    return () => { mounted = false; };
  }, [schemeCode]);

  // Keyboard: close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleWL = () => setWatchlist(p => p.map(String).includes(codeStr) ? p.filter(c => String(c) !== codeStr) : [...p, codeStr]);
  const toggleCmp = () => setCompareList(p => { const s = p.map(String); if (s.includes(codeStr)) return p.filter(c => String(c) !== codeStr); if (p.length >= 4) return p; return [...p, codeStr]; });

  const nav = data?.data;
  const meta = data?.meta;
  const latestNAV = nav?.[0];
  const returns = nav ? {
    '1M': calcReturn(nav, 30),
    '3M': calcReturn(nav, 90),
    '6M': calcReturn(nav, 180),
    '1Y': calcReturn(nav, 365),
    '3Y': calcReturn(nav, 1095),
    '5Y': calcReturn(nav, 1825),
  } : {};

  // Fund age in years
  const fundAge = nav && nav.length > 1 ? (() => {
    const parseD = s => { const [dd,mm,yyyy] = s.split('-'); return new Date(`${yyyy}-${mm}-${dd}`); };
    const oldest = parseD(nav[nav.length - 1].date);
    const latest = parseD(nav[0].date);
    return ((latest - oldest) / (1000*60*60*24*365)).toFixed(1);
  })() : null;

    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true"/>

      {/* Modal */}
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mb-1">Fund Details</p>
            <h2 id="modal-title" className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">{schemeName}</h2>
          </div>
          <button onClick={onClose} aria-label="Close fund details" className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-lg font-bold transition-all">×</button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {Array(5).fill(0).map((_,i) => <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg"/>)}
            </div>
          )}

          {error && <div className="text-center py-8 text-slate-500">Failed to load fund data. Please try again.</div>}

          {!loading && !error && data && (
            <>
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Fund House', meta?.fund_house || '—'],
                  ['Category', meta?.scheme_category || '—'],
                  ['Type', meta?.scheme_type || '—'],
                  ['Scheme Code', `#${codeStr}`],
                ].map(([l,v]) => (
                  <div key={l} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{l}</p>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">{v}</p>
                  </div>
                ))}
              </div>

              {/* NAV + Age */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-xl p-4 border border-blue-100 dark:border-blue-900">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Latest NAV</p>
                  <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">₹{parseFloat(latestNAV?.nav || 0).toFixed(4)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">as of {latestNAV?.date}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fund Age</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{fundAge}</p>
                  <p className="text-[10px] text-slate-500">years old</p>
                </div>
              </div>

              {/* Returns */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">Performance Returns</h3>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {Object.entries(returns).map(([period, ret]) => {
                    const val = ret !== null ? parseFloat(ret) : null;
                    const isPos = val !== null && val >= 0;
                    return (
                      <div key={period} className={`rounded-xl p-3 text-center border ${val === null ? 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700' : isPos ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-100 dark:border-emerald-900' : 'bg-red-50 dark:bg-red-950 border-red-100 dark:border-red-900'}`}>
                        <p className="text-[10px] text-slate-500 mb-1">{period}</p>
                        <p className={`text-sm font-bold ${val === null ? 'text-slate-500' : isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {val === null ? '—' : `${isPos ? '+' : ''}${val}%`}
                        </p>
                        <p className="text-[9px] text-slate-500">{period.includes('Y') && parseInt(period) > 1 ? 'CAGR' : 'Abs'}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Data history */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>📅 NAV history: <strong className="text-slate-700 dark:text-slate-300">{nav?.length?.toLocaleString('en-IN')} data points</strong></span>
                <span>Since {nav?.[nav.length-1]?.date}</span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <button onClick={toggleWL}
                  aria-label={isWL ? 'Remove from watchlist' : 'Add to watchlist'}
                  aria-pressed={isWL}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all ${isWL ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950 border border-slate-200 dark:border-slate-700'}`}>
                  {isWL ? '⭐ Saved' : '⭐ Watchlist'}
                </button>
                <button onClick={toggleCmp}
                  aria-label={isCmp ? 'Remove from comparison' : compareList.length >= 4 ? 'Compare list is full' : 'Add to comparison'}
                  aria-pressed={isCmp}
                  disabled={!isCmp && compareList.length >= 4}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all ${isCmp ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' : compareList.length >= 4 ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 border border-slate-200 dark:border-slate-700'}`}>
                  {isCmp ? '⚖️ In Compare' : '⚖️ Compare'}
                </button>
                <Link to={`/compare?code=${codeStr}`} onClick={onClose}
                  className="py-2.5 rounded-xl text-xs font-bold text-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90 transition-all">
                  📊 Full Analysis →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
