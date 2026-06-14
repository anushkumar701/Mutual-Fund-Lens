import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useToast } from '../components/Toast';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { fetchFundDetail, useFunds } from '../hooks/useFunds';
import { useDebounce } from '../hooks/useDebounce';
import { formatINR } from '../utils/formatCurrency';
import { calculateFundMetrics, calculateHistoricalSIP, calculateCorrelation, calculateBestWorstMonth } from '../utils/metrics';
import { getER } from '../utils/expenseRatio';
import { getFundAgeYears, buildChartData, toMonthlyData, CHART_COLORS, sanitizeDataKey } from '../utils/chartUtils';
import ComparedFundCard from '../components/ComparedFundCard';
import MARKET_EVENTS from '../data/marketReasons.json';

// ── Index Benchmarks ──────────────────────────────────────────────────────────
const BENCHMARKS = [
  { id: 'nifty50',   label: 'Nifty 50',        code: '120716', color: '#a855f7' },
  { id: 'sensex',    label: 'Sensex',           code: '118825', color: '#f97316' },
  { id: 'midcap150', label: 'Nifty Midcap 150', code: '147622', color: '#06b6d4' },
];

// Dark-mode-aware chart colors — brighter on dark, standard on light
const DARK_CHART_COLORS  = ['#60a5fa', '#34d399', '#fbbf24', '#f87171'];
const LIGHT_CHART_COLORS = CHART_COLORS; // ['#2563eb','#10b981','#f59e0b','#ef4444']

// Popular funds for the empty-state quick-add chips
const POPULAR_FUNDS = [
  { name: 'Parag Parikh Flexi Cap',         code: '122639' },
  { name: 'Mirae Asset Large Cap',           code: '118989' },
  { name: 'SBI Small Cap',                  code: '125497' },
  { name: 'Axis Bluechip',                  code: '120503' },
  { name: 'HDFC Mid-Cap Opportunities',     code: '118989' },
  { name: 'Nippon India Small Cap',         code: '118778' },
];

function TERInput({ codeStr, fundName, initialValue, onSave }) {
  const [val, setVal] = useState(String(initialValue));
  useEffect(() => { setVal(String(initialValue)); }, [initialValue]);

  const handleSave = () => {
    let num = parseFloat(val);
    if (isNaN(num)) num = 0;
    num = Math.max(0, Math.min(3, num));
    setVal(String(num));
    onSave(codeStr, num);
  };

  return (
    <div className="flex items-center gap-1.5 mb-3 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1.5">
      <span className="text-[10px] text-slate-400 whitespace-nowrap">Expense Ratio:</span>
      <input
        type="number" min="0" max="3" step="0.01"
        id={`ter-input-${codeStr}`}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        className="w-14 text-xs font-bold text-center bg-transparent border-b border-slate-300 dark:border-slate-600 focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-300"
        placeholder="0.5"
        aria-label={`Expense ratio for ${fundName}`}
      />
      <span className="text-[10px] text-slate-400">% p.a.</span>
      {val !== String(initialValue) && (
        <button onClick={handleSave} className="ml-auto text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold hover:bg-blue-200 transition-colors">
          Save
        </button>
      )}
    </div>
  );
}


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
  const toast = useToast();

  // ── Benchmark state ──────────────────────────────────────────────────────────
  const [activeBenchmark, setActiveBenchmark] = useState(null); // null | benchmark id
  const [benchmarkData, setBenchmarkData] = useState(null);     // fetched navData array
  const [loadingBenchmark, setLoadingBenchmark] = useState(false);

  // ── Dark-mode detection ──────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  const activeColors = isDark ? DARK_CHART_COLORS : LIGHT_CHART_COLORS;

  // ── Undo-remove state ────────────────────────────────────────────────────────
  const [removedFund, setRemovedFund] = useState(null); // { code, meta, navData }
  const undoTimerRef = useRef(null);

  // ── Share card state removed — Export PNG now captures full page


  // SIP comparison state
  const [sipAmount, setSipAmount] = useState(5000);
  const [sipAmountInput, setSipAmountInput] = useState('5000');
  const [sipYears, setSipYears] = useState(3);
  const [sipYearsInput, setSipYearsInput] = useState('3');
  const [sipMode, setSipMode] = useState('sip'); // 'sip' | 'lumpsum'
  const [sipFundTER, setSipFundTER] = useLocalStorage('fundlens_custom_ter', {}); // per-fund TER: { [schemeCode]: 0.5 }
  const setFundTER = (code, val) => setSipFundTER(prev => ({ ...prev, [String(code)]: val }));
  // Load funds from compareList
  const errorTimerRef = useRef(null);
  const loadingCodesRef = useRef(new Set());
  const isMountedRef = useRef(false);
  const failedCodesRef = useRef(new Set());
  const fundDataRef = useRef(fundData);

  useEffect(() => {
    fundDataRef.current = fundData;
  }, [fundData]);

  // Track mount/unmount; also clear stale loading state on each fresh mount
  useEffect(() => {
    isMountedRef.current = true;
    // Clear any stale loading codes from a previous Strict-Mode double-invoke
    loadingCodesRef.current.clear();
    setLoadingCode(null);
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
    if (fundDataRef.current.find((f) => String(f.schemeCode) === codeStr) || loadingCodesRef.current.has(codeStr)) return;

    loadingCodesRef.current.add(codeStr);
    setLoadingCode(codeStr);
    setFetchError('');
    let timerId = setTimeout(() => {
      if (isMountedRef.current) toast('Fetching live data, please hold on...', 'info', 4000);
    }, 5000);
    try {
      const data = await fetchFundDetail(codeStr);

      // Only update state if still mounted
      if (isMountedRef.current) {
        setFundData((prev) => {
          const nextFund = { schemeCode: codeStr, meta: data.meta, navData: data.data };
          return prev.some((f) => String(f.schemeCode) === codeStr)
            ? prev.map((f) => (String(f.schemeCode) === codeStr ? nextFund : f))
            : [...prev, nextFund];
        });
        setFetchError('');
        failedCodesRef.current.delete(codeStr);
      }
      // Always update recent list (safe side-effect)
      setRecentList((prev) => {
        const list = prev.filter((c) => String(c) !== codeStr);
        return [codeStr, ...list].slice(0, 6);
      });
    } catch (err) {
      failedCodesRef.current.add(codeStr);
      if (isMountedRef.current) {
        const msg = err?.response?.status === 404
          ? `Scheme code "${codeStr}" not found. Enter numeric codes only (e.g. 122639).`
          : 'Network error. Please check your connection and try again.';
        showError(msg);
      }
    } finally {
      clearTimeout(timerId);
      loadingCodesRef.current.delete(codeStr);
      // Always clear loading state — safe to call on unmounted components
      setLoadingCode(null);
    }
  }, [toast, setRecentList]);

  // Load from URL param
  useEffect(() => {
    const codeParam = searchParams.get('code');
    const fundsParam = searchParams.get('funds');
    const terParam = searchParams.get('ter');
    
    let codesToAdd = [];
    if (codeParam) codesToAdd.push(codeParam);
    if (fundsParam) codesToAdd.push(...fundsParam.split(','));
    
    if (codesToAdd.length > 0) {
      setCompareList((prev) => {
        const unique = new Set([...prev.map(String), ...codesToAdd.map(String)]);
        const finalCodes = Array.from(unique).slice(0, 4);

        if (terParam && fundsParam) {
          const fundCodes = fundsParam.split(',');
          const parsedTers = terParam.split(',');
          const overrides = {};
          fundCodes.forEach((code, idx) => {
             if (parsedTers[idx] && parsedTers[idx] !== '') {
                const val = parseFloat(parsedTers[idx]);
                if (!isNaN(val)) overrides[String(code)] = val;
             }
          });
          if (Object.keys(overrides).length > 0) {
             setSipFundTER(prevTER => ({ ...prevTER, ...overrides }));
          }
        }

        return finalCodes;
      });
    }
  }, [searchParams, setCompareList, setSipFundTER]);

  // Load all codes in compareList
  useEffect(() => {
    compareList.forEach((code) => {
      const codeStr = String(code);
      if (!failedCodesRef.current.has(codeStr) && !fundData.find((f) => String(f.schemeCode) === codeStr)) {
        loadFund(code);
      }
    });
  }, [compareList, fundData, loadFund]);

  const handleAddCode = (code) => {
    const codeStr = String(code);
    failedCodesRef.current.delete(codeStr);
    if (compareList.length >= 4) {
      showError('You can compare up to 4 funds at a time.');
      return;
    }
    if (compareList.map(String).includes(codeStr)) {
      showError('This fund is already in your comparison.');
      return;
    }
    setCompareList((prev) => [...prev, codeStr]);
    loadFund(codeStr);
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
    const codeStr = String(code);
    const removed = fundData.find(f => String(f.schemeCode) === codeStr);
    if (!removed) return;

    setCompareList(prev => prev.filter(c => String(c) !== codeStr));
    setFundData(prev => prev.filter(f => String(f.schemeCode) !== codeStr));

    // Store for potential undo
    setRemovedFund(removed);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    toast(
      `Removed ${removed.meta?.scheme_name?.split(' ').slice(0, 3).join(' ') || codeStr}`,
      'info',
      4000
    );
    undoTimerRef.current = setTimeout(() => setRemovedFund(null), 4000);
  };

  const undoRemove = () => {
    if (!removedFund) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const codeStr = String(removedFund.schemeCode);
    setCompareList(prev => [...prev, codeStr].slice(0, 4));
    setFundData(prev => [...prev, removedFund].slice(0, 4));
    setRemovedFund(null);
  };

  const clearAll = () => {
    setCompareList([]);
    setFundData([]);
  };

  const handleExport = async () => {
    const el = document.getElementById('compare-export-area');
    if (!el) return;
    try {
      toast('Generating full-page export…', 'info');
      const html2canvasModule = await import('html2canvas');
      // Capture the FULL element — not just the visible viewport portion.
      // scrollWidth/scrollHeight give total rendered dimensions regardless of scroll.
      const canvas = await html2canvasModule.default(el, {
        backgroundColor: isDark ? '#0f172a' : '#f8fafc',
        useCORS: true,
        logging: false,
        allowTaint: false,
        // Full element dimensions
        width: el.scrollWidth,
        height: el.scrollHeight,
        // Offset for current scroll so off-screen content is included
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        windowWidth: Math.max(document.documentElement.scrollWidth, el.scrollWidth),
        windowHeight: el.scrollHeight,
      });
      const link = document.createElement('a');
      link.download = `fundlens-comparison-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      toast('Failed to generate export image.', 'error');
    }
  };

  const handleCopyLink = () => {
    if (compareList.length === 0) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.set('funds', compareList.join(','));
    
    const ters = compareList.map(code => {
       const codeStr = String(code);
       return sipFundTER[codeStr] !== undefined ? sipFundTER[codeStr] : '';
    });
    if (ters.some(t => t !== '')) {
       url.searchParams.set('ter', ters.join(','));
    } else {
       url.searchParams.delete('ter');
    }

    navigator.clipboard.writeText(url.toString()).then(() => {
      toast('Comparison link copied to clipboard!', 'success');
    }).catch(() => {
      toast('Failed to copy link. Please copy the URL manually.', 'error');
    });
  };

  // ── Benchmark fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeBenchmark) { setBenchmarkData(null); return; }
    const bm = BENCHMARKS.find(b => b.id === activeBenchmark);
    if (!bm) return;
    let cancelled = false;
    setLoadingBenchmark(true);
    fetchFundDetail(bm.code)
      .then(d => { if (!cancelled) setBenchmarkData(d.data); })
      .catch(() => { if (!cancelled) setBenchmarkData(null); })
      .finally(() => { if (!cancelled) setLoadingBenchmark(false); });
    return () => { cancelled = true; };
  }, [activeBenchmark]);

  const chartData = useMemo(() => {
    // Merge benchmark navData as a pseudo-fund
    const allFunds = [...fundData];
    if (activeBenchmark && benchmarkData) {
      const bm = BENCHMARKS.find(b => b.id === activeBenchmark);
      allFunds.push({ schemeCode: `bm_${activeBenchmark}`, meta: { scheme_name: bm.label }, navData: benchmarkData });
    }
    let data = buildChartData(allFunds, range);

    if (['3Y', '5Y', '10Y', '15Y', '20Y', '25Y', 'MAX'].includes(range)) {
      data = toMonthlyData(data);
    }
    return data;
  }, [fundData, range, activeBenchmark, benchmarkData]);

  // Annual calendar-year returns — O(n log n) via binary search
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
          const ts = new Date(`${yy}-${mm}-${dd}`).getTime();
          const nav = parseFloat(d.nav);
          return { ts, nav };
        })
        .filter(d => !isNaN(d.ts) && Number.isFinite(d.nav) && d.nav > 0);

      if (sorted.length === 0) return;

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
        if (sNav && eNav && sNav > 0) data[year][name] = ((eNav - sNav) / sNav) * 100;
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
                <button onClick={handleCopyLink} aria-label="Share comparison link" className="btn-secondary text-xs px-3 py-2 border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400">
                  🔗 Share Link
                </button>
                <button onClick={handleExport} aria-label="Export full comparison as PNG image" className="btn-secondary text-xs px-3 py-2">
                  📸 Export PNG
                </button>
                <button id="clear-all-btn" onClick={clearAll} aria-label="Clear all compared funds" className="btn-secondary text-red-500 border-red-200 dark:border-red-800 text-xs px-3 py-2">
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

        {/* Undo remove banner */}
        {removedFund && (
          <div className="flex items-center justify-between bg-slate-800 dark:bg-slate-700 text-white text-sm px-4 py-3 rounded-lg shadow-lg animate-pulse-once">
            <span>Removed <strong>{removedFund.meta?.scheme_name?.split(' ').slice(0, 3).join(' ') || removedFund.schemeCode}</strong></span>
            <button onClick={undoRemove} className="ml-4 px-3 py-1 text-xs font-bold bg-white text-slate-900 rounded-md hover:bg-slate-100 transition-colors">Undo</button>
          </div>
        )}

        {/* Wrap content in export div — no negative margin: it breaks Recharts width measurement on mobile */}
        <div id="compare-export-area" className="space-y-6">

          {/* Fund cards */}
          {fundData.length === 0 ? (
            <div className="card p-10 text-center space-y-6">
              <div className="text-5xl">📊</div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Start your comparison</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Search above or pick a popular fund below to get started</p>
              </div>
              {/* Popular fund quick-add chips */}
              <div className="flex flex-wrap justify-center gap-2">
                {POPULAR_FUNDS.filter(pf => !compareList.map(String).includes(String(pf.code))).slice(0, 5).map(pf => (
                  <button
                    key={pf.code}
                    onClick={() => handleAddCode(pf.code)}
                    disabled={!!loadingCode || compareList.length >= 4}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-all disabled:opacity-50"
                  >
                    <span className="text-base">+</span> {pf.name}
                  </button>
                ))}
              </div>
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

              {/* Fund cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {fundData.map((fund, i) => (
                  <ComparedFundCard
                    key={fund.schemeCode}
                    fund={fund}
                    color={activeColors[i % activeColors.length]}
                    onRemove={() => removeFund(fund.schemeCode)}
                  />
                ))}
              </div>

            {/* NAV History Chart */}
            <div className="card p-3 sm:p-5">
              {/* Chart header */}
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">Relative Performance</h2>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">% growth from period start — all funds fairly compared</p>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Benchmark selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">vs Index:</span>
                    {BENCHMARKS.map(bm => (
                      <button
                        key={bm.id}
                        onClick={() => setActiveBenchmark(prev => prev === bm.id ? null : bm.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                          activeBenchmark === bm.id
                            ? 'text-white border-transparent shadow-sm'
                            : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}
                        style={activeBenchmark === bm.id ? { backgroundColor: bm.color, borderColor: bm.color } : {}}
                      >
                        {loadingBenchmark && activeBenchmark === bm.id
                          ? <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                          : <span className="w-2 h-2 rounded-full" style={{ backgroundColor: bm.color }} />}
                        {bm.label}
                      </button>
                    ))}
                    {activeBenchmark && (
                      <span className="text-[10px] text-slate-400 hidden md:inline">Click again to hide</span>
                    )}
                  </div>

                  {/* Range selector */}
                  <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 overflow-x-auto no-scrollbar">
                    {availableRanges.map((r) => (
                      <button
                        key={r}
                        id={`range-${r}`}
                        onClick={() => setRange(r)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
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
              </div>
              <div className="mt-1" style={{ width: '100%', height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke={isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.18)'} />

                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={{ stroke: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.3)', strokeWidth: 1 }}
                    minTickGap={52}
                    dy={6}
                    tick={(props) => {
                      const { x, y, payload } = props;
                      if (!payload?.value) return null;
                      const [dd, mm, yyyy] = payload.value.split('-');
                      const d = new Date(`${yyyy}-${mm}-${dd}`);
                      if (isNaN(d.getTime())) return null;

                      let line1 = '', line2 = '';
                      if (['1M', '3M'].includes(range)) {
                        // "15" / "Jun"
                        line1 = d.toLocaleDateString('en-US', { day: 'numeric' });
                        line2 = d.toLocaleDateString('en-US', { month: 'short' });
                      } else if (['6M', '1Y'].includes(range)) {
                        // "Jun" / "'25"
                        line1 = d.toLocaleDateString('en-US', { month: 'short' });
                        line2 = `'${d.toLocaleDateString('en-US', { year: '2-digit' })}`;
                      } else if (['3Y', '5Y'].includes(range)) {
                        // "Jun 2023"
                        line1 = d.toLocaleDateString('en-US', { month: 'short' });
                        line2 = d.toLocaleDateString('en-US', { year: 'numeric' });
                      } else {
                        // just the year
                        line1 = d.toLocaleDateString('en-US', { year: 'numeric' });
                        line2 = '';
                      }

                      const textColor = isDark ? '#94a3b8' : '#64748b';
                      return (
                        <g transform={`translate(${x},${y})`}>
                          {/* subtle tick mark */}
                          <line y1={0} y2={4} stroke={isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.4)'} strokeWidth={1} />
                          <text x={0} y={14} textAnchor="middle" fill={textColor} fontSize={11} fontWeight={600} fontFamily="inherit">
                            {line1}
                          </text>
                          {line2 && (
                            <text x={0} y={26} textAnchor="middle" fill={isDark ? '#64748b' : '#94a3b8'} fontSize={10} fontFamily="inherit">
                              {line2}
                            </text>
                          )}
                        </g>
                      );
                    }}
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={62}
                    dx={-2}
                    // Auto-fit domain to actual data values — never force-include 0
                    domain={[
                      (dataMin) => {
                        const pad = Math.abs(dataMin) * 0.08 || 2;
                        return Math.floor(dataMin - pad);
                      },
                      (dataMax) => {
                        const pad = Math.abs(dataMax) * 0.08 || 2;
                        return Math.ceil(dataMax + pad);
                      },
                    ]}
                    allowDataOverflow={false}
                    tick={(props) => {
                      const { x, y, payload } = props;
                      const v = parseFloat(payload?.value);
                      if (!isFinite(v)) return null;

                      // Color-code: green positive, red negative, gray zero
                      let color;
                      if (v > 0)      color = isDark ? '#34d399' : '#059669';
                      else if (v < 0) color = isDark ? '#f87171' : '#dc2626';
                      else            color = isDark ? '#64748b' : '#94a3b8';

                      // Format: drop decimal for round numbers
                      const absV = Math.abs(v);
                      const formatted = absV % 1 === 0
                        ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
                        : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={4}
                            textAnchor="end"
                            fill={color}
                            fontSize={10}
                            fontWeight={v === 0 ? 400 : 600}
                            fontFamily="inherit"
                          >
                            {formatted}
                          </text>
                        </g>
                      );
                    }}
                  />

                  <ReferenceLine y={0} stroke={isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.4)'} strokeDasharray="4 3" />

                  {/* Custom rich tooltip */}
                  <Tooltip
                    cursor={{ stroke: isDark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.25)', strokeWidth: 1.5, strokeDasharray: '4 3' }}
                    labelFormatter={(label) => {
                      if (!label) return '';
                      const [dd, mm, yyyy] = label.split('-');
                      const d = new Date(`${yyyy}-${mm}-${dd}`);
                      if (isNaN(d.getTime())) return label;
                      return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                    }}
                    formatter={(value, name) => {
                      if (typeof name === 'string' && name.endsWith('_raw')) return null;
                      const v = parseFloat(value);
                      if (!Number.isFinite(v)) return null;
                      return [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, name];
                    }}
                    contentStyle={{
                      backgroundColor: isDark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.97)',
                      border: `1px solid ${isDark ? 'rgba(51,65,85,0.8)' : 'rgba(226,232,240,1)'}`,
                      borderRadius: '12px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: '12px',
                      boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
                      padding: '12px 16px',
                      backdropFilter: 'blur(12px)',
                    }}
                    itemStyle={{ color: isDark ? '#e2e8f0' : '#334155', paddingBottom: '3px', fontWeight: 500 }}
                    labelStyle={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: '8px', fontWeight: '600', fontSize: '11px' }}
                  />

                  {/* Custom legend with colored dots */}
                  <Legend
                    wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
                    iconType="circle"
                    iconSize={8}
                    formatter={(name) => (
                      <span style={{ color: isDark ? '#cbd5e1' : '#475569', fontWeight: 500 }}>
                        {name.length > 40 ? name.slice(0, 40) + '…' : name}
                      </span>
                    )}
                  />

                  {/* Fund lines */}
                  {fundData.map((fund, i) => {
                    const lineKey = sanitizeDataKey(fund.meta?.scheme_name || String(fund.schemeCode));
                    const displayName = fund.meta?.scheme_name || String(fund.schemeCode);
                    const color = activeColors[i % activeColors.length];
                    return (
                      <Line
                        key={fund.schemeCode}
                        type="monotoneX"
                        dataKey={lineKey}
                        name={displayName}
                        stroke={color}
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls={true}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: isDark ? '#0f172a' : '#fff', fill: color }}
                        animationDuration={600}
                        animationEasing="ease-out"
                      />
                    );
                  })}

                  {/* Benchmark line — dashed */}
                  {activeBenchmark && benchmarkData && (() => {
                    const bm = BENCHMARKS.find(b => b.id === activeBenchmark);
                    const lineKey = sanitizeDataKey(bm.label);
                    return (
                      <Line
                        key={`bm_${activeBenchmark}`}
                        type="monotoneX"
                        dataKey={lineKey}
                        name={`${bm.label} (Index)`}
                        stroke={bm.color}
                        strokeWidth={1.8}
                        strokeDasharray="6 4"
                        dot={false}
                        connectNulls={true}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: isDark ? '#0f172a' : '#fff', fill: bm.color }}
                        animationDuration={600}
                      />
                    );
                  })()}

                </LineChart>
              </ResponsiveContainer>
              </div>

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
                        let event = MARKET_EVENTS[year];

                        // Future-proof: If no historical reason is mapped, generate an exact, unique proper reason based on the math
                        if (!event && defined.length > 0) {
                          const avgReturn = defined.reduce((sum, v) => sum + v, 0) / defined.length;
                          if (avgReturn >= 0) {
                            event = { 
                              label: `🟢 Average market growth of +${avgReturn.toFixed(1)}% lifted overall performance`, 
                              color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' 
                            };
                          } else {
                            event = { 
                              label: `🔴 Average market drop of ${avgReturn.toFixed(1)}% dragged down overall performance`, 
                              color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' 
                            };
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

            {/* ── Advanced Risk & Drawdown Matrix ── */}
            {fundData.length > 0 && (
              <div className="card p-5">
                <div className="mb-4">
                  <h2 className="font-bold text-slate-900 dark:text-white text-lg">⚖️ Advanced Risk & Drawdown Analysis</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Understand how much risk each fund takes to generate returns. Higher Sharpe/Sortino is better. Lower Drawdown/Volatility is safer.
                  </p>
                </div>
                <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap">Risk Metric</th>
                        {fundData.map((fund, i) => (
                          <th key={fund.schemeCode} className="px-4 py-3 font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                            <div className="line-clamp-1 max-w-[160px]" title={fund.meta?.scheme_name}>
                              {fund.meta?.scheme_name?.split(' ').slice(0, 4).join(' ') || fund.schemeCode}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {[
                        { 
                          key: 'volatility', 
                          label: 'Volatility (Std Dev)', 
                          desc: 'Daily price fluctuation. Lower is more stable.',
                          format: (val) => val ? `${val.toFixed(2)}%` : '—',
                          isBetter: 'lower'
                        },
                        { 
                          key: 'maxDrawdown', 
                          label: 'Max Drawdown', 
                          desc: 'Biggest historical drop from peak. Lower is safer.',
                          format: (val) => val ? `-${val.toFixed(2)}%` : '—',
                          isBetter: 'lower'
                        },
                        { 
                          key: 'sharpe', 
                          label: 'Sharpe Ratio', 
                          desc: 'Return generated per unit of total risk. Higher is better.',
                          format: (val) => val ? val.toFixed(2) : '—',
                          isBetter: 'higher'
                        },
                        { 
                          key: 'sortino', 
                          label: 'Sortino Ratio', 
                          desc: 'Return generated per unit of DOWNSIDE risk. Higher is better.',
                          format: (val) => val ? val.toFixed(2) : '—',
                          isBetter: 'higher'
                        }
                      ].map(metric => {
                        const vals = fundData.map(f => {
                          const m = calculateFundMetrics(f.navData);
                          return m ? m[metric.key] : null;
                        });
                        const validVals = vals.filter(v => v !== null && v !== undefined && !isNaN(v));
                        const bestVal = validVals.length > 0 ? (metric.isBetter === 'higher' ? Math.max(...validVals) : Math.min(...validVals)) : null;

                        return (
                          <tr key={metric.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">
                              <div className="flex flex-col gap-0.5">
                                <span>{metric.label}</span>
                                <span className="text-[10px] text-slate-400 font-normal">{metric.desc}</span>
                              </div>
                            </td>
                            {vals.map((val, idx) => {
                              const isBest = val !== null && val === bestVal && validVals.length > 1;
                              return (
                                <td key={idx} className="px-4 py-3 font-semibold text-sm tabular-nums text-slate-700 dark:text-slate-300">
                                  <span className={isBest ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded' : ''}>
                                    {metric.format(val)}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
                      {(sipMode === 'lumpsum' ? [10000, 50000, 100000, 500000] : [500, 1000, 5000, 10000]).map(p => (
                        <button key={p} onClick={() => { setSipAmount(p); setSipAmountInput(String(p)); }}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${
                            sipAmount === p && sipAmountInput === String(p)
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}>
                          {p >= 100000 ? `${p/100000}L` : p >= 1000 ? `${p/1000}K` : `${p}`}
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
                  const defaultTER = getER(fund.meta?.scheme_name, fund.schemeCode);
                  const fundTER = sipFundTER[codeStr] ?? defaultTER;

                  return (
                    <div key={`sip-${fund.schemeCode}`} className="border border-slate-100 dark:border-slate-700 rounded-xl p-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 line-clamp-2 mb-2 pr-2">
                        {fund.meta?.scheme_name}
                      </h4>

                      {/* Per-fund TER input */}
                      <TERInput
                        codeStr={codeStr}
                        fundName={fund.meta?.scheme_name || fund.schemeCode}
                        initialValue={fundTER}
                        onSave={setFundTER}
                      />

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
