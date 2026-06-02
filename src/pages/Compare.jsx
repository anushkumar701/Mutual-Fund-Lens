// pages/Compare.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useToast } from '../components/Toast';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { fetchFundDetail, useFunds } from '../hooks/useFunds';
import { useDebounce } from '../hooks/useDebounce';
import { formatINR } from '../utils/formatCurrency';
import { calculateFundMetrics, calculateHistoricalSIP, calculateCorrelation, calculateBestWorstMonth } from '../utils/metrics';
import { estimateER } from '../utils/fundFilters';
import { getFundAgeYears, buildChartData, toMonthlyData, CHART_COLORS } from '../utils/chartUtils';
import ComparedFundCard from '../components/ComparedFundCard';

export default function Compare() {
  const [searchParams] = useSearchParams();
  const { funds } = useFunds();
  const [compareList, setCompareList] = useLocalStorage('fundlens_compare', []);
  const [, setRecentList] = useLocalStorage('fundlens_recent', []);
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
  const [sipFundTER, setSipFundTER] = useState({}); // per-fund TER: { [schemeCode]: 0.5 }
  const setFundTER = (code, val) => setSipFundTER(prev => ({ ...prev, [String(code)]: val }));
  // Load funds from compareList
  const errorTimerRef = useRef(null);
  const loadingCodesRef = useRef(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const showError = (msg) => {
    setFetchError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setFetchError(''), 4000);
  };

    const loadFund = useCallback(async (code) => {
    const codeStr = String(code);
    if (fundData.find((f) => f.schemeCode === codeStr) || loadingCodesRef.current.has(codeStr)) return;

    loadingCodesRef.current.add(codeStr);
    setLoadingCode(codeStr);
    setFetchError('');
    let timerId = setTimeout(() => {
      toast('Fetching live data, please hold on...', 'info', 4000);
    }, 5000);
    try {
      const data = await fetchFundDetail(codeStr);
      if (!isMountedRef.current) return;

      setFundData((prev) => {
        const nextFund = { schemeCode: codeStr, meta: data.meta, navData: data.data };
        return prev.some((f) => f.schemeCode === codeStr)
          ? prev.map((f) => (f.schemeCode === codeStr ? nextFund : f))
          : [...prev, nextFund];
      });
      setRecentList((prev) => {
        const list = prev.filter((c) => c !== codeStr);
        return [codeStr, ...list].slice(0, 6);
      });
      setFetchError(''); // clear error on success
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err?.response?.status === 404
          ? `Scheme code "${codeStr}" not found. Enter numeric codes only (e.g. 122639).`
          : 'Network error. Please check your connection and try again.';
        showError(msg);
      }
    } finally {
      clearTimeout(timerId);
      loadingCodesRef.current.delete(codeStr);
      if (isMountedRef.current) {
        setLoadingCode(null);
      }
    }
  }, [fundData, toast, setRecentList]);

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
  }, [searchParams, setCompareList]);

  // Load all codes in compareList
  useEffect(() => {
    compareList.forEach((code) => {
      if (!fundData.find((f) => f.schemeCode === code)) {
        loadFund(code);
      }
    });
  }, [compareList, fundData, loadFund]);

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

  const debouncedSearchQuery = useDebounce(searchQuery, 250);

  const filteredSearch = useMemo(() => {
    if (!debouncedSearchQuery.trim() || !funds) return [];
    const q = debouncedSearchQuery.toLowerCase();
    return funds
      .filter((f) =>
        f.schemeName.toLowerCase().includes(q) ||
        f.schemeCode.toString().includes(debouncedSearchQuery)
      )
      .slice(0, 10);
  }, [debouncedSearchQuery, funds]);

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
      const html2canvasModule = await import('html2canvas');
      const canvas = await html2canvasModule.default(el, { backgroundColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#f8fafc' });
      const link = document.createElement('a');
      link.download = `fundlens-comparison-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
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

  const chartData = useMemo(() => {
    let data = buildChartData(fundData, range);
    if (['3Y', '5Y', '10Y', '15Y', '20Y', '25Y', 'MAX'].includes(range)) {
      data = toMonthlyData(data);
    }
    return data;
  }, [fundData, range]);

  // Annual calendar-year returns — O(n log n) via binary search (was O(n²) linear scan)
  const annualReturns = useMemo(() => {
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
      if (!fund.navData || fund.navData.length === 0) return;
      // Pre-sort once per fund (O(n log n)) then binary search per year (O(log n))
      const sorted = [...fund.navData]
        .reverse()
        .map(d => {
          const [dd, mm, yy] = d.date.split('-');
          return { ts: new Date(`${yy}-${mm}-${dd}`).getTime(), nav: parseFloat(d.nav) };
        })
        .filter(d => !isNaN(d.ts) && isFinite(d.nav));

      const findNav = (targetDate) => {
        const targetTs = targetDate.getTime();
        let lo = 0, hi = sorted.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid].ts < targetTs) lo = mid + 1; else hi = mid; }
        if (lo > 0 && Math.abs(sorted[lo - 1].ts - targetTs) < Math.abs(sorted[lo].ts - targetTs)) lo--;
        const diff = Math.abs(sorted[lo].ts - targetTs);
        return diff < 20 * 86400000 ? sorted[lo].nav : null;
      };

      allYears.forEach(year => {
        const sNav = findNav(new Date(`${year}-01-01`));
        const eNav = findNav(year === currentYear ? now : new Date(`${year}-12-31`));
        if (!data[year]) data[year] = {};
        if (sNav && eNav) data[year][name] = ((eNav - sNav) / sNav) * 100;
      });
    });
    const validYears = allYears.filter(y => Object.keys(data[y] || {}).length > 0);
    return { years: validYears, data };
  }, [fundData]);

  // Overlap matrix for ALL fund pairs
  const overlapMatrix = useMemo(() => {
    const matrix = [];
    if (fundData.length >= 2) {
      for (let i = 0; i < fundData.length; i++) {
        for (let j = i + 1; j < fundData.length; j++) {
          const corr = calculateCorrelation(fundData[i].navData, fundData[j].navData);
          if (corr !== null) {
            const score = Math.max(0, corr * 100);
            matrix.push({
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
    return matrix;
  }, [fundData]);

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
  // Auto-correct range when funds removed or min age changes
  useEffect(() => {
    if (!availableRanges.includes(range) && availableRanges.length > 0) {
      const ordered = ['1M', '3M', '6M', '1Y', '3Y', '5Y', '10Y', '15Y', '20Y', '25Y', 'MAX'];
      for (const r of ordered) {
        if (availableRanges.includes(r)) {
          setRange(r);
          break;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRanges.length, range]);

  // Max SIP years = minimum fund age across all compared funds (floor)
  const maxSipYears = fundData.length > 0
    ? Math.max(1, Math.floor(Math.min(...fundData.map(f => getFundAgeYears(f.navData || [])))))
    : 20;
  // Build available SIP year options up to maxSipYears
  const sipYearOptions = [1, 3, 5, 7, 10, 15, 20].filter(y => y <= maxSipYears);
  if (sipYearOptions.length === 0) sipYearOptions.push(1);

  // Memoize SIP and Lumpsum calculations for all compared funds
  const sipResults = useMemo(() => {
    return fundData.map(fund => {
      if (!fund.navData || fund.navData.length === 0) return null;
      if (sipMode === 'sip') {
        return calculateHistoricalSIP(fund.navData, sipAmount, sipYears);
      } else {
        // Lumpsum calculation using actual NAV data (binary search)
        const parseD = s => { const [dd,mm,yyyy] = s.split('-'); return new Date(`${yyyy}-${mm}-${dd}`); };
        const latestNav = parseFloat(fund.navData[0].nav);
        const latestDate = parseD(fund.navData[0].date);
        const startDate = new Date(latestDate);
        startDate.setFullYear(startDate.getFullYear() - sipYears);
        const oldest = parseD(fund.navData[fund.navData.length - 1].date);
        if (oldest > startDate) return null;

        // Binary search is much faster than loop
        const sorted = [...fund.navData].reverse()
          .map(d => ({ ts: parseD(d.date).getTime(), nav: parseFloat(d.nav) }))
          .filter(d => !isNaN(d.ts) && isFinite(d.nav));
        if (sorted.length === 0) return null;

        const targetTs = startDate.getTime();
        let lo = 0, hi = sorted.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (sorted[mid].ts < targetTs) lo = mid + 1;
          else hi = mid;
        }
        if (lo > 0 && Math.abs(sorted[lo - 1].ts - targetTs) < Math.abs(sorted[lo].ts - targetTs)) {
          lo = lo - 1;
        }
        const startNav = sorted[lo]?.nav;
        if (!startNav || startNav <= 0) return null;

        const units = sipAmount / startNav;
        const currentValue = units * latestNav;
        const profit = currentValue - sipAmount;
        const absoluteReturn = (profit / sipAmount) * 100;
        const xirr = parseFloat(((Math.pow(currentValue / sipAmount, 1 / sipYears) - 1) * 100).toFixed(2));
        return { invested: sipAmount, currentValue, profit, absoluteReturn, xirr };
      }
    });
  }, [fundData, sipMode, sipAmount, sipYears]);

  // Calculate the most recent NAV date across all loaded funds
  const lastRefreshedDate = useMemo(() => {
    if (fundData.length === 0) return null;
    const latest = fundData.reduce((latest, f) => {
      if (!f.navData || f.navData.length === 0) return latest;
      const [dd, mm, yyyy] = f.navData[0].date.split('-');
      const current = new Date(`${yyyy}-${mm}-${dd}`);
      return current > latest ? current : latest;
    }, new Date('2000-01-01'));
    return latest.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [fundData]);

  // Memoize multi-factor verdict analysis calculations
  const verdictData = useMemo(() => {
    if (fundData.length < 2) return null;
    
    // Calculate stats for all funds
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

    return { fundStats, momentumWinner, lowestRisk, verdictFund };
  }, [fundData]);

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20 pt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Fund Comparison</h1>
              {lastRefreshedDate && (
                <span className="text-[10px] font-semibold tracking-wider uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                  Refreshed: {lastRefreshedDate}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Compare up to 4 mutual funds side by side</p>
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
                id="compare-search-input"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value.slice(0, 100));
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search funds by name or code..."
                className="input-base pl-10"
                disabled={compareList.length >= 4}
                maxLength={100}
                aria-label="Search funds to add to comparison by name or scheme code"
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
                      <span className="text-xs text-slate-500 font-mono">#{f.schemeCode}</span>
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
                        <p className="text-[10px] text-slate-500 line-clamp-1 mb-0.5">
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
                    <p className="text-xs text-slate-500 mt-0.5">% growth from the start of the selected period — funds are fairly compared regardless of NAV level</p>
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
                <ResponsiveContainer width="100%" height={260} className="sm:!h-[340px]">
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
                            <th className="px-3 py-3 font-semibold text-slate-500 text-[10px]">Type</th>
                            {fundData.map((fund, i) => (
                              <th key={fund.schemeCode} className="px-4 py-3 font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                                <div className="line-clamp-1 max-w-[140px]" title={fund.meta?.scheme_name}>
                                  {fund.meta?.scheme_name?.split(' ').slice(0,3).join(' ') || fund.schemeCode}
                                </div>
                              </th>
                            ))}
                            {fundData.length >= 2 && <th className="px-3 py-3 font-semibold text-slate-500">Leader</th>}
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
                                <td className="px-3 py-3 text-[10px] text-slate-500">{p.months >= 12 ? 'CAGR' : 'Abs'}</td>
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
                        let event = MARKET_EVENTS[year];
                        
                        // Automatically infer the "reason" / market sentiment for any future or unmapped years based on average returns
                        if (!event && defined.length > 0) {
                          const avgReturn = defined.reduce((sum, v) => sum + v, 0) / defined.length;
                          if (avgReturn >= 15) {
                            event = { label: '🟢 Strong bull market trend', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
                          } else if (avgReturn >= 5) {
                            event = { label: '🟢 Positive market sentiment', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' };
                          } else if (avgReturn >= 0) {
                            event = { label: '🟡 Flat / Muted growth', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
                          } else if (avgReturn >= -10) {
                            event = { label: '🟡 Mild market correction', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
                          } else {
                            event = { label: '🔴 Major market correction', color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300' };
                          }
                        }
                        return (
                          <tr key={year} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">
                              <div className="flex flex-col gap-1.5">
                                <span className="flex items-center gap-2 text-base">
                                  {year}
                                  {year === new Date().getFullYear() && (
                                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded font-bold tracking-wide">YTD</span>
                                  )}
                                </span>
                                {event && (
                                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-md w-fit ${event.color}`}>
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
                                  const winnerIdx = vals.indexOf(bestVal);                  return (
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">                    {`Based on actual NAV data — `}<span className="font-semibold text-emerald-600 dark:text-emerald-400">{`returns are already net of expense ratio`}</span>{`. Max period = youngest fund's age (${maxSipYears} yr).`}</p>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  {/* SIP / Lumpsum Toggle */}
                  <div className="flex flex-col gap-1">
                    <label id="sip-mode-label" className="text-[10px] text-slate-500 uppercase tracking-wider">Mode</label>
                    <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 gap-0.5" role="radiogroup" aria-labelledby="sip-mode-label">
                      <button
                        onClick={() => setSipMode('sip')}
                        role="radio"
                        aria-checked={sipMode === 'sip'}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${sipMode === 'sip' ? 'bg-white dark:bg-slate-600 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                      >SIP</button>
                      <button
                        onClick={() => setSipMode('lumpsum')}
                        role="radio"
                        aria-checked={sipMode === 'lumpsum'}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${sipMode === 'lumpsum' ? 'bg-white dark:bg-slate-600 text-blue-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                      >Lumpsum</button>
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div className="flex flex-col gap-1">
                    <label htmlFor="sip-amount-input" className="text-[10px] text-slate-500 uppercase tracking-wider">{sipMode === 'sip' ? 'Monthly SIP' : 'Lumpsum'}</label>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 text-sm">₹</span>
                      <input
                        type="text"
                        id="sip-amount-input"
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
                    <label htmlFor="sip-years-input" className="text-[10px] text-slate-500 uppercase tracking-wider">Period <span className="normal-case">(max {maxSipYears}yr)</span></label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        id="sip-years-input"
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
                      <span className="text-xs text-slate-500">yr</span>
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
                      {`💡 NAV data is `}<strong>{`already net of Expense Ratio`}</strong>{`. Edit each fund's auto-detected Expense Ratio below to see the gross vs net breakdown.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {fundData.map((fund, i) => {
                  const sipResult = sipResults[i];

                  const codeStr = String(fund.schemeCode);
                  const defaultTER = estimateER(fund.meta?.scheme_name);
                  const fundTER = sipFundTER[codeStr] ?? defaultTER;

                  return (
                    <div key={`sip-${fund.schemeCode}`} className="border border-slate-100 dark:border-slate-700 rounded-xl p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 line-clamp-2 mb-2 pr-2">
                        {fund.meta?.scheme_name}
                      </h4>

                      {/* Per-fund TER input */}
                      <div className="flex items-center gap-1.5 mb-3 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1.5">
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">Expense Ratio:</span>                          <input
                            type="number" min="0" max="3" step="0.01"
                            id={`ter-input-${codeStr}`}
                            value={fundTER}
                            onChange={(e) => setFundTER(codeStr, Math.max(0, Math.min(3, Number(e.target.value))))}
                            className="w-14 text-xs font-bold text-center bg-transparent border-b border-slate-300 dark:border-slate-600 focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-300"
                            placeholder="0.5"
                            aria-label={`Expense ratio for ${fund.meta?.scheme_name || fund.schemeCode}`}
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
                                  {`Annualised return (XIRR) calculated from real NAV data. Already net of this fund's expense ratio.`}
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
        {fundData.length >= 2 && verdictData && (
          <div className="mt-12 mb-8 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-2xl">🤖</span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Our Analysis</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-5 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-200 dark:border-indigo-800 lg:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🏆</span>
                  <h3 className="font-bold text-indigo-900 dark:text-indigo-400">FundLens Verdict</h3>
                </div>
                <p className="font-semibold text-slate-900 dark:text-white text-lg mb-1 line-clamp-2">
                  {verdictData.verdictFund.f.meta?.scheme_name}
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
                <p className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">{verdictData.momentumWinner.f.meta?.scheme_name}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Strongest recent growth (<span className="font-bold tabular-nums">{verdictData.momentumWinner.perf6m.toFixed(1)}%</span> in 6M).</p>
              </div>

              <div className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🛡️</span>
                  <h3 className="font-bold text-amber-900 dark:text-amber-400">Capital Protection</h3>
                </div>
                <p className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">{verdictData.lowestRisk?.f.meta?.scheme_name || 'N/A'}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Lowest historical maximum drawdown (<span className="font-bold tabular-nums">{verdictData.lowestRisk?.m?.maxDrawdown.toFixed(1)}%</span>).</p>
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
                      {verdictData.fundStats.map((stat, i) => (
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
