// pages/Portfolio.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useFunds, fetchFundDetail } from "../hooks/useFunds";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDebounce } from "../hooks/useDebounce";
import { useToast } from "../components/Toast";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Process NAV list from newest to oldest into sorted oldest to newest array
const processNavData = (rawDetails) => {
  if (!rawDetails?.data) return [];
  return [...rawDetails.data]
    .reverse()
    .map((d) => {
      const [dd, mm, yyyy] = d.date.split("-");
      return {
        ts: new Date(`${yyyy}-${mm}-${dd}`).getTime(),
        nav: parseFloat(d.nav),
      };
    })
    .filter((d) => !isNaN(d.ts) && d.nav > 0);
};

// Binary search helper to find NAV on or closest after a target timestamp
const getNavOnDate = (sortedNavs, targetTs) => {
  if (!sortedNavs || sortedNavs.length === 0) return 0;
  const oldestTs = sortedNavs[0].ts;
  const latest = sortedNavs[sortedNavs.length - 1];

  if (targetTs < oldestTs) return sortedNavs[0].nav;
  if (targetTs > latest.ts) return latest.nav;

  let lo = 0;
  let hi = sortedNavs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedNavs[mid].ts < targetTs) lo = mid + 1;
    else hi = mid;
  }
  return sortedNavs[lo].nav;
};

const formatCurrency = (val) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
};

export default function Portfolio() {
  const addToast = useToast();
  const { funds, loading: listLoading } = useFunds();

  // Portfolio items in LocalStorage
  const [holdings, setHoldings] = useLocalStorage("fundlens_portfolio", []);
  
  // Notification Preferences
  const [notifyConfig, setNotifyConfig] = useLocalStorage("fundlens_portfolio_notify", {
    enabled: false,
    type: "total", // total or detail
    time: "evening", // morning or evening
  });

  // Cached fund details (NAV list, current price)
  const [detailsCache, setDetailsCache] = useState({});
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFund, setSelectedFund] = useState(null);
  const [investDate, setInvestDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [amount, setAmount] = useState("");
  const [manualOverride, setManualOverride] = useState(false);
  const [customNav, setCustomNav] = useState("");
  const [customUnits, setCustomUnits] = useState("");

  const [filterDirectOnly, setFilterDirectOnly] = useLocalStorage(
    "fundlens_portfolio_filter_direct",
    true
  );
  const [filterGrowthOnly, setFilterGrowthOnly] = useLocalStorage(
    "fundlens_portfolio_filter_growth",
    true
  );

  const debouncedQuery = useDebounce(searchQuery, 250);
  const dropdownRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Edit Form states
  const [editingHolding, setEditingHolding] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editInvestDate, setEditInvestDate] = useState("");
  const [editManualOverride, setEditManualOverride] = useState(false);
  const [editCustomNav, setEditCustomNav] = useState("");
  const [editCustomUnits, setEditCustomUnits] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmModalDelete, setConfirmModalDelete] = useState(false);

  // Helper to convert 24h format (HH:MM) to 12h parts
  const get12HourParts = (timeStr) => {
    if (!timeStr || !timeStr.includes(":")) {
      return { hour: "10", minute: "00", ampm: "AM" };
    }
    const [hStr, mStr] = timeStr.split(":");
    let h = parseInt(hStr, 10);
    const m = mStr;
    if (isNaN(h)) return { hour: "10", minute: "00", ampm: "AM" };

    let ampm = "AM";
    if (h >= 12) {
      ampm = "PM";
      if (h > 12) h -= 12;
    }
    if (h === 0) h = 12;

    return {
      hour: h.toString(),
      minute: m,
      ampm,
    };
  };

  const handleTimePartChange = (part, value) => {
    const parts = get12HourParts(notifyConfig.time);
    parts[part] = value;

    let hr = parseInt(parts.hour, 10);
    if (parts.ampm === "PM" && hr < 12) hr += 12;
    if (parts.ampm === "AM" && hr === 12) hr = 0;
    const hh = hr.toString().padStart(2, "0");
    const mm = parts.minute.padStart(2, "0");
    
    setNotifyConfig((prev) => ({ ...prev, time: `${hh}:${mm}` }));
  };

  // Load details for all holdings when they mount or change
  useEffect(() => {
    if (holdings.length === 0) return;
    
    let isMounted = true;
    const fetchAllDetails = async () => {
      setDetailsLoading(true);
      const updatedCache = { ...detailsCache };
      let neededFetch = false;

      for (const holding of holdings) {
        if (typeof holding.schemeCode === "string" && holding.schemeCode.startsWith("manual-")) {
          continue;
        }
        if (!updatedCache[holding.schemeCode]) {
          try {
            const data = await fetchFundDetail(holding.schemeCode);
            if (data) {
              updatedCache[holding.schemeCode] = {
                ...data,
                sortedNavs: processNavData(data),
              };
              neededFetch = true;
            }
          } catch (err) {
            console.error(`Failed to load details for ${holding.schemeCode}:`, err);
          }
        }
      }

      if (isMounted && neededFetch) {
        setDetailsCache(updatedCache);
      }
      setDetailsLoading(false);
    };

    fetchAllDetails();
    return () => {
      isMounted = false;
    };
  }, [holdings, detailsCache]);

  // Autocomplete fund matching
  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2 || !funds) return [];
    const q = debouncedQuery.toLowerCase();
    return funds
      .filter((f) => {
        const name = f.schemeName.toLowerCase();
        if (filterDirectOnly && !name.includes("direct")) return false;
        if (
          filterGrowthOnly &&
          (name.includes("idcw") || name.includes("dividend"))
        )
          return false;
        return (
          name.includes(q) ||
          f.schemeCode.toString().includes(debouncedQuery)
        );
      })
      .sort((a, b) => a.schemeName.length - b.schemeName.length)
      .slice(0, 10);
  }, [debouncedQuery, funds, filterDirectOnly, filterGrowthOnly]);

  // Click outside search dropdown to close
  useEffect(() => {
    const clickHandler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", clickHandler);
    return () => document.removeEventListener("mousedown", clickHandler);
  }, []);

  // Fetch and update Purchase NAV when selected fund or date changes
  useEffect(() => {
    if (!selectedFund) return;

    const getNAV = async () => {
      try {
        const details = await fetchFundDetail(selectedFund.schemeCode);
        if (details?.data) {
          const sorted = processNavData(details);
          const targetTs = new Date(investDate).getTime();
          const buyNav = getNavOnDate(sorted, targetTs);
          if (!manualOverride) {
            setCustomNav(buyNav.toFixed(4));
          }
        }
      } catch (err) {
        console.warn("Failed to lookup historical NAV:", err);
      }
    };

    getNAV();
  }, [selectedFund, investDate, manualOverride]);

  // Auto-calculate units when amount or NAV changes
  useEffect(() => {
    if (amount && customNav && !isNaN(amount) && !isNaN(customNav)) {
      const parsedAmount = parseFloat(amount);
      const parsedNav = parseFloat(customNav);
      if (parsedNav > 0) {
        setCustomUnits((parsedAmount / parsedNav).toFixed(4));
      }
    } else {
      setCustomUnits("");
    }
  }, [amount, customNav]);

  // Fetch and update Purchase NAV when editing holding date changes
  useEffect(() => {
    if (!editingHolding || editManualOverride) return;
    if (typeof editingHolding.schemeCode === "string" && editingHolding.schemeCode.startsWith("manual-")) {
      return;
    }

    const getNAV = async () => {
      try {
        const details = await fetchFundDetail(editingHolding.schemeCode);
        if (details?.data) {
          const sorted = processNavData(details);
          const targetTs = new Date(editInvestDate).getTime();
          const buyNav = getNavOnDate(sorted, targetTs);
          setEditCustomNav(buyNav.toFixed(4));
        }
      } catch (err) {
        console.warn("Failed to lookup historical NAV for edit:", err);
      }
    };

    getNAV();
  }, [editingHolding, editInvestDate, editManualOverride]);

  // Auto-calculate edit units when amount or NAV changes
  useEffect(() => {
    if (editAmount && editCustomNav && !isNaN(editAmount) && !isNaN(editCustomNav)) {
      const parsedAmount = parseFloat(editAmount);
      const parsedNav = parseFloat(editCustomNav);
      if (parsedNav > 0) {
        setEditCustomUnits((parsedAmount / parsedNav).toFixed(4));
      }
    } else {
      setEditCustomUnits("");
    }
  }, [editAmount, editCustomNav]);

  const handleEditClick = (holding) => {
    setEditingHolding(holding);
    setEditAmount(holding.amount.toString());
    setEditInvestDate(holding.investedDate);
    setEditCustomNav(holding.buyNav.toString());
    setEditCustomUnits(holding.units.toString());
    
    const isManual = typeof holding.schemeCode === "string" && holding.schemeCode.startsWith("manual-");
    setEditManualOverride(isManual);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingHolding || !editAmount || !editCustomNav || !editCustomUnits) {
      addToast("Please fill in all transaction fields.", "error");
      return;
    }

    setHoldings((prev) =>
      prev.map((h) =>
        String(h.id) === String(editingHolding.id)
          ? {
              ...h,
              investedDate: editInvestDate,
              amount: parseFloat(editAmount),
              buyNav: parseFloat(editCustomNav),
              units: parseFloat(editCustomUnits),
            }
          : h
      )
    );

    addToast(`Updated investment in ${editingHolding.schemeName}`, "success");
    setEditingHolding(null);
  };

  const handleFundSelect = (fund) => {
    setSelectedFund(fund);
    setSearchQuery(fund.schemeName);
    setSearchOpen(false);
  };

  const handleAddHolding = (e) => {
    e.preventDefault();
    
    const finalFundName = selectedFund ? selectedFund.schemeName : searchQuery.trim();
    const finalSchemeCode = selectedFund ? selectedFund.schemeCode : "manual-" + Date.now();
    
    if (!finalFundName || !amount || !customNav || !customUnits) {
      addToast("Please fill in all transaction fields.", "error");
      return;
    }

    const newHolding = {
      id: Date.now().toString(),
      schemeCode: finalSchemeCode,
      schemeName: finalFundName,
      investedDate: investDate,
      amount: parseFloat(amount),
      buyNav: parseFloat(customNav),
      units: parseFloat(customUnits),
    };

    setHoldings((prev) => [...prev, newHolding]);
    addToast(`Added investment in ${finalFundName}`, "success");
    
    // Reset form
    setSelectedFund(null);
    setSearchQuery("");
    setAmount("");
    setCustomNav("");
    setCustomUnits("");
    setManualOverride(false);
    setShowAddForm(false);

    // Show notification permission prompt if enabled is off and permission is default
    if (Notification.permission === "default") {
      requestNotificationPermission();
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setNotifyConfig((prev) => ({ ...prev, enabled: true }));
        addToast("Daily notifications enabled!", "success");
      } else {
        addToast("Notification permission denied by browser.", "warning");
      }
    } catch (err) {
      console.error("Error requesting permission:", err);
    }
  };

  const handleNotificationToggle = () => {
    if (!notifyConfig.enabled) {
      requestNotificationPermission();
    } else {
      setNotifyConfig((prev) => ({ ...prev, enabled: false }));
      addToast("Notifications disabled.", "info");
    }
  };

  // Compute live portfolio metrics
  const portfolioSummary = useMemo(() => {
    let totalInvested = 0;
    let totalCurrent = 0;
    let totalDailyChange = 0;

    const holdingRows = holdings.map((h) => {
      const details = detailsCache[h.schemeCode];
      const currentNav = details?.data?.[0]?.nav ? parseFloat(details.data[0].nav) : h.buyNav;
      const prevNav = details?.data?.[1]?.nav ? parseFloat(details.data[1].nav) : currentNav;
      
      const investedValue = h.amount;
      const currentValue = Math.round(h.units * currentNav);
      const gainLoss = currentValue - investedValue;
      const gainLossPct = investedValue > 0 ? (gainLoss / investedValue) * 100 : 0;
      
      const dailyChange = Math.round(h.units * (currentNav - prevNav));
      const dailyChangePct = prevNav > 0 ? ((currentNav - prevNav) / prevNav) * 100 : 0;

      totalInvested += investedValue;
      totalCurrent += currentValue;
      totalDailyChange += dailyChange;

      // Calculate CAGR
      const buyTime = new Date(h.investedDate).getTime();
      const todayTime = new Date().getTime();
      const years = (todayTime - buyTime) / (1000 * 60 * 60 * 24 * 365.25);
      const cagr = years >= 0.5 ? (Math.pow(currentValue / investedValue, 1 / years) - 1) * 100 : null;

      return {
        ...h,
        currentNav,
        currentValue,
        gainLoss,
        gainLossPct,
        dailyChange,
        dailyChangePct,
        cagr,
      };
    });

    const totalGainLoss = totalCurrent - totalInvested;
    const totalGainLossPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
    const totalDailyChangePct = (totalCurrent - totalDailyChange) > 0 
      ? (totalDailyChange / (totalCurrent - totalDailyChange)) * 100 
      : 0;

    return {
      totalInvested,
      totalCurrent,
      totalGainLoss,
      totalGainLossPct,
      totalDailyChange,
      totalDailyChangePct,
      holdings: holdingRows,
    };
  }, [holdings, detailsCache]);

  // Reconstruct portfolio valuation chart data over time
  const historicalChartData = useMemo(() => {
    if (holdings.length === 0) return [];
    
    // Check if details are loaded for all holdings
    const allLoaded = holdings.every((h) => detailsCache[h.schemeCode]?.sortedNavs);
    if (!allLoaded) return [];

    return generateHistoricalData(holdings, detailsCache);
  }, [holdings, detailsCache]);

  // Pie chart data for fund weight allocation (grouped by scheme name)
  const pieChartData = useMemo(() => {
    if (portfolioSummary.totalCurrent === 0) return [];
    
    const groups = {};
    portfolioSummary.holdings.forEach((h) => {
      const displayName = h.schemeName.length > 25 ? h.schemeName.slice(0, 25) + "..." : h.schemeName;
      if (!groups[displayName]) {
        groups[displayName] = 0;
      }
      groups[displayName] += h.currentValue;
    });

    return Object.entries(groups).map(([name, value]) => ({
      name,
      value,
    }));
  }, [portfolioSummary]);

  // Export holdings as a JSON file
  const handleExport = () => {
    const dataStr = JSON.stringify(holdings, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fundlens_portfolio_backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Portfolio backup exported successfully!", "success");
  };

  // Import holdings from a JSON file
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!Array.isArray(imported)) throw new Error("Format is not a list");
        
        // Basic schema check
        const isValid = imported.every(
          (item) => item.schemeCode && item.schemeName && item.amount && item.units
        );
        if (!isValid) throw new Error("Holdings schema mismatch");

        // Merge or replace options. Here we replace for safety.
        setHoldings(imported);
        addToast(`Successfully imported ${imported.length} holdings!`, "success");
      } catch (err) {
        addToast(`Failed to parse backup: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset input
  };

  const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-900 dark:text-slate-100">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mutual Fund Portfolio</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Track your investments, analyze performance historical charts, and set up daily alerts.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Backup Buttons */}
          <button
            onClick={handleExport}
            disabled={holdings.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Export Portfolio Backup"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Export
          </button>
          
          <label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Import
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] transition-all"
          >
            <span className="text-lg leading-none">+</span> Add Investment
          </button>
        </div>
      </div>

      {/* Main Grid */}
      {holdings.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#111622] text-center max-w-xl mx-auto shadow-sm">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold">Your Portfolio is Empty</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Start tracking your investments by adding your mutual fund transactions. We will load historical performance curves automatically.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-6 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg"
          >
            Add your first transaction
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Summary Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Current Portfolio Value</span>
              <div className="text-2xl font-black mt-1.5">{formatCurrency(portfolioSummary.totalCurrent)}</div>
              <div className="mt-2 text-xs font-medium text-slate-400">Live Valuation</div>
            </div>

            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Invested</span>
              <div className="text-2xl font-black mt-1.5">{formatCurrency(portfolioSummary.totalInvested)}</div>
              <div className="mt-2 text-xs font-medium text-slate-400">Total Capital Deployed</div>
            </div>

            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Gain / Loss</span>
              <div className={`text-2xl font-black mt-1.5 ${portfolioSummary.totalGainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.totalGainLoss >= 0 ? "+" : ""}
                {formatCurrency(portfolioSummary.totalGainLoss)}
              </div>
              <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${portfolioSummary.totalGainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.totalGainLoss >= 0 ? "▲" : "▼"}{" "}
                {portfolioSummary.totalGainLossPct.toFixed(2)}%
                <span className="text-slate-400 font-normal">(Absolute)</span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Today's Returns</span>
              <div className={`text-2xl font-black mt-1.5 ${portfolioSummary.totalDailyChange >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.totalDailyChange >= 0 ? "+" : ""}
                {formatCurrency(portfolioSummary.totalDailyChange)}
              </div>
              <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${portfolioSummary.totalDailyChange >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.totalDailyChange >= 0 ? "▲" : "▼"}{" "}
                {portfolioSummary.totalDailyChangePct.toFixed(2)}%
                <span className="text-slate-400 font-normal">(Daily)</span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Historical Growth Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col min-h-[350px]">
              <div className="mb-4">
                <h3 className="text-base font-bold">Historical Valuation Growth</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Portfolio current value vs step-line of invested capital over time.
                </p>
              </div>
              <div className="flex-1 min-h-[260px]">
                {detailsLoading ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Loading historical valuation curves...
                  </div>
                ) : historicalChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-4">
                    Fetching NAV historical points. Chart will display in a moment.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historicalChartData}>
                      <defs>
                        <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.1)"/>
                      <XAxis
                        dataKey="date"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        domain={[0, "auto"]}
                        tickFormatter={(v) => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "none",
                          borderRadius: "12px",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                        formatter={(value) => [formatCurrency(value), ""]}
                      />
                      <Area
                        type="monotone"
                        dataKey="Portfolio Value"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#valGrad)"
                      />
                      <Area
                        type="step"
                        dataKey="Invested Capital"
                        stroke="#8b5cf6"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        fill="none"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Allocation Split */}
            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col min-h-[350px]">
              <div className="mb-4">
                <h3 className="text-base font-bold">Fund Allocation Split</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Holdings value concentration breakdown.
                </p>
              </div>
              <div className="flex-1 flex items-center justify-center min-h-[220px]">
                {pieChartData.length === 0 ? (
                  <div className="text-xs text-slate-400">No holdings to allocate</div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center">
                    <div className="h-[180px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {pieChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              border: "none",
                              borderRadius: "12px",
                              color: "#fff",
                              fontSize: "12px",
                            }}
                            formatter={(value) => [formatCurrency(value), ""]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Compact Custom Legend */}
                    <div className="flex-1 overflow-y-auto max-h-[85px] w-full mt-2 text-left space-y-1.5 px-2">
                      {pieChartData.map((entry, index) => {
                        const pct = (entry.value / portfolioSummary.totalCurrent) * 100;
                        return (
                          <div key={entry.name} className="flex items-center justify-between text-[11px] font-medium">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              <span className="truncate text-slate-600 dark:text-slate-300">{entry.name}</span>
                            </div>
                            <span className="font-bold text-slate-800 dark:text-slate-100">{pct.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Settings / Notifications Card */}
          <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    Daily Portfolio Valuation Alerts
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                      PWA Native
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Receive a notification alert when new fund NAV data is fetched at the end of the day.
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={handleNotificationToggle}
                  className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                    notifyConfig.enabled
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                      : "bg-slate-100 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {notifyConfig.enabled ? "✓ Enabled" : "Enable Notifications"}
                </button>
              </div>
            </div>

            {notifyConfig.enabled && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Notification Detail Level</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNotifyConfig((prev) => ({ ...prev, type: "total" }))}
                      className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                        notifyConfig.type === "total"
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Option 1: Total Portfolio Value
                    </button>
                    <button
                      onClick={() => setNotifyConfig((prev) => ({ ...prev, type: "detail" }))}
                      className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                        notifyConfig.type === "detail"
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Option 2: Individual Fund Change
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Notification Time Preference</label>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNotifyConfig((prev) => ({ ...prev, time: "morning" }))}
                        className={`flex-1 px-3 py-2 text-[11px] font-bold rounded-lg border transition-colors ${
                          notifyConfig.time === "morning"
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        Morning (9 AM)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotifyConfig((prev) => ({ ...prev, time: "evening" }))}
                        className={`flex-1 px-3 py-2 text-[11px] font-bold rounded-lg border transition-colors ${
                          notifyConfig.time === "evening"
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        Evening (8 PM)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const currentTime = notifyConfig.time.includes(":") ? notifyConfig.time : "10:00";
                          setNotifyConfig((prev) => ({ ...prev, time: currentTime }));
                        }}
                        className={`flex-1 px-3 py-2 text-[11px] font-bold rounded-lg border transition-colors ${
                          notifyConfig.time.includes(":")
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        Custom Time
                      </button>
                    </div>

                    {notifyConfig.time.includes(":") && (
                      <div className="flex items-center gap-2 mt-1.5 animate-fade-in">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Select Time:</label>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={get12HourParts(notifyConfig.time).hour}
                            onChange={(e) => handleTimePartChange("hour", e.target.value)}
                            className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 font-mono"
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>

                          <span className="text-xs font-bold text-slate-400">:</span>

                          <select
                            value={get12HourParts(notifyConfig.time).minute}
                            onChange={(e) => handleTimePartChange("minute", e.target.value)}
                            className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 font-mono"
                          >
                            {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")).map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>

                          <select
                            value={get12HourParts(notifyConfig.time).ampm}
                            onChange={(e) => handleTimePartChange("ampm", e.target.value)}
                            className="px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Holdings List Section */}
          <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold">Invested Holdings ({portfolioSummary.holdings.length})</h3>
            </div>
            
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800/60 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="px-5 py-3">Fund Name</th>
                    <th className="px-5 py-3">Investment Details</th>
                    <th className="px-5 py-3 text-right">Units Held</th>
                    <th className="px-5 py-3 text-right">Current NAV</th>
                    <th className="px-5 py-3 text-right">Invested Amount</th>
                    <th className="px-5 py-3 text-right">Current Value</th>
                    <th className="px-5 py-3 text-right">Total Gain / Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30 text-sm">
                  {portfolioSummary.holdings.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors">
                      <td className="px-5 py-4 font-bold max-w-[220px]">
                        <div className="truncate text-slate-800 dark:text-slate-200" title={h.schemeName}>
                          {h.schemeName}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-semibold text-slate-400">
                          <span className="font-mono">AMFI: {h.schemeCode}</span>
                          <span>•</span>
                          <button
                            onClick={() => handleEditClick(h)}
                            className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline active:scale-95 transition-all"
                            title="Edit this holding"
                          >
                            Edit
                          </button>
                          <span>•</span>
                          {confirmDeleteId === String(h.id) ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setHoldings((prev) => prev.filter((item) => String(item.id) !== String(h.id)));
                                addToast("Holding removed from portfolio.", "info");
                                setConfirmDeleteId(null);
                              }}
                              className="text-amber-500 font-bold hover:text-amber-600 dark:hover:text-amber-400 hover:underline active:scale-95 transition-all animate-pulse"
                              title="Click again to confirm removal"
                            >
                              Confirm?
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setConfirmDeleteId(String(h.id));
                                setTimeout(() => {
                                  setConfirmDeleteId((prev) => prev === String(h.id) ? null : prev);
                                }, 3000);
                              }}
                              className="text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 hover:underline active:scale-95 transition-all"
                              title="Delete this holding"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(h.investedDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-medium">{h.units.toFixed(4)}</td>
                      <td className="px-5 py-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        ₹{h.currentNav.toFixed(4)}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-slate-800 dark:text-slate-200">
                        {formatCurrency(h.amount)}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-slate-800 dark:text-slate-200">
                        {formatCurrency(h.currentValue)}
                      </td>
                      <td className="px-5 py-4 text-right font-bold">
                        <span className={h.gainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}>
                          {h.gainLoss >= 0 ? "+" : ""}
                          {formatCurrency(h.gainLoss)}
                        </span>
                        <div className={`text-[10px] font-bold mt-1 ${h.gainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {h.gainLoss >= 0 ? "▲" : "▼"} {h.gainLossPct.toFixed(2)}%
                          {h.cagr !== null && (
                            <span className="text-slate-400 font-normal"> ({h.cagr.toFixed(1)}% CAGR)</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out/Modal Add Investment Form */}
      {showAddForm && (
        <div className="fixed inset-0 z-[150] overflow-y-auto" role="dialog" aria-modal="true">
          {/* Overlay */}
          <div
            onClick={() => setShowAddForm(false)}
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
          />

          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="relative bg-white dark:bg-[#0f1420] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Add Portfolio Investment</h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddHolding} className="space-y-4">
                
                {/* Search Fund */}
                <div className="relative" ref={dropdownRef}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Search Mutual Fund
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFilterDirectOnly(!filterDirectOnly)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-colors border ${
                          filterDirectOnly
                            ? "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                            : "bg-transparent text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {filterDirectOnly ? "✓ Direct" : "Direct"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterGrowthOnly(!filterGrowthOnly)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-colors border ${
                          filterGrowthOnly
                            ? "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                            : "bg-transparent text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {filterGrowthOnly ? "✓ Growth" : "Growth"}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Enter fund name or AMFI code..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSearchOpen(true);
                      if (selectedFund && e.target.value !== selectedFund.schemeName) {
                        setSelectedFund(null);
                      }
                    }}
                    onFocus={() => setSearchOpen(true)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                  
                  {/* Search Autocomplete Dropdown */}
                  {searchOpen && (listLoading || searchResults.length > 0) && (
                    <div className="absolute left-0 right-0 z-[160] mt-1.5 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40">
                      {listLoading ? (
                        <div className="px-4 py-3 text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          Loading fund database...
                        </div>
                      ) : (
                        searchResults.map((f) => (
                        <button
                          key={f.schemeCode}
                          type="button"
                          onClick={() => handleFundSelect(f)}
                          className="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 block transition-colors truncate"
                        >
                          {f.schemeName}
                          <span className="block font-mono text-[9px] text-slate-400 mt-0.5">Code: {f.schemeCode}</span>
                        </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Amount and Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Amount Invested (₹)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 10000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Investment Date
                    </label>
                    <input
                      type="date"
                      required
                      max={new Date().toISOString().split("T")[0]}
                      value={investDate}
                      onChange={(e) => setInvestDate(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>

                {/* Manual Override Checkbox */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="override"
                    checked={manualOverride}
                    onChange={(e) => setManualOverride(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                  />
                  <label htmlFor="override" className="text-xs font-bold text-slate-500 cursor-pointer">
                    Override NAV / Units manually
                  </label>
                </div>

                {/* NAV and Units Display / Edit */}
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Purchase NAV (₹)
                    </label>
                    <input
                      type="number"
                      required
                      step="0.0001"
                      readOnly={!manualOverride}
                      placeholder={selectedFund ? "Loading..." : "NAV"}
                      value={customNav}
                      onChange={(e) => setCustomNav(e.target.value)}
                      className={`w-full px-4 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                        manualOverride
                          ? "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                          : "bg-slate-100 dark:bg-slate-800/40 border-transparent text-slate-400 cursor-not-allowed"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Units Allocated
                    </label>
                    <input
                      type="number"
                      required
                      step="0.0001"
                      readOnly={!manualOverride}
                      placeholder={selectedFund ? "Auto-calculating..." : "Units"}
                      value={customUnits}
                      onChange={(e) => setCustomUnits(e.target.value)}
                      className={`w-full px-4 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                        manualOverride
                          ? "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                          : "bg-slate-100 dark:bg-slate-800/40 border-transparent text-slate-400 cursor-not-allowed"
                      }`}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg active:scale-95 transition-all"
                  >
                    Save Investment
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out/Modal Edit Investment Form */}
      {editingHolding && (
        <div className="fixed inset-0 z-[150] overflow-y-auto" role="dialog" aria-modal="true">
          {/* Overlay */}
          <div
            onClick={() => setEditingHolding(null)}
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
          />

          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="relative bg-white dark:bg-[#0f1420] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Edit Portfolio Investment</h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-1 leading-normal truncate max-w-[320px]">
                    {editingHolding.schemeName}
                  </p>
                </div>
                <button
                  onClick={() => setEditingHolding(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                
                {/* Info Text */}
                <div className="text-xs bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-slate-500 dark:text-slate-400 leading-relaxed">
                  Modifying your investment updates the units and valuation calculations. 
                  {typeof editingHolding.schemeCode === "string" && !editingHolding.schemeCode.startsWith?.("manual-") && " NAV is automatically looked up using AMFI history."}
                </div>

                {/* Amount and Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Amount Invested (₹)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 10000"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Investment Date
                    </label>
                    <input
                      type="date"
                      required
                      max={new Date().toISOString().split("T")[0]}
                      value={editInvestDate}
                      onChange={(e) => setEditInvestDate(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>

                {/* Manual Override checkbox */}
                <div className="flex items-center gap-2 px-1">
                  <input
                    type="checkbox"
                    id="editManualOverride"
                    checked={editManualOverride}
                    onChange={(e) => setEditManualOverride(e.target.checked)}
                    className="w-4.5 h-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="editManualOverride" className="text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                    Override NAV / Units manually
                  </label>
                </div>

                {/* Buy NAV and Units */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Purchase NAV (₹)
                    </label>
                    <input
                      type="number"
                      required
                      step="0.0001"
                      readOnly={!editManualOverride}
                      placeholder="NAV price"
                      value={editCustomNav}
                      onChange={(e) => setEditCustomNav(e.target.value)}
                      className={`w-full px-4 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                        editManualOverride
                          ? "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                          : "bg-slate-100 dark:bg-slate-800/40 border-transparent text-slate-400 cursor-not-allowed"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      Units Allocated
                    </label>
                    <input
                      type="number"
                      required
                      step="0.0001"
                      readOnly={!editManualOverride}
                      placeholder="Units"
                      value={editCustomUnits}
                      onChange={(e) => setEditCustomUnits(e.target.value)}
                      className={`w-full px-4 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                        editManualOverride
                          ? "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                          : "bg-slate-100 dark:bg-slate-800/40 border-transparent text-slate-400 cursor-not-allowed"
                      }`}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/60">
                  {confirmModalDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        setHoldings((prev) => prev.filter((h) => String(h.id) !== String(editingHolding.id)));
                        addToast("Holding removed from portfolio.", "info");
                        setEditingHolding(null);
                        setConfirmModalDelete(false);
                      }}
                      className="px-4 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-lg active:scale-[0.98] transition-all animate-pulse"
                      title="Click again to confirm removal"
                    >
                      Confirm Delete?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModalDelete(true);
                        setTimeout(() => {
                          setConfirmModalDelete(false);
                        }, 3000);
                      }}
                      className="px-4 py-2.5 text-xs font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 dark:border-rose-950 rounded-xl transition-all"
                    >
                      Delete Fund
                    </button>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingHolding(null)}
                      className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg active:scale-[0.98] transition-all"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Generate sampled historical data values for Recharts AreaChart
function generateHistoricalData(holdings, detailsMap) {
  let oldestDate = new Date();
  holdings.forEach((h) => {
    const d = new Date(h.investedDate);
    if (d < oldestDate) oldestDate = d;
  });

  const today = new Date();
  const diffDays = Math.ceil(Math.abs(today - oldestDate) / (1000 * 60 * 60 * 24));

  let stepDays = 1;
  if (diffDays > 1000) stepDays = 14;
  else if (diffDays > 365) stepDays = 7;
  else if (diffDays > 90) stepDays = 3;

  const dataPoints = [];
  const currentDate = new Date(oldestDate);

  while (currentDate <= today) {
    const ts = currentDate.getTime();
    const dateStr = currentDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });

    let totalCurrentValue = 0;
    let totalInvestedValue = 0;

    holdings.forEach((h) => {
      const buyDate = new Date(h.investedDate);
      if (currentDate >= buyDate) {
        totalInvestedValue += h.amount;

        const details = detailsMap[h.schemeCode];
        if (details?.sortedNavs) {
          const navVal = getNavOnDate(details.sortedNavs, ts);
          totalCurrentValue += h.units * navVal;
        } else {
          totalCurrentValue += h.amount;
        }
      }
    });

    dataPoints.push({
      date: dateStr,
      "Portfolio Value": Math.round(totalCurrentValue),
      "Invested Capital": Math.round(totalInvestedValue),
    });

    currentDate.setDate(currentDate.getDate() + stepDays);
  }

  // Include final point
  const latestPoint = dataPoints[dataPoints.length - 1];
  const todayStr = today.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
  
  if (latestPoint && latestPoint.date !== todayStr) {
    let totalCurrentValue = 0;
    let totalInvestedValue = 0;
    holdings.forEach((h) => {
      totalInvestedValue += h.amount;
      const details = detailsMap[h.schemeCode];
      if (details?.data?.[0]) {
        totalCurrentValue += h.units * parseFloat(details.data[0].nav);
      } else {
        totalCurrentValue += h.amount;
      }
    });
    dataPoints.push({
      date: todayStr,
      "Portfolio Value": Math.round(totalCurrentValue),
      "Invested Capital": Math.round(totalInvestedValue),
    });
  }

  return dataPoints;
}
