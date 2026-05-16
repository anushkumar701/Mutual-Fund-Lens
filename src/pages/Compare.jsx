// pages/Compare.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useToast } from '../components/Toast';
import html2canvas from 'html2canvas';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { fetchFundDetail, useFunds } from '../hooks/useFunds';
import ErrorState from '../components/ErrorState';
import CategoryPill from '../components/CategoryPill';
import { formatNAV, formatINR } from '../utils/formatCurrency';
import { calculateFundMetrics, calculateHistoricalSIP, getSmartTags, calculateCorrelation, calculateBestWorstMonth } from '../utils/metrics';

const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444'];

function getFundAgeYears(navData) {
  if (!navData || navData.length === 0) return 0;
  const [dd, mm, yyyy] = navData[navData.length - 1].date.split('-');
  return (Date.now() - new Date(`${yyyy}-${mm}-${dd}`).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function filterByRange(data, range) {
  const now = new Date();
  const cutoff = new Date();
  switch (range) {
    case '1M':  cutoff.setMonth(now.getMonth() - 1); break;
    case '3M':  cutoff.setMonth(now.getMonth() - 3); break;
    case '6M':  cutoff.setMonth(now.getMonth() - 6); break;
    case '1Y':  cutoff.setFullYear(now.getFullYear() - 1); break;
    case '3Y':  cutoff.setFullYear(now.getFullYear() - 3); break;
    case '5Y':  cutoff.setFullYear(now.getFullYear() - 5); break;
    case '10Y': cutoff.setFullYear(now.getFullYear() - 10); break;
    case '15Y': cutoff.setFullYear(now.getFullYear() - 15); break;
    case '20Y': cutoff.setFullYear(now.getFullYear() - 20); break;
    case '25Y': cutoff.setFullYear(now.getFullYear() - 25); break;
    case 'MAX': return [...data].reverse(); // all data, oldest first
    default:    cutoff.setMonth(now.getMonth() - 6);
  }
  return data.filter((d) => {
    const [dd, mm, yyyy] = d.date.split('-');
    return new Date(`${yyyy}-${mm}-${dd}`) >= cutoff;
  }).reverse();
}

function buildChartData(funds, range) {
  if (!funds.length) return [];
  // Build map of date → { [schemeName]: nav_percentage }
  const dateMap = {};
  funds.forEach((f) => {
    if (!f.navData) return;
    const filtered = filterByRange(f.navData, range);
    if (!filtered.length) return;
    
    // filtered is reversed, so [0] is the oldest date in range
    const baseNav = parseFloat(filtered[0].nav);
    
    filtered.forEach((d) => {
      if (!dateMap[d.date]) dateMap[d.date] = { date: d.date };
      const currentNav = parseFloat(d.nav);
      // Store percentage change from the start of the period
      dateMap[d.date][f.meta?.scheme_name || f.schemeCode] = ((currentNav - baseNav) / baseNav) * 100;
      
      // Store raw NAV for tooltip if needed
      dateMap[d.date][`${f.meta?.scheme_name || f.schemeCode}_raw`] = currentNav;
    });
  });
  return Object.values(dateMap).sort((a, b) => {
    const parse = (s) => { const [dd, mm, yyyy] = s.split('-'); return new Date(`${yyyy}-${mm}-${dd}`); };
    return parse(a.date) - parse(b.date);
  });
}

// Collapse daily data to one row per month (last trading day of each month)
function toMonthlyData(chartData) {
  const monthMap = {};
  chartData.forEach(row => {
    const [dd, mm, yyyy] = row.date.split('-');
    const key = `${yyyy}-${mm}`;
    monthMap[key] = row; // last entry per month wins (data is sorted ascending)
  });
  return Object.values(monthMap).sort((a, b) => {
    const parse = s => { const [dd, mm, yyyy] = s.split('-'); return new Date(`${yyyy}-${mm}-${dd}`); };
    return parse(a.date) - parse(b.date);
  });
}

// 52-week high/low from navData
function get52WeekHL(navData) {
  if (!navData || navData.length === 0) return null;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const last52W = navData.filter(d => {
    const [dd, mm, yyyy] = d.date.split('-');
    return new Date(`${yyyy}-${mm}-${dd}`) >= cutoff;
  }).map(d => parseFloat(d.nav));
  if (last52W.length === 0) return null;
  return { high: Math.max(...last52W), low: Math.min(...last52W) };
}
// Monthly win rate: % of months fund gained NAV (consistency metric)
function getMonthlyWinRate(navData) {
  if (!navData || navData.length < 24) return null;
  const monthMap = {};
  navData.forEach(d => {
    const [dd, mm, yyyy] = d.date.split('-');
    const key = `${yyyy}-${mm}`;
    if (!monthMap[key]) monthMap[key] = parseFloat(d.nav); // first entry per month
  });
  const months = Object.keys(monthMap).sort().map(k => monthMap[k]);
  let wins = 0;
  for (let i = 1; i < months.length; i++) {
    if (months[i] > months[i - 1]) wins++;
  }
  return months.length > 1 ? Math.round((wins / (months.length - 1)) * 100) : null;
}

// Guess Expense Ratio based on plan/category keywords in name
function guessTER(schemeName) {
  if (!schemeName) return 0;
  const lower = schemeName.toLowerCase();

  const isPassive = lower.includes('index') || lower.includes('etf') || lower.includes('nifty') || lower.includes('sensex') || lower.includes('bse');
  const isLiquid = lower.includes('liquid') || lower.includes('overnight') || lower.includes('money market');
  const isDebt = lower.includes('debt') || lower.includes('bond') || lower.includes('gilt') || lower.includes('credit risk') || lower.includes('duration');
  const isDirect = lower.includes('direct');
  const isRegular = lower.includes('regular');

  if (isPassive) {
    return isDirect ? 0.10 : (isRegular ? 0.35 : 0.20);
  }
  if (isLiquid) {
    return isDirect ? 0.12 : (isRegular ? 0.28 : 0.20);
  }
  if (isDebt) {
    return isDirect ? 0.40 : (isRegular ? 1.05 : 0.65);
  }

  // Active equity / hybrid
  return isDirect ? 0.64 : (isRegular ? 1.65 : 1.10);
}

// Estimate minimum investment since API doesn't provide it
function guessMinInvestment(schemeName) {
  if (!schemeName) return { sip: 500, lump: 1000 };
  const lower = schemeName.toLowerCase();
  if (lower.includes('elss') || lower.includes('tax')) return { sip: 500, lump: 500 };
  if (lower.includes('nifty') || lower.includes('index')) return { sip: 100, lump: 500 };
  if (lower.includes('parag parikh')) return { sip: 1000, lump: 1000 };
  return { sip: 500, lump: 1000 };
}

function ComparedFundCard({ fund, color, onRemove }) {
  const { meta, navData } = fund;
  const latestNav = navData?.[0]?.nav ? parseFloat(navData[0].nav) : null;
  const schemeName = meta?.scheme_name || 'Unknown';
  const hl = get52WeekHL(navData);
  const hlPosition = hl && latestNav ? Math.min(100, Math.max(0, ((latestNav - hl.low) / (hl.high - hl.low)) * 100)) : null;
  return (
    <div className="card p-5 relative border-l-4" style={{ borderLeftColor: color }}>
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-red-50 dark:bg-red-900 text-red-500 hover:bg-red-100 flex items-center justify-center text-sm"
        title="Remove"
      >
        ✕
      </button>
      <div className="space-y-3 pr-8">
        <CategoryPill schemeName={schemeName} />
        <h3 className="font-semibold text-sm text-slate-900 dark:text-white leading-snug">{schemeName}</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-slate-400">Latest NAV</span>
            <div className="font-bold text-slate-900 dark:text-white text-sm tabular-nums">{latestNav ? `₹${latestNav.toFixed(4)}` : '—'}</div>
          </div>
          <div>
            <span className="text-slate-400">Fund Age</span>
            <div className="font-bold text-slate-900 dark:text-white text-sm">
              {navData && navData.length > 0 ? `${Math.floor(getFundAgeYears(navData))} yrs` : '—'}
            </div>
          </div>
          <div>
            <span className="text-slate-400">Fund House</span>
            <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs line-clamp-1">{meta?.fund_house || '—'}</div>
          </div>
          <div>
            <span className="text-slate-400">Scheme Type</span>
            <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs line-clamp-1">{meta?.scheme_type || '—'}</div>
          </div>
          {/* Estimated Minimum Investments */}
          {(() => {
            const minInvest = guessMinInvestment(schemeName);
            return (
              <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex justify-between">
                <div>
                  <span className="text-slate-400 flex items-center gap-1">Min SIP 
                    <span className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-700 rounded-full w-3 h-3 flex items-center justify-center font-bold">
                      ?
                      <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight">
                        Estimated minimum SIP amount. Please verify with AMC website.
                      </span>
                    </span>
                  </span>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs tabular-nums">₹{minInvest.sip}</div>
                </div>
                <div>
                  <span className="text-slate-400 flex items-center gap-1">Min Lumpsum 
                    <span className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-700 rounded-full w-3 h-3 flex items-center justify-center font-bold">
                      ?
                      <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight">
                        Estimated minimum Lumpsum amount. Please verify with AMC website.
                      </span>
                    </span>
                  </span>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs tabular-nums">₹{minInvest.lump}</div>
                </div>
              </div>
            );
          })()}
        </div>
        {/* 52-Week High/Low bar */}
        {hl && latestNav && (
          <div className="mt-2">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>52W Low: ₹{hl.low.toFixed(2)}</span>
              <span>52W High: ₹{hl.high.toFixed(2)}</span>
            </div>
            <div className="relative h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-400 via-amber-400 to-emerald-400" style={{ width: '100%' }} />
              <div
                className="absolute top-0 w-2 h-2 bg-white border-2 border-slate-600 dark:border-slate-300 rounded-full -translate-x-1/2"
                style={{ left: `${hlPosition}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 text-center">
              {hlPosition !== null ? `${hlPosition.toFixed(0)}% from 52W low` : ''}
            </p>
          </div>
        )}

        {/* Metrics */}
        {(() => {
          const metrics = calculateFundMetrics(navData);
          if (!metrics) return <div className="text-xs text-slate-400 mt-3 border-t border-slate-100 dark:border-slate-700 pt-3">Metrics not available</div>;
          
          const score = null; // FundLens Score removed
          const tags = getSmartTags(metrics);
          
          let riskLevel = 'Unknown';
          let riskDots = '○○○○○';
          if (metrics.volatility) {
            if (metrics.volatility < 10) { riskLevel = 'Low'; riskDots = '●○○○○'; }
            else if (metrics.volatility < 15) { riskLevel = 'Moderate'; riskDots = '●●○○○'; }
            else if (metrics.volatility < 20) { riskLevel = 'High'; riskDots = '●●●○○'; }
            else { riskLevel = 'Very High'; riskDots = '●●●●●'; }
          }
          
          return (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-4">
              {/* Volatility & Risk — FundLens Score removed */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-0.5">Volatility (Ann.)</span>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {metrics.volatility ? `${metrics.volatility.toFixed(1)}%` : '—'}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-0.5">Risk Level</span>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 justify-end">
                    <span>{riskLevel}</span>
                    <span className="text-[10px] tracking-tighter text-blue-500">{riskDots}</span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <span key={t} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[10px] font-semibold border border-blue-100 dark:border-blue-800">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Performance Grid */}
              <div>
                <h4 className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wider">Performance</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">1Y Return</span>
                    <div className={`font-bold text-sm ${metrics.return1Y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {metrics.return1Y !== null ? `${metrics.return1Y.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">3Y CAGR</span>
                    <div className={`font-bold text-sm ${metrics.return3Y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {metrics.return3Y !== null ? `${metrics.return3Y.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">5Y CAGR</span>
                    <div className={`font-bold text-sm ${metrics.return5Y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {metrics.return5Y !== null ? `${metrics.return5Y.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Max Drawdown</span>
                    <div className="font-bold text-sm text-red-600 dark:text-red-400">
                      {metrics.maxDrawdown > 0 ? `-${metrics.maxDrawdown.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 flex items-center gap-1">Sharpe Ratio <span className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-600 rounded px-1">?
                      <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight">
                        (1Y Return − 6.5%) ÷ Volatility. Measures risk-adjusted return. Above 1 = Good, above 2 = Excellent.
                      </span>
                    </span></span>
                    <div className={`font-bold text-sm ${metrics.sharpe > 1 ? 'text-emerald-600 dark:text-emerald-400' : metrics.sharpe > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {metrics.sharpe !== null && metrics.sharpe !== undefined ? metrics.sharpe : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 flex items-center gap-1">Sortino Ratio 
                      <span className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-600 rounded px-1">
                        ?
                        <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight">
                          Like Sharpe but only penalizes downside risk. Higher is better.
                        </span>
                      </span>
                    </span>
                    <div className={`font-bold text-sm ${metrics.sortino > 1 ? 'text-emerald-600 dark:text-emerald-400' : metrics.sortino > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {metrics.sortino !== null && metrics.sortino !== undefined ? metrics.sortino : '—'}
                    </div>
                  </div>
                  {/* Win Rate — % of months fund was positive */}
                  {(() => {
                    const wr = getMonthlyWinRate(navData);
                    return wr !== null ? (
                      <div>
                        <span className="text-slate-400 flex items-center gap-1">
                          Win Rate
                          <span className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-600 rounded px-1">
                            ?
                            <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight">
                              % of months fund posted a gain. &gt;60% = very consistent.
                            </span>
                          </span>
                        </span>
                        <div className={`font-bold text-sm ${wr >= 60 ? 'text-emerald-600 dark:text-emerald-400' : wr >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                          {wr}%
                          <span className="text-[10px] font-normal text-slate-400 ml-1">{wr >= 60 ? '✓ Consistent' : wr >= 50 ? 'Average' : 'Volatile'}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {/* 10Y CAGR if available */}
                  {metrics.return10Y !== null && metrics.return10Y !== undefined && (
                    <div>
                      <span className="text-slate-400">10Y CAGR</span>
                      <div className={`font-bold text-sm ${metrics.return10Y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {metrics.return10Y.toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default function Compare() {
  const [searchParams] = useSearchParams();
  const { funds, loading: fundsLoading } = useFunds();
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);
  const [recentList, setRecentList] = useLocalStorage('fundlens_recent', []);
  const [fundData, setFundData] = useState([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const [loadingCode, setLoadingCode] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [range, setRange] = useState('6M');
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'table'
  const [rollingYears, setRollingYears] = useState(3); // for adjustable rolling returns
  const toast = useToast();

  // SIP comparison state
  const [sipAmount, setSipAmount] = useState(5000);
  const [sipAmountInput, setSipAmountInput] = useState('5000');
  const [sipYears, setSipYears] = useState(3);
  const [sipYearsInput, setSipYearsInput] = useState('3');
  const [sipMode, setSipMode] = useState('sip'); // 'sip' | 'lumpsum'
  const [sipExpenseRatio, setSipExpenseRatio] = useState(0); // kept for compat
  const [sipFundTER, setSipFundTER] = useState({}); // per-fund TER: { [schemeCode]: 0.5 }
  const setFundTER = (code, val) => setSipFundTER(prev => ({ ...prev, [String(code)]: val }));
  const [sipDay, setSipDay] = useState(1); // SIP date: 1, 5, 10, 15, 25

  // Load funds from compareList
  const errorTimerRef = useRef(null);

  const showError = (msg) => {
    setFetchError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setFetchError(''), 4000);
  };

  const loadFund = useCallback(async (code) => {
    if (fundData.find((f) => f.schemeCode === code)) return;
    setLoadingCode(code);
    setFetchError('');
    let timerId = setTimeout(() => {
      toast('Fetching live data, please hold on...', 'info', 4000);
    }, 5000);
    try {
      const data = await fetchFundDetail(code);
      setFundData((prev) => [
        ...prev.filter((f) => f.schemeCode !== code),
        { schemeCode: code, meta: data.meta, navData: data.data },
      ]);
      setRecentList((prev) => {
        const list = prev.filter((c) => c !== code);
        return [code, ...list].slice(0, 6);
      });
      setFetchError(''); // clear error on success
    } catch {
      showError(`Scheme code "${code}" not found. Enter numeric codes only (e.g. 122639).`);
    } finally {
      clearTimeout(timerId);
      setLoadingCode(null);
    }
  }, [fundData, toast]);

  // Load from URL param
  useEffect(() => {
    const codeParam = searchParams.get('code');
    const fundsParam = searchParams.get('funds');
    
    let codesToAdd = [];
    if (codeParam) codesToAdd.push(codeParam);
    if (fundsParam) codesToAdd.push(...fundsParam.split(','));
    
    if (codesToAdd.length > 0) {
      setCompareList((prev) => {
        const unique = new Set([...prev, ...codesToAdd]);
        return Array.from(unique).slice(0, 4);
      });
    }
  }, [searchParams]);

  // Load all codes in compareList
  useEffect(() => {
    compareList.forEach((code) => {
      if (!fundData.find((f) => f.schemeCode === code)) {
        loadFund(code);
      }
    });
  }, [compareList]);

  const handleAddCode = (code) => {
    if (compareList.length >= 4) {
      showError('You can compare up to 4 funds at a time.');
      return;
    }
    if (compareList.includes(code.toString())) {
      showError('This fund is already in your comparison.');
      return;
    }
    setCompareList((prev) => [...prev, code.toString()]);
    loadFund(code.toString());
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    // If it's a numeric code, add directly
    if (/^\d+$/.test(searchQuery.trim())) {
      handleAddCode(searchQuery.trim());
      return;
    }
    
    // Otherwise rely on dropdown selection
  };

  const filteredSearch = funds
    ? funds.filter((f) => 
        f.schemeName.toLowerCase().includes(searchQuery.toLowerCase()) || 
        f.schemeCode.toString().includes(searchQuery)
      ).slice(0, 10)
    : [];

  const removeFund = (code) => {
    setCompareList((prev) => prev.filter((c) => c !== code));
    setFundData((prev) => prev.filter((f) => f.schemeCode !== code));
  };

  const clearAll = () => {
    setCompareList([]);
    setFundData([]);
  };

  const handleExport = async () => {
    const el = document.getElementById('compare-export-area');
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { backgroundColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#f8fafc' });
      const link = document.createElement('a');
      link.download = `fundlens-comparison-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Export failed', e);
      showError('Failed to generate export image.');
    }
  };

  const handleCopyLink = () => {
    if (compareList.length === 0) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.set('funds', compareList.join(','));
    navigator.clipboard.writeText(url.toString()).then(() => {
      toast('Comparison link copied to clipboard!', 'success');
    }).catch(() => {
      toast('Failed to copy link. Please copy the URL manually.', 'error');
    });
  };

  let chartData = buildChartData(fundData, range);
  // Downsample to monthly data for long ranges to make the chart lines smooth and clean
  if (['3Y', '5Y', '10Y', '15Y', '20Y', '25Y', 'MAX'].includes(range)) {
    chartData = toMonthlyData(chartData);
  }
  // Monthly-only version for table view (one row per month, end-of-month)
  const monthlyChartData = toMonthlyData(chartData);


  // Annual calendar-year returns for each fund
  const annualReturns = (() => {
    if (fundData.length === 0) return { years: [], data: {} };
    const now = new Date();
    const currentYear = now.getFullYear();
    let oldestYear = currentYear;
    fundData.forEach(f => {
      if (!f.navData || f.navData.length === 0) return;
      const [, , yyyy] = f.navData[f.navData.length - 1].date.split('-');
      oldestYear = Math.min(oldestYear, parseInt(yyyy));
    });
    const allYears = [];
    for (let y = currentYear; y >= oldestYear; y--) allYears.push(y);

    const data = {};
    fundData.forEach(fund => {
      const name = fund.meta?.scheme_name || String(fund.schemeCode);
      if (!fund.navData) return;
      allYears.forEach(year => {
        const startTarget = new Date(`${year}-01-01`);
        const endTarget = year === currentYear ? now : new Date(`${year}-12-31`);
        let sNav = null, eNav = null, minSD = Infinity, minED = Infinity;
        fund.navData.forEach(d => {
          const [dd, mm, yy] = d.date.split('-');
          const dt = new Date(`${yy}-${mm}-${dd}`);
          const sd = Math.abs(dt - startTarget);
          const ed = Math.abs(dt - endTarget);
          if (sd < minSD) { minSD = sd; sNav = parseFloat(d.nav); }
          if (ed < minED) { minED = ed; eNav = parseFloat(d.nav); }
        });
        if (!data[year]) data[year] = {};
        // Only record if start NAV is within 20 days of Jan 1
        if (sNav && eNav && minSD < 20 * 86400000) {
          data[year][name] = ((eNav - sNav) / sNav) * 100;
        }
      });
    });
    const validYears = allYears.filter(y => Object.keys(data[y] || {}).length > 0);
    return { years: validYears, data };
  })();

  // Overlap matrix for ALL fund pairs
  const overlapMatrix = [];
  if (fundData.length >= 2) {
    for (let i = 0; i < fundData.length; i++) {
      for (let j = i + 1; j < fundData.length; j++) {
        const corr = calculateCorrelation(fundData[i].navData, fundData[j].navData);
        if (corr !== null) {
          const score = Math.max(0, corr * 100);
          overlapMatrix.push({
            a: fundData[i].meta?.scheme_name || `Fund ${i + 1}`,
            b: fundData[j].meta?.scheme_name || `Fund ${j + 1}`,
            score,
            quality: score > 80 ? 'High Overlap' : score > 50 ? 'Medium Overlap' : 'Low Overlap ✓',
            color: score > 80 ? 'text-red-500' : score > 50 ? 'text-amber-500' : 'text-emerald-500',
          });
        }
      }
    }
  }

  // Dynamic time ranges based on minimum fund age
  const minFundAge = fundData.length > 0
    ? Math.min(...fundData.map(f => getFundAgeYears(f.navData || [])))
    : 0;
  const availableRanges = ['1M', '3M', '6M'];
  if (minFundAge >= 1)  availableRanges.push('1Y');
  if (minFundAge >= 3)  availableRanges.push('3Y');
  if (minFundAge >= 5)  availableRanges.push('5Y');
  if (minFundAge >= 10) availableRanges.push('10Y');
  if (minFundAge >= 15) availableRanges.push('15Y');
  if (minFundAge >= 20) availableRanges.push('20Y');
  if (minFundAge >= 25) availableRanges.push('25Y');
  if (minFundAge >= 1)  availableRanges.push('MAX');
  // Ensure selected range is valid
  if (!availableRanges.includes(range) && availableRanges.length > 0) {
    // Will auto-correct when range buttons render
  }

  // Max SIP years = minimum fund age across all compared funds (floor)
  const maxSipYears = fundData.length > 0
    ? Math.max(1, Math.floor(Math.min(...fundData.map(f => getFundAgeYears(f.navData || [])))))
    : 20;
  // Build available SIP year options up to maxSipYears
  const sipYearOptions = [1, 3, 5, 7, 10, 15, 20].filter(y => y <= maxSipYears);
  if (sipYearOptions.length === 0) sipYearOptions.push(1);

  // Calculate the most recent NAV date across all loaded funds
  const lastRefreshedDate = fundData.length > 0 
    ? fundData.reduce((latest, f) => {
        if (!f.navData || f.navData.length === 0) return latest;
        const [dd, mm, yyyy] = f.navData[0].date.split('-');
        const current = new Date(`${yyyy}-${mm}-${dd}`);
        return current > latest ? current : latest;
      }, new Date('2000-01-01')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Fund Comparison
              {lastRefreshedDate && (
                <span className="text-[10px] font-semibold tracking-wider uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                  Last Refreshed: {lastRefreshedDate}
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Compare up to 4 mutual funds side by side</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fundData.length > 0 && (
              <>
                <button onClick={handleCopyLink} className="btn-secondary text-xs px-3 py-2 border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400">
                  🔗 Share Link
                </button>
                <button onClick={handleExport} className="btn-secondary text-xs px-3 py-2">
                  📸 Export PNG
                </button>
                <button id="clear-all-btn" onClick={clearAll} className="btn-secondary text-red-500 border-red-200 dark:border-red-800 text-xs px-3 py-2">
                  Clear All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tip banner */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
          <span className="mt-0.5">💡</span>
          <span>Search for funds below by name or scheme code (e.g. Parag Parikh or 122639) to add them to comparison.</span>
        </div>

        {/* Add fund search */}
        <form onSubmit={handleSearchSubmit} className="relative z-20">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search funds by name or code..."
                className="input-base pl-10"
                disabled={compareList.length >= 4}
              />
              
              {/* Autocomplete Dropdown */}
              {showDropdown && searchQuery && filteredSearch.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                  {filteredSearch.map((f) => (
                    <button
                      key={f.schemeCode}
                      type="button"
                      onClick={() => handleAddCode(f.schemeCode)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors flex justify-between items-center"
                    >
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1 pr-4">{f.schemeName}</span>
                      <span className="text-xs text-slate-400 font-mono">#{f.schemeCode}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={compareList.length >= 4 || !searchQuery.trim() || loadingCode}
              className="btn-primary whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {loadingCode ? (
                <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Loading…</span>
              ) : '+ Add'}
            </button>
          </div>
        </form>

        {fetchError && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-lg">
            {fetchError}
          </div>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500">
          {compareList.length}/4 funds added. You can find scheme codes on the Screener page.
        </p>

        {/* Wrap content in export div */}
        <div id="compare-export-area" className="space-y-6 bg-slate-50 dark:bg-slate-900 -mx-4 px-4 py-2 sm:mx-0 sm:px-0 sm:py-0">
          
          {/* Fund cards */}
          {fundData.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No funds added yet</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Enter a scheme code above or search funds to start comparing.</p>
            </div>
          ) : (
            <>
              {/* Overlap Analyzer — all pairs */}
              {overlapMatrix.length > 0 && (
                <div className="card p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-lg">🧬</div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">Overlap & Diversification Analyzer</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Correlation-based overlap score between all compared funds</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {overlapMatrix.map((pair, idx) => (
                      <div key={idx} className="flex-1 min-w-[200px] bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                        <p className="text-[10px] text-slate-400 line-clamp-1 mb-0.5">
                          {pair.a.split(' ').slice(0, 3).join(' ')} vs {pair.b.split(' ').slice(0, 3).join(' ')}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-slate-900 dark:text-white">{pair.score.toFixed(1)}%</span>
                          <span className={`text-xs font-bold ${pair.color}`}>{pair.quality}</span>
                        </div>
                        {/* Mini progress bar */}
                        <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pair.score > 80 ? 'bg-red-400' : pair.score > 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${pair.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3">
                    💡 Low overlap = better diversification. High overlap means both funds move similarly.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {fundData.map((fund, i) => (
                  <ComparedFundCard
                    key={fund.schemeCode}
                    fund={fund}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                    onRemove={() => removeFund(fund.schemeCode)}
                  />
                ))}
              </div>

            {/* NAV History Chart */}
            <div className="card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white text-lg">Relative Performance</h2>
                    <p className="text-xs text-slate-400 mt-0.5">% growth from the start of the selected period — funds are fairly compared regardless of NAV level</p>
                  </div>
                  <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
                    <button
                      onClick={() => setViewMode('chart')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        viewMode === 'chart' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Chart
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        viewMode === 'table' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Table
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 flex-wrap">
                  {availableRanges.map((r) => (
                    <button
                      key={r}
                      id={`range-${r}`}
                      onClick={() => setRange(r)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        range === r
                          ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {viewMode === 'chart' ? (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.15)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={40}
                      tickFormatter={(val) => {
                        if (!val) return '';
                        const [dd, mm, yyyy] = val.split('-');
                        const d = new Date(`${yyyy}-${mm}-${dd}`);
                        if (isNaN(d.getTime())) return val;
                        
                        // Dynamic formatting based on selected range
                        if (['1M', '3M', '6M'].includes(range)) {
                          return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }); // e.g. 15 Jan
                        } else if (['1Y', '3Y'].includes(range)) {
                          return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); // e.g. Jan 23
                        } else {
                          return d.toLocaleDateString('en-US', { year: 'numeric' }); // e.g. 2023
                        }
                      }}
                      dy={10}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v >= 0 ? '+' : ''}${parseFloat(v).toFixed(1)}%`}
                      width={60}
                      dx={-10}
                    />
                    <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" strokeDasharray="3 3" />
                    <Tooltip
                      labelFormatter={(label) => {
                        if (!label) return '';
                        const [dd, mm, yyyy] = label.split('-');
                        const d = new Date(`${yyyy}-${mm}-${dd}`);
                        if (isNaN(d.getTime())) return label;
                        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                      }}
                      formatter={(value, name) => {
                        if (name.endsWith('_raw')) return null;
                        return [`${parseFloat(value) >= 0 ? '+' : ''}${parseFloat(value).toFixed(2)}%`, name];
                      }}
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        padding: '10px 14px'
                      }}
                      itemStyle={{ color: '#f8fafc', paddingBottom: '4px' }}
                      labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontWeight: '600' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }} iconType="circle" />
                    {fundData.map((fund, i) => (
                      <Line
                        key={fund.schemeCode}
                        type="monotone"
                        dataKey={fund.meta?.scheme_name || fund.schemeCode}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 0, fill: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                // Period-Returns Summary Table — clean and useful
                (() => {
                  const PERIOD_DEFS = [
                    { label: '1 Month', months: 1 },
                    { label: '3 Months', months: 3 },
                    { label: '6 Months', months: 6 },
                    { label: '1 Year', months: 12 },
                    { label: '2 Years', months: 24 },
                    { label: '3 Years', months: 36 },
                    { label: '5 Years', months: 60 },
                    { label: '7 Years', months: 84 },
                    { label: '10 Years', months: 120 },
                  ];
                  // Calculate returns for each fund for each period
                  const calcReturn = (navData, months) => {
                    if (!navData || navData.length === 0) return null;
                    const latestNav = parseFloat(navData[0].nav);
                    const latestDate = new Date(navData[0].date.split('-').reverse().join('-'));
                    const targetDate = new Date(latestDate);
                    targetDate.setMonth(targetDate.getMonth() - months);
                    let closest = null, minDiff = Infinity;
                    for (const d of navData) {
                      const dt = new Date(d.date.split('-').reverse().join('-'));
                      const diff = Math.abs(dt - targetDate);
                      if (diff < minDiff) { minDiff = diff; closest = parseFloat(d.nav); }
                    }
                    if (!closest || minDiff > 45 * 86400000) return null;
                    const ret = ((latestNav - closest) / closest) * 100;
                    // For >= 12 months, show CAGR
                    if (months >= 12) {
                      const years = months / 12;
                      return (Math.pow(latestNav / closest, 1 / years) - 1) * 100;
                    }
                    return ret;
                  };
                  const validPeriods = PERIOD_DEFS.filter(p => {
                    // Only show period if at least one fund has enough data
                    return fundData.some(f => calcReturn(f.navData, p.months) !== null);
                  });
                  return (
                    <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 font-semibold whitespace-nowrap">Period</th>
                            <th className="px-3 py-3 font-semibold text-slate-400 text-[10px]">Type</th>
                            {fundData.map((fund, i) => (
                              <th key={fund.schemeCode} className="px-4 py-3 font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                                <div className="line-clamp-1 max-w-[140px]" title={fund.meta?.scheme_name}>
                                  {fund.meta?.scheme_name?.split(' ').slice(0,3).join(' ') || fund.schemeCode}
                                </div>
                              </th>
                            ))}
                            {fundData.length >= 2 && <th className="px-3 py-3 font-semibold text-slate-400">Leader</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {validPeriods.map(p => {
                            const rets = fundData.map(f => calcReturn(f.navData, p.months));
                            const defined = rets.filter(r => r !== null);
                            const bestRet = defined.length > 0 ? Math.max(...defined) : null;
                            const leaderIdx = rets.indexOf(bestRet);
                            return (
                              <tr key={p.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{p.label}</td>
                                <td className="px-3 py-3 text-[10px] text-slate-400">{p.months >= 12 ? 'CAGR' : 'Abs'}</td>
                                {rets.map((ret, i) => (
                                  <td key={i} className={`px-4 py-3 font-bold text-sm tabular-nums ${
                                    ret === null ? 'text-slate-300 dark:text-slate-600' :
                                    ret >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                                  }`}>
                                    <span className={i === leaderIdx && defined.length > 1 ? 'bg-emerald-50 dark:bg-emerald-900/30 px-1 rounded' : ''}>
                                      {ret === null ? '—' : `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`}
                                    </span>
                                  </td>
                                ))}
                                {fundData.length >= 2 && (
                                  <td className="px-3 py-3 text-[10px]">
                                    {leaderIdx >= 0 && defined.length > 1 ? (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                        {fundData[leaderIdx]?.meta?.scheme_name?.split(' ')[0] || `Fund ${leaderIdx+1}`}
                                      </span>
                                    ) : '—'}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-slate-400 p-3">Returns for 1Y+ are shown as CAGR (annualised). Highlighted = best performer for that period.</p>
                    </div>
                  );
                })()
              )}
              {chartData.length === 0 && (
                <p className="text-center text-sm text-slate-400 dark:text-slate-500 mt-4">
                  No chart data available for selected range.
                </p>
              )}
            </div>

            {/* ── Annual Returns Table ── */}
            {annualReturns.years.length > 0 && (
              <div className="card p-5">
                <div className="mb-4">
                  <h2 className="font-bold text-slate-900 dark:text-white text-lg">📅 Annual Returns (Calendar Year)</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Jan–Dec returns for each fund. <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Green = gain</span>, <span className="text-red-500 font-semibold">Red = loss</span>. Helps identify consistency over market cycles.
                  </p>
                </div>
                <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">Year</th>
                        {fundData.map((fund, i) => (
                          <th key={fund.schemeCode} className="px-4 py-3 font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                            <div className="line-clamp-1 max-w-[160px]" title={fund.meta?.scheme_name}>
                              {fund.meta?.scheme_name?.split(' ').slice(0, 4).join(' ') || fund.schemeCode}
                            </div>
                          </th>
                        ))}
                        {fundData.length >= 2 && <th className="px-4 py-3 font-semibold text-slate-400">Difference</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {annualReturns.years.map(year => {
                        const row = annualReturns.data[year] || {};
                        const vals = fundData.map(f => row[f.meta?.scheme_name || String(f.schemeCode)]);
                        const defined = vals.filter(v => v !== undefined);
                        const bestVal = defined.length > 0 ? Math.max(...defined) : null;
                        const worstVal = defined.length > 0 ? Math.min(...defined) : null;
                        // Market events by year — both bad AND good years explained
                        const MARKET_EVENTS = {
                          2003: { label: '🟢 Post dot-com recovery rally', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
                          2007: { label: '🟢 Pre-crisis bull market peak', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
                          2008: { label: '🔴 Global Financial Crisis (Lehman collapse)', color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' },
                          2009: { label: '🟢 Post-GFC recovery boom', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
                          2011: { label: '🟡 Eurozone debt crisis, INR fall', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
                          2014: { label: '🟢 Modi 1.0 election rally', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
                          2015: { label: '🟡 China slowdown, global sell-off', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
                          2016: { label: '🟡 Demonetisation shock (Nov 2016)', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
                          2017: { label: '🟢 GST rollout + global bull run', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
                          2019: { label: '🟡 NBFC crisis, slow growth', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
                          2020: { label: '🔴 COVID-19 crash (Mar 2020)', color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' },
                          2021: { label: '🟢 Bull run — vaccine rally & stimulus', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
                          2022: { label: '🔴 Russia-Ukraine war + aggressive rate hikes', color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' },
                          2023: { label: '🟢 Recovery rally, FII inflows', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
                          2024: { label: '🟡 Election year + US rate uncertainty', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' },
                          2025: { label: '🟢 Retail-driven resilience despite FII outflows', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
                          2026: { label: '🔴 High volatility, Geopolitics & FII sell-off', color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' },
                        };
                        const event = MARKET_EVENTS[year];
                        return (
                          <tr key={year} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">
                              <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-1.5">
                                  {year}
                                  {year === new Date().getFullYear() && (
                                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded font-semibold">YTD</span>
                                  )}
                                </span>
                                {event && (
                                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full w-fit ${event.color}`}>
                                    {event.label}
                                  </span>
                                )}
                              </div>
                            </td>
                            {fundData.map(fund => {
                              const name = fund.meta?.scheme_name || String(fund.schemeCode);
                              const val = row[name];
                              const isGain = val !== undefined && val >= 0;
                              const isBest = val !== undefined && val === bestVal && defined.length > 1;
                              return (
                                <td key={fund.schemeCode} className={`px-4 py-3 font-semibold text-sm tabular-nums ${
                                  val === undefined ? 'text-slate-300 dark:text-slate-600' :
                                  isGain ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                                }`}>
                                  <span className={isBest ? 'bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded' : ''}>
                                    {val === undefined ? '—' : `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`}
                                  </span>
                                </td>
                              );
                            })}
                            {fundData.length >= 2 && (
                              <td className="px-4 py-3 text-xs">
                                {(() => {
                                  if (defined.length < 2) return <span className="text-slate-300">—</span>;
                                  const diff = Math.max(...defined) - Math.min(...defined);
                                  const winnerIdx = vals.indexOf(bestVal);
                                  const loserIdx = vals.indexOf(worstVal);
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{diff.toFixed(2)}% spread</span>
                                      {winnerIdx >= 0 && defined.length > 1 && (
                                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400">
                                          🏆 {fundData[winnerIdx]?.meta?.scheme_name?.split(' ')[0] || `F${winnerIdx+1}`}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                  💡 Look for funds that limit losses in bad years (2020, 2022). Consistent compounders beat volatile outperformers long-term.
                </p>
              </div>
            )}

            {/* ── Adjustable Rolling Returns ── */}
            {fundData.length > 0 && (
              <div className="card p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white text-lg">📉 Rolling Returns Analysis</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Shows Min, Avg, and Max returns for every rolling window of the selected duration. Helps you see the worst and best case scenarios.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Window:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 5, 7, 10].filter(y => y <= maxSipYears || maxSipYears >= y).map(y => (
                        <button key={y} onClick={() => setRollingYears(y)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                            rollingYears === y
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}>{y}Y</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/60">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Metric</th>
                        {fundData.map((fund, i) => (
                          <th key={fund.schemeCode} className="px-4 py-3 font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                            <div className="line-clamp-1 max-w-[160px]" title={fund.meta?.scheme_name}>
                              {fund.meta?.scheme_name?.split(' ').slice(0, 3).join(' ') || fund.schemeCode}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {[['Min Return', 0], ['Avg Return', 1], ['Max Return', 2]].map(([label, ri]) => (
                        <tr key={label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                            <div className="flex flex-col">
                              <span className={ri === 0 ? 'text-red-500' : ri === 2 ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}>{label}</span>
                              <span className="text-[9px] text-slate-400 font-normal">
                                {ri === 0 ? `Worst ${rollingYears}Y window` : ri === 2 ? `Best ${rollingYears}Y window` : `Average ${rollingYears}Y window`}
                              </span>
                            </div>
                          </td>
                          {fundData.map(fund => {
                            const navs = fund.navData || [];
                            const windowDays = rollingYears * 252;
                            if (navs.length < windowDays + 10) return (
                              <td key={fund.schemeCode} className="px-4 py-3 text-slate-400 text-xs">Not enough data</td>
                            );
                            let minR = Infinity, maxR = -Infinity, sum = 0, count = 0;
                            for (let i = 0; i < navs.length - windowDays; i++) {
                              const endNav = parseFloat(navs[i].nav);
                              const startNav = parseFloat(navs[i + windowDays].nav);
                              const cagr = (Math.pow(endNav / startNav, 1 / rollingYears) - 1) * 100;
                              if (cagr < minR) minR = cagr;
                              if (cagr > maxR) maxR = cagr;
                              sum += cagr; count++;
                            }
                            const avgR = sum / count;
                            const val = ri === 0 ? minR : ri === 2 ? maxR : avgR;
                            const colorClass = ri === 0 ? 'text-red-600 dark:text-red-400' : ri === 2 ? 'text-emerald-600 dark:text-emerald-400' : (val >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-red-500');
                            return (
                              <td key={fund.schemeCode} className={`px-4 py-3 font-bold text-sm tabular-nums ${colorClass}`}>
                                {val !== Infinity && val !== -Infinity ? `${val >= 0 ? '+' : ''}${val.toFixed(2)}% p.a.` : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">💡 If the Min Return is positive, the fund has NEVER given a loss in any {rollingYears}-year period historically. This is a powerful safety signal for long-term investors.</p>
              </div>
            )}



            {/* Historical SIP Comparison */}
            <div className="card p-5 mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-lg">Real Historical Performance</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Based on actual NAV data — <span className="font-semibold text-emerald-600 dark:text-emerald-400">returns are already net of expense ratio</span>. Max period = youngest fund's age ({maxSipYears} yr).
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  {/* SIP / Lumpsum Toggle */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider">Mode</label>
                    <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 gap-0.5">
                      <button
                        onClick={() => setSipMode('sip')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${sipMode === 'sip' ? 'bg-white dark:bg-slate-600 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                      >SIP</button>
                      <button
                        onClick={() => setSipMode('lumpsum')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${sipMode === 'lumpsum' ? 'bg-white dark:bg-slate-600 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                      >Lumpsum</button>
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider">{sipMode === 'sip' ? 'Monthly SIP' : 'Lumpsum'}</label>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 text-sm">₹</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={sipAmountInput}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setSipAmountInput(raw);
                          const v = parseInt(raw, 10);
                          if (!isNaN(v) && v >= 100) setSipAmount(v);
                        }}
                        onBlur={() => {
                          if (!sipAmountInput || parseInt(sipAmountInput, 10) < 100) {
                            setSipAmountInput(String(sipAmount));
                          }
                        }}
                        className="input-base w-28 py-1.5 text-sm"
                        placeholder="5000"
                      />
                    </div>
                    <div className="flex gap-1">
                      {(sipMode === 'lumpsum' ? [10000, 50000, 100000, 500000] : [1000, 5000, 10000, 25000]).map(p => (
                        <button key={p} onClick={() => { setSipAmount(p); setSipAmountInput(String(p)); }}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${
                            sipAmount === p && sipAmountInput === String(p)
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}>
                          {p >= 100000 ? `${p/100000}L` : `${p/1000}K`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Year custom input */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider">Period <span className="normal-case">(max {maxSipYears}yr)</span></label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={sipYearsInput}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setSipYearsInput(raw);
                          const v = parseInt(raw, 10);
                          if (!isNaN(v) && v >= 1 && v <= maxSipYears) setSipYears(v);
                        }}
                        onBlur={() => {
                          const v = parseInt(sipYearsInput, 10);
                          if (isNaN(v) || v < 1) { setSipYearsInput('1'); setSipYears(1); }
                          else if (v > maxSipYears) { setSipYearsInput(String(maxSipYears)); setSipYears(maxSipYears); }
                        }}
                        className="input-base w-16 py-1.5 text-sm text-center"
                        placeholder="3"
                      />
                      <span className="text-xs text-slate-400">yr</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 3, 5, 7, 10].filter(y => y <= maxSipYears).map(y => (
                        <button key={y} onClick={() => { setSipYears(y); setSipYearsInput(String(y)); }}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${
                            sipYears === y ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}>{y}Y</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col justify-end">
                    <p className="text-[10px] text-slate-400 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded px-2 py-1.5 max-w-[220px]">
                      💡 NAV data is <strong>already net of Expense Ratio</strong>. Edit each fund's auto-detected Expense Ratio below to see the gross vs net breakdown.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {fundData.map((fund, i) => {
                  const sipResult = sipMode === 'sip'
                    ? calculateHistoricalSIP(fund.navData, sipAmount, sipYears)
                    : (() => {
                        // Lumpsum calculation using actual NAV data
                        if (!fund.navData || fund.navData.length === 0) return null;
                        const parseD = s => { const [dd,mm,yyyy] = s.split('-'); return new Date(`${yyyy}-${mm}-${dd}`); };
                        const latestNav = parseFloat(fund.navData[0].nav);
                        const latestDate = parseD(fund.navData[0].date);
                        const startDate = new Date(latestDate);
                        startDate.setFullYear(startDate.getFullYear() - sipYears);
                        const oldest = parseD(fund.navData[fund.navData.length - 1].date);
                        if (oldest > startDate) return null;
                        let startNav = null, minDiff = Infinity;
                        for (const d of fund.navData) {
                          const diff = Math.abs(parseD(d.date) - startDate);
                          if (diff < minDiff) { minDiff = diff; startNav = parseFloat(d.nav); }
                        }
                        if (!startNav) return null;
                        const units = sipAmount / startNav;
                        const currentValue = units * latestNav;
                        const profit = currentValue - sipAmount;
                        const absoluteReturn = (profit / sipAmount) * 100;
                        const xirr = parseFloat(((Math.pow(currentValue / sipAmount, 1 / sipYears) - 1) * 100).toFixed(2));
                        return { invested: sipAmount, currentValue, profit, absoluteReturn, xirr };
                      })();

                  const codeStr = String(fund.schemeCode);
                  const defaultTER = guessTER(fund.meta?.scheme_name);
                  const fundTER = sipFundTER[codeStr] ?? defaultTER;

                  // Gross value = what you'd have if the fund had 0% TER
                  // (NAV is net, so gross XIRR ≈ net XIRR + TER)
                  let grossValue = null, terCost = null, grossXIRR = null;
                  if (sipResult && sipResult.xirr !== null && fundTER > 0) {
                    grossXIRR = sipResult.xirr + fundTER;
                    const r = grossXIRR / 100 / 12;
                    const n = sipYears * 12;
                    grossValue = Math.abs(r) < 1e-10
                      ? sipAmount * n
                      : sipAmount * (1 + r) * (Math.pow(1 + r, n) - 1) / r;
                    terCost = grossValue - sipResult.currentValue;
                  }

                  return (
                    <div key={`sip-${fund.schemeCode}`} className="border border-slate-100 dark:border-slate-700 rounded-xl p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 line-clamp-2 mb-2 pr-2">
                        {fund.meta?.scheme_name}
                      </h4>

                      {/* Per-fund TER input */}
                      <div className="flex items-center gap-1.5 mb-3 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1.5">
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">Expense Ratio:</span>
                        <input
                          type="number" min="0" max="3" step="0.01"
                          value={fundTER}
                          onChange={(e) => setFundTER(codeStr, Math.max(0, Math.min(3, Number(e.target.value))))}
                          className="w-14 text-xs font-bold text-center bg-transparent border-b border-slate-300 dark:border-slate-600 focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-300"
                          placeholder="0.5"
                        />
                        <span className="text-[10px] text-slate-400">% p.a.</span>
                      </div>

                      {!sipResult ? (
                        <p className="text-xs text-slate-400">Not enough history for {sipYears} year{sipYears > 1 ? 's' : ''}.</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Invested:</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{formatINR(sipResult.invested)}</span>
                          </div>

                          {/* Expense Ratio Impact */}
                          {fundTER > 0 && sipResult && (
                            <div className="rounded-lg overflow-hidden border border-orange-100 dark:border-orange-900/50 mt-1">
                              <div className="flex justify-between items-center text-xs px-2 py-1.5 bg-orange-50 dark:bg-orange-950/50">
                                <span className="text-orange-700 dark:text-orange-300 font-semibold">Fee Drag</span>
                                <span className="font-bold text-orange-600 dark:text-orange-400">{fundTER}% per year</span>
                              </div>
                              <div className="flex justify-between items-center text-xs px-2 py-1.5 bg-orange-50/50 dark:bg-orange-950/30">
                                <span className="text-orange-600 dark:text-orange-400">Est. annual fee on current value:</span>
                                <span className="font-bold text-orange-600 dark:text-orange-400">
                                  −{formatINR(Math.round(sipResult.currentValue * fundTER / 100))}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs px-2 py-1.5 bg-orange-50/30 dark:bg-orange-950/20">
                                <span className="text-orange-600 dark:text-orange-400">Total est. fees over {sipYears}yr:</span>
                                <span className="font-bold text-orange-600 dark:text-orange-400">
                                  −{formatINR(Math.round(sipResult.currentValue * fundTER / 100 * sipYears * 0.6))}
                                </span>
                              </div>
                              <div className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50">
                                <p className="text-[9px] text-slate-400">Higher % = higher fee every year. A 0.5% lower ER can save ₹ lakhs over 20 years due to compounding.</p>
                              </div>
                            </div>
                          )}

                          {/* Current Value */}
                          <div className="flex justify-between items-center text-xs mt-1">
                            <span className="text-slate-500">Current Value:</span>
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{formatINR(sipResult.currentValue)}</span>
                          </div>

                          <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500">Profit (net of ER):</span>
                            <span className={`font-bold ${sipResult.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {formatINR(sipResult.profit)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Abs Return:</span>
                            <span className={`font-bold ${sipResult.absoluteReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {Math.abs(sipResult.absoluteReturn).toFixed(2)}%
                            </span>
                          </div>
                          
                          {/* Post-Tax Simulation */}
                          {sipResult.profit > 0 && (
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-2 mt-2 border border-slate-100 dark:border-slate-700">
                              <div className="flex justify-between items-center text-[10px] mb-1">
                                <span className="text-slate-500 flex items-center gap-1">Est. Post-Tax Profit <span className="relative group cursor-help bg-slate-200 dark:bg-slate-600 rounded-full w-3 h-3 flex items-center justify-center font-bold text-[8px]">?
                                  <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight">
                                    Assumes 12.5% LTCG tax on profit above ₹1.25 Lakh. Simplified estimate — consult a CA for exact figures.
                                  </span>
                                </span></span>
                                {(() => {
                                  const taxable = Math.max(0, sipResult.profit - 125000);
                                  const tax = taxable * 0.125;
                                  const postTax = sipResult.profit - tax;
                                  return (
                                    <span className="font-bold text-slate-700 dark:text-slate-300">
                                      {formatINR(postTax)}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                          {sipResult.xirr !== null && sipResult.xirr !== undefined && (
                            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100 dark:border-slate-700">
                              <span className="text-slate-500 flex items-center gap-1">XIRR (net) <span className="relative group cursor-help text-[9px] bg-slate-200 dark:bg-slate-600 rounded px-1">?
                                <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-1.5 bg-slate-800 text-white text-[10px] rounded shadow-lg z-50 text-center font-normal normal-case leading-tight">
                                  Annualised return (XIRR) calculated from real NAV data. Already net of this fund's expense ratio.
                                </span>
                              </span></span>
                              <span className={`font-bold text-sm ${sipResult.xirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                                {sipResult.xirr >= 0 ? '+' : ''}{sipResult.xirr.toFixed(2)}% p.a.
                              </span>
                            </div>
                          )}
                          {fundTER === 0 && (
                            <p className="text-[10px] text-slate-400 italic mt-1">↑ Enter Expense Ratio above to see gross vs net breakdown</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Best Fund Verdict (Our Analysis) */}
        {fundData.length >= 2 && (
          <div className="mt-12 mb-8 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-2xl">🤖</span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Our Analysis</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(() => {
                // Calculate metrics for all funds
                const fundStats = fundData.map(f => {
                  const m = calculateFundMetrics(f.navData);
                  const bw = calculateBestWorstMonth(f.navData);
                  const latest = parseFloat(f.navData[0].nav);
                  let perf6m = -Infinity;
                  if (f.navData.length > 126) {
                    perf6m = ((latest - parseFloat(f.navData[125].nav)) / parseFloat(f.navData[125].nav)) * 100;
                  }
                  return { f, m, bw, perf6m };
                });

                // Find winners
                const momentumWinner = [...fundStats].sort((a, b) => b.perf6m - a.perf6m)[0];
                const lowestRisk = [...fundStats].filter(x => x.m).sort((a, b) => a.m.maxDrawdown - b.m.maxDrawdown)[0];
                
                // Verdict Logic
                let verdictFund = fundStats[0];
                let highestScore = -Infinity;
                fundStats.forEach(stat => {
                  if (!stat.m) return;
                  let score = 0;
                  if (stat.m.return3Y) score += stat.m.return3Y * 2;
                  if (stat.m.return5Y) score += stat.m.return5Y * 1.5;
                  if (stat.m.sharpe) score += stat.m.sharpe * 10;
                  score -= stat.m.maxDrawdown; // penalize risk
                  
                  if (score > highestScore) {
                    highestScore = score;
                    verdictFund = stat;
                  }
                });

                return (
                  <>
                    <div className="card p-5 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-200 dark:border-indigo-800 lg:col-span-2">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">🏆</span>
                        <h3 className="font-bold text-indigo-900 dark:text-indigo-400">FundLens Verdict</h3>
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white text-lg mb-1 line-clamp-2">
                        {verdictFund.f.meta?.scheme_name}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Based on our multi-factor analysis (Returns, Volatility, Sharpe Ratio, and Drawdowns), this fund provides the best risk-adjusted performance.
                      </p>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">🚀</span>
                        <h3 className="font-bold text-emerald-900 dark:text-emerald-400">High Momentum</h3>
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">{momentumWinner.f.meta?.scheme_name}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Strongest recent growth (<span className="font-bold tabular-nums">{momentumWinner.perf6m.toFixed(1)}%</span> in 6M).</p>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">🛡️</span>
                        <h3 className="font-bold text-amber-900 dark:text-amber-400">Capital Protection</h3>
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">{lowestRisk?.f.meta?.scheme_name || 'N/A'}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">Lowest historical maximum drawdown (<span className="font-bold tabular-nums">{lowestRisk?.m?.maxDrawdown.toFixed(1)}%</span>).</p>
                    </div>

                    {/* Best/Worst Month Tracking table */}
                    <div className="card p-5 bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 lg:col-span-4 mt-2">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl">📊</span>
                        <h3 className="font-bold text-slate-900 dark:text-white">Stress Test: Best & Worst Months</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-slate-500 uppercase bg-slate-100 dark:bg-slate-800 rounded">
                            <tr>
                              <th className="px-4 py-2 font-semibold">Fund</th>
                              <th className="px-4 py-2 font-semibold text-emerald-600 dark:text-emerald-400">Best Month</th>
                              <th className="px-4 py-2 font-semibold text-red-600 dark:text-red-400">Worst Month</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {fundStats.map((stat, i) => (
                              <tr key={stat.f.schemeCode} className="hover:bg-white dark:hover:bg-slate-800/40">
                                <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                                  {stat.f.meta?.scheme_name?.split(' ').slice(0, 5).join(' ')}
                                </td>
                                <td className="px-4 py-3 tabular-nums">
                                  {stat.bw && stat.bw.best ? (
                                    <div className="flex flex-col">
                                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">+{stat.bw.best.returnPct.toFixed(2)}%</span>
                                      <span className="text-[10px] text-slate-400">{stat.bw.best.month}</span>
                                    </div>
                                  ) : '—'}
                                </td>
                                <td className="px-4 py-3 tabular-nums">
                                  {stat.bw && stat.bw.worst ? (
                                    <div className="flex flex-col">
                                      <span className="text-red-600 dark:text-red-400 font-bold">{stat.bw.worst.returnPct.toFixed(2)}%</span>
                                      <span className="text-[10px] text-slate-400">{stat.bw.worst.month}</span>
                                    </div>
                                  ) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="mt-6 bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center uppercase tracking-wide font-medium">
                This analysis is auto-generated from historical NAV data. It is not investment advice. Please consult a SEBI-registered investment advisor before making any financial decisions.
              </p>
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
