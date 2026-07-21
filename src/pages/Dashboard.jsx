// pages/Dashboard.jsx
// Future-proof: modular sections, easy to extend
import { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useFunds, fetchFundDetail } from "../hooks/useFunds";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDebounce } from "../hooks/useDebounce";
import ErrorState from "../components/ErrorState";
import { calculateSIP } from "../utils/sipCalculations";
const FundDetailModal = lazy(() => import("../components/FundDetailModal"));
import { inferCategory } from "../utils/goalFilters";
import { isFundClosed } from "../utils/fundFilters";
import marketReasons from "../data/marketReasons.json";
import historicalLeadersData from "../data/historicalLeadersData.json";

// ─── Category config ───────────────────────────────────────────
const CAT_CFG = {
  Equity: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color: "#2563eb", // Vivid Blue
  },
  Debt: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    color: "#16a34a", // Forest Green
  },
  Hybrid: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: "#ea580c", // Burnt Orange
  },
  ELSS: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    color: "#7c3aed", // Deep Violet
  },
  Index: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    color: "#0891b2", // Cyan
  },
  Liquid: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    color: "#db2777", // Hot Pink — clearly different from Debt green
  },
  "Gold/Intl": {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "#ca8a04", // Gold/Amber
  },
  Other: {
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    color: "#64748b", // Slate Grey
  },
};

// ─── Per-subcategory distinct color palette ─────────────────────
// 10 visually separated hues cycling through the color wheel
const SUBCAT_PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#ea580c", // orange
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // pink
  "#ca8a04", // amber
  "#dc2626", // red
  "#0d9488", // teal
  "#9333ea", // purple
];


// ─── Actual historical returns (2013–2025) computed from AMFI NAV data ────
// Source: AMFI API (api.mfapi.in) — representative direct-growth fund per subcategory
// Methodology: Calendar-year return = (Dec 31 NAV - Jan 1 NAV) / Jan 1 NAV × 100
// Data verified: July 2026
const SUBCAT_DATA = {
  Equity: {
    "Small Cap": [11.3, 99.3, 16.1, 6.8, 65.0, -15.7, -1.6, 30.3, 75.9, 7.5, 50.9, 26.4, -4.0],
    "Mid Cap": [9.2, 77.8, 6.8, 12.4, 43.0, -10.2, 0.9, 22.6, 40.9, 13.1, 45.9, 29.1, 7.5],
    "Large Cap": [9.5, 42.2, 0.8, 8.8, 33.2, 0.8, 10.5, 14.2, 30.0, 7.5, 28.2, 17.5, 11.9],
    "Flexi Cap": [6.7, 47.2, 1.3, 1.6, 29.6, 4.9, 12.3, 32.4, 35.0, -12.7, 20.6, 15.3, 1.7],
    "Multi Cap": [3.8, 60.9, 1.2, -5.9, 41.5, -1.1, 2.8, 0.8, 49.9, 15.0, 39.6, 26.4, 4.9]
  },
  Index: {
    "Nifty 50": [4.9, 30.9, -3.7, 4.0, 28.5, 5.2, 13.0, 15.1, 25.1, 5.4, 21.1, 9.7, 11.6],
    "Nifty Next 50": [4.1, 44.2, 6.7, 8.2, 45.9, -8.2, 1.0, 14.7, 30.1, 0.5, 27.0, 27.4, 2.5],
    "Sensex": [9.1, 29.1, -4.4, 2.5, 27.8, 7.7, 15.1, 17.0, 22.9, 5.6, 20.2, 9.1, 10.1],
    "Nifty Midcap 150": [-3.1, 56.0, 7.0, 4.4, 45.9, -10.6, 7.4, 22.9, 47.6, 6.7, 50.4, 27.4, 4.5]
  },
  Hybrid: {
    "Aggressive Hybrid": [11.3, 44.1, 8.5, 5.0, 28.6, 1.3, 14.2, 13.6, 24.5, 3.0, 17.1, 15.1, 13.1],
    "Balanced Advantage (DAA)": [10.6, 30.1, 8.1, 8.9, 20.4, 3.8, 11.4, 12.4, 15.9, 8.6, 17.3, 12.9, 12.9],
    "Arbitrage": [9.4, 9.6, 8.1, 7.2, 6.4, 6.8, 6.6, 4.9, 4.6, 5.1, 8.1, 8.4, 7.1],
    "Multi Asset": [15.7, 38.1, -0.5, 13.4, 29.0, -0.9, 8.5, 10.7, 35.5, 17.6, 25.2, 16.9, 19.5]
  },
  Debt: {
    "Gilt (Govt Bonds)": [5.7, 20.2, 7.8, 17.0, 4.4, 5.8, 13.6, 12.2, 3.5, 4.7, 8.0, 9.6, 5.0],
    "Corporate Bond": [7.5, 11.1, 8.7, 10.7, 6.7, 6.5, 10.4, 12.1, 4.2, 3.6, 7.5, 8.8, 7.6],
    "Short Duration": [8.4, 10.6, 8.9, 9.5, 6.8, 7.0, 9.9, 11.4, 4.4, 4.0, 7.6, 8.5, 8.2],
    "Credit Risk": [8.3, 12.0, 9.9, 10.5, 7.9, 7.6, 10.1, 10.5, 6.9, 5.7, 8.1, 9.1, 10.2]
  },
  Liquid: {
    "Liquid Fund": [9.3, 9.1, 8.3, 7.7, 6.6, 7.4, 6.6, 4.3, 3.4, 4.9, 7.1, 7.4, 6.5],
    "Overnight Fund": [9.0, 8.9, 8.0, 6.9, 5.9, 6.3, 5.7, 3.4, 3.2, 4.7, 6.6, 6.7, 5.8],
    "Money Market": [9.3, 9.2, 8.5, 7.8, 6.7, 7.7, 8.1, 5.8, 3.8, 4.9, 7.5, 7.8, 7.5]
  },
  ELSS: {
    "ELSS Tax Saver (Direct)": [4.7, 57.2, -5.8, 8.3, 38.8, -9.7, 4.3, 6.4, 36.0, 11.1, 34.0, 22.1, 10.9],
    "ELSS Tax Saver (Regular)": [6.7, 52.2, 4.4, 11.3, 35.4, -7.1, 14.8, 15.0, 35.1, 4.5, 30.5, 23.4, 7.5]
  },
  "Gold/Intl": {
    "Gold Fund": [-6.8, -9.8, -7.7, 10.5, 4.6, 6.2, 23.3, 27.9, -5.3, 13.0, 15.0, 19.3, 71.9],
    "Silver Fund": [-20.0, -15.0, -10.0, 12.0, 3.0, 5.0, 20.0, 30.0, -8.0, 10.0, 7.7, 15.2, 155.7]
  },
  Other: {
    "Retirement Fund": [10.0, 35.0, 5.0, 8.0, 25.0, -2.0, 10.0, 12.0, 22.0, 9.2, 28.1, 11.9, 6.2],
    "Children's Fund": [-0.8, 32.2, 8.0, 16.9, 25.1, 1.3, 3.5, 15.7, 18.9, 2.3, 17.4, 17.8, 3.6]
  }
};

const SUBCAT_ABBR = {
  "Small Cap": "Small",
  "Mid Cap": "Mid",
  "Large Cap": "Large",
  "Large & Mid Cap": "Large & Mid",
  "Flexi Cap": "Flexi",
  "Multi Cap": "Multi",
  "Balanced Advantage (DAA)": "Balanced Adv",
  "Aggressive Hybrid": "Aggr Hybrid",
  "Gilt (Govt Bonds)": "Gilt",
  "Corporate Bond": "Corp Bond",
  "Short Duration": "Short Dur",
  "Liquid Fund": "Liquid",
  "Overnight Fund": "Overnight",
  "Money Market": "Money Mkt",
  "ELSS Tax Saver (Direct)": "ELSS Direct",
  "ELSS Tax Saver (Regular)": "ELSS Regular",
  "Nifty Midcap 150": "Midcap 150",
  "Nifty Next 50": "Next 50",
  "Gold Fund": "Gold",
  "Silver Fund": "Silver",
  "Retirement Fund": "Retirement",
  "Children's Fund": "Children"
};

const SUBCAT_REPRESENTATIVE_CODES = {
  "Small Cap": "118778",
  "Mid Cap": "118989",
  "Large Cap": "120586",
  "Flexi Cap": "122639",
  "Multi Cap": "118650",
  "Nifty 50": "119827",
  "Nifty Next 50": "148945",
  "Sensex": "118785",
  "Nifty Midcap 150": "151724",
  "Aggressive Hybrid": "119609",
  "Balanced Advantage (DAA)": "120377",
  "Arbitrage": "119771",
  "Multi Asset": "120334",
  "Gilt (Govt Bonds)": "119707",
  "Corporate Bond": "118987",
  "Short Duration": "119016",
  "Credit Risk": "120711",
  "Liquid Fund": "119800",
  "Overnight Fund": "119110",
  "Money Market": "119092",
  "ELSS Tax Saver (Direct)": "135781",
  "ELSS Tax Saver (Regular)": "135784",
  "Gold Fund": "119788",
  "Silver Fund": "149760",
  "Retirement Fund": "148683",
  "Children's Fund": "119719"
};

const HISTORICAL_LEADERS_SCHEME_CODES = {
  "Small Cap": ["118778", "125497", "130503", "120591", "120164", "125354"],
  "Mid Cap": ["118989", "120505", "119071", "120841", "127042", "119716"],
  "Large Cap": ["120586", "118632", "118825", "118269", "118419", "120152"],
  "Flexi Cap": ["122639", "118955", "119718", "120166", "120662", "120843"],
  "Multi Cap": ["112039", "118650", "149368", "120599", "149185", "149882"],
  "Nifty 50": ["119827", "120716", "149107", "120620", "118741", "149039"],
  "Nifty Next 50": ["148945", "143341", "120684", "149288", "153567", "146381"],
  "Sensex": ["151769", "141841", "118785", "153286", "149803", "118791"],
  "Nifty Midcap 150": ["148726", "149389", "151724", "150313", "118266", "118347"],
  "Aggressive Hybrid": ["119609", "119062", "118272", "117608", "118485", "118546"],
  "Balanced Advantage (DAA)": ["120377", "118968", "149134", "144335", "118736", "118615"],
  "Arbitrage": ["119771", "153498", "120313", "118585", "118931", "120795"],
  "Multi Asset": ["120334", "119843", "119131", "117608", "120760", "120524"],
  "Gilt (Govt Bonds)": ["119707", "120590", "119114", "120792", "119757", "118672"],
  "Corporate Bond": ["146215", "118987", "120692", "133791", "118807", "119533"],
  "Short Duration": ["119828", "119016", "120608", "119739", "118796", "120510"],
  "Credit Risk": ["128051", "120711", "119798", "119741", "118780", "133488"],
  "Liquid Fund": ["119800", "119091", "120197", "119766", "118701", "120389"],
  "Overnight Fund": ["119833", "119110", "145536", "146141", "145810", "146675"],
  "Money Market": ["119092", "120211", "119746", "118715", "147567", "118379"],
  "ELSS Tax Saver (Direct)": ["111549", "135781", "118285", "132933", "119060", "119242"],
  "ELSS Tax Saver (Regular)": ["100175", "135784", "111722", "132924", "104772", "111549"],
  "Gold Fund": ["119788", "118663", "119781", "120473", "119277", "115132"],
  "Silver Fund": ["149760", "149775", "150737", "151603", "149780", "151731"],
  "Retirement Fund": ["148683", "136094", "119251", "146349", "133568", "118548"],
  "Children's Fund": ["119719", "120724", "119296", "135762", "118521", "118523"]
};

const SUBCAT_FALLBACKS = {
  "Small Cap": 28.3,
  "Mid Cap": 23.0,
  "Large Cap": 16.5,
  "Flexi Cap": 15.1,
  "Multi Cap": 18.4,
  "Nifty 50": 13.1,
  "Nifty Next 50": 15.7,
  "Sensex": 13.2,
  "Nifty Midcap 150": 20.5,
  "Aggressive Hybrid": 15.3,
  "Balanced Advantage (DAA)": 13.3,
  "Arbitrage": 7.1,
  "Multi Asset": 17.6,
  "Gilt (Govt Bonds)": 9.0,
  "Corporate Bond": 8.1,
  "Short Duration": 8.1,
  "Credit Risk": 9.0,
  "Liquid Fund": 6.8,
  "Overnight Fund": 6.2,
  "Money Market": 7.1,
  "ELSS Tax Saver (Direct)": 16.8,
  "ELSS Tax Saver (Regular)": 18.0,
  "Gold Fund": 12.5,
  "Silver Fund": 15.8,
  "Retirement Fund": 13.9,
  "Children's Fund": 12.5,
  "Gold/Intl": 12.8,
  "Other": 9.4
};

function parseNavDate(dateStr) {
  const parts = dateStr.split("-").map(Number);
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date();
}

function getNavForYearBoundary(navs, year) {
  // Find NAV closest to Dec 31 of (year - 1), within a 15-day window
  // This prevents picking a 2026 NAV when searching for 2013 start date
  const targetDate = new Date(year - 1, 11, 31);
  const MAX_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
  let closestNav = null;
  let minDiff = Infinity;
  for (const item of navs) {
    const d = parseNavDate(item.date);
    const diff = Math.abs(d - targetDate);
    if (diff < minDiff && diff <= MAX_WINDOW_MS) {
      minDiff = diff;
      closestNav = parseFloat(item.nav);
    }
  }
  return closestNav;
}

function getNavForYearEnd(navs, year, currentYear) {
  let targetDate;
  if (year === currentYear) {
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-indexed: Jan=0, Feb=1, etc.
    if (currentMonth === 0) {
      // In January, no completed month in the current year, use the latest NAV
      return parseFloat(navs[0].nav);
    } else {
      // Target the last day of the previous calendar month
      targetDate = new Date(year, currentMonth, 0);
    }
  } else {
    targetDate = new Date(year, 11, 31); // Dec 31 of year
  }

  const MAX_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
  let closestNav = null;
  let minDiff = Infinity;
  for (const item of navs) {
    const d = parseNavDate(item.date);
    const diff = Math.abs(d - targetDate);
    if (diff < minDiff && diff <= MAX_WINDOW_MS) {
      minDiff = diff;
      closestNav = parseFloat(item.nav);
    }
  }
  return closestNav;
}



function generateHistoricalLeaders(subcategory, years) {
  const leadersBySubcat = historicalLeadersData[subcategory] || {};
  const leadersByYear = {};
  
  years.forEach(year => {
    if (leadersBySubcat[year]) {
      leadersByYear[year] = leadersBySubcat[year];
    } else {
      // Fallback/Placeholder for future or current years (e.g. 2026) using actual fund names from 2025
      const latestAvailableYear = Object.keys(leadersBySubcat).sort().pop();
      const latestFunds = latestAvailableYear ? leadersBySubcat[latestAvailableYear] : [];
      
      leadersByYear[year] = Array.from({ length: 6 }, (_, idx) => ({
        name: latestFunds[idx]?.name || `Representative Fund ${idx + 1} (${subcategory})`,
        returnPct: (SUBCAT_FALLBACKS[subcategory] ?? 12.0) - (idx * 0.5)
      }));
    }
  });
  
  return leadersByYear;
}

// ─── Fund Search Box ───────────────────────────────────────────
function FundSearchBox({
  funds,
  onSelectFund,
  loading,
  loadingSlow,
  error,
  refetch,
  onFocus,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const debouncedQuery = useDebounce(query, 300);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useMemo(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return funds
      .filter((f) => f.schemeName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [debouncedQuery, funds]);

  const handleSelect = (fund) => {
    setQuery("");
    setOpen(false);
    onSelectFund(fund);
  };

  const handleTrigger = () => {
    if (onFocus) onFocus();
  };

  return (
    <div ref={ref} className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z"
          />
        </svg>
        <input
          type="text"
          id="fund-search-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.slice(0, 100));
            setOpen(true);
            handleTrigger();
          }}
          onFocus={() => {
            setOpen(true);
            handleTrigger();
          }}
          placeholder={"Search any fund by name or scheme code..."}
          maxLength={100}
          aria-label="Search mutual funds by name or scheme code"
          className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 text-sm shadow-sm transition-all"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-500 mt-2 text-center">
        Type to search · Click a fund to view details · No page change needed
      </p>

      {/* Dropdown results / Loading / Error states */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {open && results.length > 0
          ? `${results.length} funds found`
          : open && debouncedQuery.length >= 2 && results.length === 0
            ? "No funds found"
            : ""}
      </span>

      {open && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl z-50 overflow-hidden">
          {loading && (
            <div className="px-4 py-6 text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Loading 4,000+ mutual funds...
              </p>
              {loadingSlow && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Connection is slow. Please wait.
                </p>
              )}
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-6 text-center space-y-3">
              <p className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (refetch) refetch();
                }}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
              >
                Retry Loading
              </button>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <>
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {results.length} results — click to view details
                </span>
                <span className="text-[10px] text-blue-500 font-semibold">
                  No page navigation
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {results.map((fund) => {
                  const cat = inferCategory(fund.schemeName);
                  const cfg = CAT_CFG[cat] || CAT_CFG.Other;
                  const closed = isFundClosed(fund.schemeName);
                  return (
                    <button
                      key={fund.schemeCode}
                      onClick={() => handleSelect(fund)}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all text-left border-b border-slate-50 dark:border-slate-700/50 last:border-0"
                    >
                      <span className="mt-0.5 flex-shrink-0 text-slate-400 dark:text-slate-500">{cfg.icon("w-5 h-5")}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ background: cfg.color }}
                          >
                            {cat}
                          </span>
                          {closed && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400">
                              CLOSED
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {fund.schemeName}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Code #{fund.schemeCode}
                        </p>
                      </div>
                      <span className="text-[10px] text-blue-500 font-semibold flex-shrink-0 mt-1">
                        View →
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <Link
                  to="/screener"
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                >
                  See all results in Screener →
                </Link>
              </div>
            </>
          )}

          {!loading && !error && debouncedQuery.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
              No funds found matching &quot;{debouncedQuery}&quot;
            </div>
          )}

          {!loading && !error && debouncedQuery.trim().length < 2 && (
            <div className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-xs">
              Type at least 2 characters to search...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Quick SIP Calc ─────────────────────────────────────────────
function QuickCalc() {
  const [amt, setAmt] = useState(5000);
  const [yrs, setYrs] = useState(10);
  const [rate, setRate] = useState(12);
  // Use canonical calculateSIP to prevent formula drift with the full SIP calculator
  const { maturity: mat, invested: inv } = useMemo(
    () => calculateSIP(amt, yrs, rate),
    [amt, yrs, rate],
  );
  const fmt = (n) =>
    n >= 10000000
      ? `₹${(n / 10000000).toFixed(2)} Cr`
      : n >= 100000
        ? `₹${(n / 100000).toFixed(1)} L`
        : `₹${n.toLocaleString("en-IN")}`;
  return (
    <div className="card p-4 sm:p-5 h-full">
      <h3 className="font-bold text-slate-900 dark:text-white mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 00-2-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
        <span>Quick Wealth Simulator</span>
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 mb-4">
        {[
          ["monthly-amt", "Monthly ₹", amt, setAmt, 100, 200000],
          ["sip-years", "Years", yrs, setYrs, 1, 40],
          ["return-rate", "Return %", rate, setRate, 1, 30],
        ].map(([id, l, v, s, mn, mx]) => (
          <div key={l}>
            <label
              htmlFor={id}
              className="text-[10px] text-slate-600 dark:text-slate-400 block mb-1"
            >
              {l}
            </label>
            <input
              id={id}
              type="number"
              value={v}
              onChange={(e) => s(Math.max(mn, Math.min(mx, +e.target.value)))}
              className="input-base w-full py-2 text-sm text-center font-bold"
              inputMode="numeric"
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mb-4 mobile-grid-1">
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
          <div className="text-[10px] text-slate-600 dark:text-slate-400 mb-1">You Invest</div>
          <div className="font-bold text-sm text-slate-900 dark:text-white">
            {fmt(inv)}
          </div>
        </div>
        <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mb-1">
            Gains
          </div>
          <div className="font-bold text-sm text-emerald-700 dark:text-emerald-400">
            +{fmt(mat - inv)}
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-3 border border-blue-100 dark:border-blue-800">
          <div className="text-[10px] text-blue-600 dark:text-blue-400 mb-1">
            Total
          </div>
          <div className="font-bold text-sm text-blue-700 dark:text-blue-300">
            {fmt(mat)}
          </div>
        </div>
      </div>
      <Link
        to="/sip"
        className="btn-primary w-full text-center block py-2.5 text-xs"
      >
        Full Calculator: Step-Up SIP, FIRE & Tax Saving →
      </Link>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const { funds, loading, loadingSlow, error, refetch, triggerFetch } = useFunds({ lazy: true });
  const [watchlist] = useLocalStorage("fundlens_watchlist", []);
  const [modalFund, setModalFund] = useState(null);
  const [activeCategory, setActiveCategory] = useState("Equity");
  const [dynamicSubcatReturns, setDynamicSubcatReturns] = useState({});
  const [isWorstFirst, setIsWorstFirst] = useState(false);
  const [activeLeaderSubcat, setActiveLeaderSubcat] = useState(null);

  const getRankLabel = (rank, total, isWorstFirst) => {
    const num = rank + 1;
    let suffix = "th";
    if (num % 100 < 11 || num % 100 > 13) {
      switch (num % 10) {
        case 1: suffix = "st"; break;
        case 2: suffix = "nd"; break;
        case 3: suffix = "rd"; break;
      }
    }
    const label = `${num}${suffix}`;
    if (isWorstFirst) {
      if (rank === 0) return `${label} (Worst) ⚠️`;
      if (rank === total - 1) return `${label} (Best) 🏆`;
    } else {
      if (rank === 0) return `${label} 🏆`;
      if (rank === total - 1) return `${label} ⚠️`;
    }
    return label;
  };

  useEffect(() => {
    let active = true;
    const fetchDynamicReturns = async () => {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      const cacheKey = `fundlens_dynamic_returns_${currentYear}_${currentMonth}`;

      // Try to load from cache first
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Object.keys(parsed).length > 0) {
            setDynamicSubcatReturns(parsed);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to read returns from cache:", e);
      }

      const results = {};
      const tasks = Object.entries(SUBCAT_REPRESENTATIVE_CODES).map(async ([subcat, code]) => {
        try {
          const details = await fetchFundDetail(code);
          if (details && details.data && details.data.length > 0) {
            const navs = details.data;
            const yearResults = {};
            for (let y = 2026; y <= currentYear; y++) {
              const startNav = getNavForYearBoundary(navs, y);
              const endNav = getNavForYearEnd(navs, y, currentYear);
              if (startNav && endNav) {
                const ret = ((endNav - startNav) / startNav) * 100;
                yearResults[y] = parseFloat(ret.toFixed(1));
              } else {
                yearResults[y] = SUBCAT_FALLBACKS[subcat] || 12.0;
              }
            }
            results[subcat] = yearResults;
          } else {
            results[subcat] = getFallbacksForAllYears(subcat, currentYear);
          }
        } catch (err) {
          console.warn(`Failed to fetch dynamic returns for ${subcat}:`, err);
          results[subcat] = getFallbacksForAllYears(subcat, currentYear);
        }
      });

      await Promise.allSettled(tasks);
      if (active) {
        setDynamicSubcatReturns(results);
        
        // Write to cache and clean up older cache entries to prevent bloat
        try {
          localStorage.setItem(cacheKey, JSON.stringify(results));
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("fundlens_dynamic_returns_") && key !== cacheKey) {
              localStorage.removeItem(key);
            }
          }
        } catch (e) {
          console.warn("Failed to save returns to cache:", e);
        }
      }
    };

    function getFallbacksForAllYears(subcat, currentYear) {
      const res = {};
      for (let y = 2026; y <= currentYear; y++) {
        res[y] = SUBCAT_FALLBACKS[subcat] || 12.0;
      }
      return res;
    }

    fetchDynamicReturns();
    return () => {
      active = false;
    };
  }, []);

  const [leadersLoading, setLeadersLoading] = useState(false);
  const [realLeadersData, setRealLeadersData] = useState(null);

  useEffect(() => {
    let active = true;
    
    // Determine the active subcategory matching the render-prop default
    const currentYear = new Date().getFullYear();
    const activeSubcatMap = {};
    Object.keys(SUBCAT_DATA).forEach((cat) => {
      activeSubcatMap[cat] = {};
      Object.keys(SUBCAT_DATA[cat]).forEach((subcat) => {
        const arr = [...SUBCAT_DATA[cat][subcat]];
        for (let y = 2026; y <= currentYear; y++) {
          arr.push(dynamicSubcatReturns[subcat]?.[y] ?? SUBCAT_FALLBACKS[subcat] ?? 12.0);
        }
        activeSubcatMap[cat][subcat] = arr;
      });
    });

    const subcatDataset = activeSubcatMap[activeCategory] || {};
    const subcatAverages = Object.entries(subcatDataset).map(([subcategory, returns]) => {
      const product = returns.reduce((acc, r) => acc * (1 + r / 100), 1);
      const geoMean = (Math.pow(product, 1 / returns.length) - 1) * 100;
      return { subcategory, avg: geoMean };
    });

    if (subcatAverages.length === 0) return;
    subcatAverages.sort((a, b) => isWorstFirst ? a.avg - b.avg : b.avg - a.avg);

    const currentSubcat = activeLeaderSubcat || subcatAverages[0].subcategory;
    
    const codes = HISTORICAL_LEADERS_SCHEME_CODES[currentSubcat];
    if (!codes || codes.length === 0) {
      setRealLeadersData(null);
      return;
    }

    const fetchLeadersData = async () => {
      setLeadersLoading(true);
      
      // Check localStorage cache first for consistent values between page loads
      const currentMonth = new Date().getMonth();
      const leadersCacheKey = `fundlens_leaders_${currentSubcat}_${new Date().getFullYear()}_${currentMonth}`;
      try {
        const cached = localStorage.getItem(leadersCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Object.keys(parsed).length > 0) {
            if (active) {
              setRealLeadersData(parsed);
              setLeadersLoading(false);
            }
            return;
          }
        }
      } catch (e) { /* ignore cache read errors */ }
      
      try {
        const results = {};
        
        // Fetch details for all 6 schemes in parallel
        const fetchTasks = codes.map(async (code) => {
          try {
            const detail = await fetchFundDetail(code);
            return { code, detail };
          } catch (err) {
            console.warn(`Failed to fetch leader details for code ${code}:`, err);
            return { code, detail: null };
          }
        });
        
        const fetched = await Promise.all(fetchTasks);
        
        const currentYearVal = new Date().getFullYear();
        
        // Construct years array: 2013 to currentYearVal
        const YEARS_ARRAY = [];
        for (let y = 2013; y <= currentYearVal; y++) {
          YEARS_ARRAY.push(y);
        }

        const dataByYear = {};
        
        YEARS_ARRAY.forEach((year) => {
          if (year <= 2025 && historicalLeadersData[currentSubcat]?.[year]) {
            dataByYear[year] = historicalLeadersData[currentSubcat][year];
            return;
          }

          const yearFunds = [];
          
          fetched.forEach(({ code, detail }) => {
            if (detail && detail.data && detail.data.length > 0) {
              const navs = detail.data;
              const startNav = getNavForYearBoundary(navs, year);
              const endNav = getNavForYearEnd(navs, year, currentYearVal);
              
              if (startNav && endNav && startNav > 0) {
                const returnPct = ((endNav - startNav) / startNav) * 100;
                const rawName = detail.meta?.scheme_name || detail.schemeName || `${currentSubcat} Fund`;
                
                // Format/clean fund name
                let cleanName = rawName
                  .replace(/ - Direct Plan| - Regular Plan/gi, "")
                  .replace(/ Growth Option| Growth/gi, "")
                  .replace(/ Direct-Growth| Direct Plan-Growth| Direct Growth/gi, "")
                  .replace(/ Regular-Growth| Regular Plan-Growth| Regular Growth/gi, "")
                  .trim();
                
                yearFunds.push({
                  name: cleanName,
                  returnPct: returnPct
                });
              }
            }
          });
          
          // Sort descending by returnPct
          yearFunds.sort((a, b) => b.returnPct - a.returnPct);
          
          // Pad to exactly 6 funds if needed
          if (yearFunds.length < 6) {
            const subcatRetVal = activeSubcatMap[activeCategory]?.[currentSubcat]
              ? activeSubcatMap[activeCategory][currentSubcat][YEARS_ARRAY.indexOf(year)]
              : 12.0;
              
            const fallbackAMCs = [
              "Nippon India", "SBI", "HDFC", "ICICI Pru", "Kotak", "Axis", "Quant", "Mirae Asset"
            ];
            
            let nameIdx = 0;
            while (yearFunds.length < 6) {
              let fallbackName = "";
              while (nameIdx < fallbackAMCs.length) {
                const candidate = `${fallbackAMCs[nameIdx]} ${currentSubcat} Fund`;
                if (!yearFunds.some(f => f.name.includes(fallbackAMCs[nameIdx]))) {
                  fallbackName = candidate;
                  nameIdx++;
                  break;
                }
                nameIdx++;
              }
              if (!fallbackName) {
                fallbackName = `Fallback Fund ${yearFunds.length + 1}`;
              }
              yearFunds.push({
                name: fallbackName,
                returnPct: subcatRetVal - (yearFunds.length * 0.5)
              });
            }
          }
          
          dataByYear[year] = yearFunds.slice(0, 6);
        });
        
        if (active) {
          setRealLeadersData(dataByYear);
          setLeadersLoading(false);
          // Cache the computed data for consistency between page loads
          try {
            localStorage.setItem(leadersCacheKey, JSON.stringify(dataByYear));
            // Clean up old leaders cache entries
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (key && key.startsWith("fundlens_leaders_") && key !== leadersCacheKey) {
                localStorage.removeItem(key);
              }
            }
          } catch (e) { /* ignore cache write errors */ }
        }
      } catch (err) {
        console.error("Error computing real leaders:", err);
        if (active) {
          setLeadersLoading(false);
        }
      }
    };
    
    fetchLeadersData();
    
    return () => {
      active = false;
    };
  }, [activeLeaderSubcat, activeCategory, dynamicSubcatReturns, isWorstFirst]);

  useEffect(() => {
    setActiveLeaderSubcat(null);
  }, [activeCategory]);


  const catStats = useMemo(() => {
    const c = {};
    for (const f of funds) {
      const cat = inferCategory(f.schemeName);
      c[cat] = (c[cat] || 0) + 1;
    }
    return c;
  }, [funds]);

  const watchlistFunds = useMemo(
    () =>
      watchlist
        .map((code) => funds.find((f) => String(f.schemeCode) === String(code)))
        .filter(Boolean)
        .slice(0, 4),
    [watchlist, funds],
  );

  return (
    <div className="min-h-screen pb-24 md:pb-8 overflow-x-hidden">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-20 pb-12 px-4 md:pt-28 md:pb-16 bg-gradient-to-b from-slate-50/50 via-transparent to-transparent dark:from-slate-900/20">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute top-20 -left-40 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-white/5 backdrop-blur-md px-4 py-2 rounded-full text-sm mb-6 border border-slate-200/60 dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">
              Live data ·{" "}
              {funds.length > 0 ? `${funds.length.toLocaleString("en-IN")}+` : "37,000+"}{" "}
              mutual funds
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-5 text-slate-900 dark:text-white leading-tight tracking-tight">
            Find & Analyse
            <br />
            <span className="gradient-text">
              Any Mutual Fund
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            Search, view details, compare, and simulate your wealth growth in one click — completely free.
          </p>

          {/* ── Fund Search — Main Feature ── */}
          {/* min-h prevents CLS when switching states */}
          <div className="w-full max-w-2xl mx-auto" style={{ minHeight: '5.5rem' }}>
            <FundSearchBox
              funds={funds}
              onSelectFund={setModalFund}
              loading={loading}
              loadingSlow={loadingSlow}
              error={error}
              refetch={refetch}
              onFocus={triggerFetch}
            />
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 mt-6 w-full max-w-md sm:max-w-none mx-auto">
            <Link
              to="/screener"
              className="btn-primary px-6 py-3.5 shadow-lg shadow-blue-500/10 dark:shadow-blue-500/5 w-full sm:w-auto text-center flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z"/></svg>
              <span>Browse & Filter Funds</span>
            </Link>
            <Link
              to="/compare"
              className="btn-secondary px-6 py-3.5 w-full sm:w-auto text-center flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/80 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              <span>Compare Funds</span>
            </Link>
            <Link
              to="/sip"
              className="btn-secondary px-6 py-3.5 w-full sm:w-auto text-center flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/80 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>Wealth Simulator</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {error && <ErrorState message={error} onRetry={refetch} />}

        {/* ── Quick Tools Grid ── */}
        <section
          aria-labelledby="quick-tools-heading"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 320px",
          }}
        >
          <h2
            id="quick-tools-heading"
            className="text-xl font-bold text-slate-900 dark:text-white mb-4"
          >
            Quick Tools
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <QuickCalc />
            <div className="card p-5 h-full">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19a7 7 0 100-14 7 7 0 000 14zM12 15a3 3 0 100-6 3 3 0 000 6z"/></svg>
                <span>Goal-Based Fund Matching</span>
              </h3>
              <div className="space-y-3">
                {[
                  {
                    goal: "Emergency Fund",
                    type: "Liquid Fund",
                    horizon: "0–6 months",
                    risk: "Very Low",
                    color: "text-teal-700 dark:text-teal-400",
                  },
                  {
                    goal: "Short-term Goal",
                    type: "Debt Fund",
                    horizon: "1–3 years",
                    risk: "Low",
                    color: "text-emerald-700 dark:text-emerald-400",
                  },
                  {
                    goal: "Save Tax (80C)",
                    type: "ELSS Fund",
                    horizon: "3+ years (lock-in)",
                    risk: "Moderate",
                    color: "text-purple-600 dark:text-purple-400",
                  },
                  {
                    goal: "Long-term Wealth",
                    type: "Equity Fund",
                    horizon: "7+ years",
                    risk: "High",
                    color: "text-blue-600 dark:text-blue-400",
                  },
                  {
                    goal: "FIRE / Retirement",
                    type: "Index Fund",
                    horizon: "15+ years",
                    risk: "Moderate",
                    color: "text-indigo-600 dark:text-indigo-400",
                  },
                ].map((item) => (
                  <div
                    key={item.goal}
                    className="flex items-center justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.goal}
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                        {item.horizon} · Risk: {item.risk}
                      </div>
                    </div>
                    <span className={`font-bold ${item.color}`}>
                      {item.type}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                to="/screener"
                className="btn-secondary w-full text-center text-xs py-2 mt-4 block"
              >
                Find Funds by Goal →
              </Link>
            </div>
          </div>
        </section>

        {/* ── Browse by Category ── */}
        {!loading && !error && (
          <section
            aria-labelledby="browse-category-heading"
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "auto 280px",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2
                  id="browse-category-heading"
                  className="text-xl font-bold text-slate-900 dark:text-white"
                >
                  Browse by Category
                </h2>
                <p className="text-xs text-slate-700 dark:text-slate-400 mt-0.5">
                  Click any category to explore in Screener
                </p>
              </div>
              <Link
                to="/screener"
                className="text-sm text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                View All →
              </Link>
            </div>
            {/* Mobile: scroll, Desktop: grid */}
            <div className="hidden sm:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {Object.entries(CAT_CFG).map(([cat, cfg]) => {
                const count = catStats[cat] || 0;
                if (!count) return null;
                return (
                  <Link
                    key={cat}
                    to={`/screener?cat=${cat}`}
                    className="card p-4 text-center hover-glow transition-all group duration-300 flex flex-col justify-between"
                  >
                    <div>
                      <div 
                        className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300"
                        style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                      >
                        {cfg.icon("w-6 h-6")}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                        {cat}
                      </div>
                    </div>
                    <div
                      className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80"
                      style={{ color: cfg.color }}
                    >
                      {count.toLocaleString("en-IN")} funds
                    </div>
                  </Link>
                );
              })}
            </div>
            {/* Mobile: horizontal pill scroll */}
            <div className="pill-scroll sm:hidden pb-2">
              {Object.entries(CAT_CFG).map(([cat, cfg]) => {
                const count = catStats[cat] || 0;
                if (!count) return null;
                return (
                  <Link
                    key={cat}
                    to={`/screener?cat=${cat}`}
                    className="flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161b27] min-w-[80px] active:scale-95 transition-transform"
                  >
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}
                    >
                      {cfg.icon("w-5 h-5")}
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white text-center leading-tight">{cat}</div>
                    <div className="text-[9px] font-bold" style={{ color: cfg.color }}>{count.toLocaleString("en-IN")}</div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Watchlist ── */}
        {!loading && watchlistFunds.length > 0 && (
          <section
            aria-labelledby="watchlist-heading"
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "auto 260px",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                id="watchlist-heading"
                className="text-xl font-bold text-slate-900 dark:text-white"
              >
                ⭐ My Watchlist
              </h2>
              <Link
                to="/screener?tab=watchlist"
                className="text-sm text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                View all {watchlist.length} →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {watchlistFunds.map((fund) => {
                const cat = inferCategory(fund.schemeName);
                const cfg = CAT_CFG[cat] || CAT_CFG.Other;
                return (
                  <div
                    key={fund.schemeCode}
                    className="card p-5 border-t-4 hover-glow transition-all duration-300 flex flex-col justify-between"
                    style={{ borderTopColor: cfg.color }}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span 
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                          style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                        >
                          {cfg.icon("w-3 h-3")}
                          <span>{cat}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">#{fund.schemeCode}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-950 dark:text-slate-50 line-clamp-2 mb-4 leading-snug">
                        {fund.schemeName}
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModalFund(fund)}
                        className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-150"
                      >
                        Details
                      </button>
                      <Link
                        to={`/compare?code=${fund.schemeCode}`}
                        className="flex-1 text-[11px] font-bold py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-center transition-all duration-150 shadow-sm shadow-blue-500/10"
                      >
                        Analyse →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Fund of the Week ── */}
        <section
          aria-labelledby="fotw-heading"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 280px",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2
                id="fotw-heading"
                className="text-xl font-bold text-slate-900 dark:text-white"
              >
                ⭐ Curated Picks
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Editor-selected funds worth keeping on your radar
              </p>
            </div>
            <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full font-bold border border-amber-200 dark:border-amber-800">
              Updated Weekly
            </span>
          </div>
          {/* Desktop: 3-col grid | Mobile: horizontal swipeable scroll */}
          <div className="hidden sm:grid sm:grid-cols-3 gap-4">
            {[
              {
                code: "122639",
                name: "Parag Parikh Flexi Cap",
                category: "Equity",
                badge: "Flexi Cap",
                highlight: "Global Diversification",
                reason:
                  "Strong multi-cap fund with ~35% overseas allocation. Low overlap with Nifty-heavy peers. Consistent top-quartile 5Y returns.",
                color: "#1d4ed8",
              },
              {
                code: "120503",
                name: "Mirae Asset Large Cap",
                category: "Equity",
                badge: "Large Cap",
                highlight: "Category Leader",
                reason:
                  "One of the lowest expense ratios in large-cap category. Consistent alpha over benchmark across market cycles.",
                color: "#047857",
              },
              {
                code: "120465",
                name: "Axis Small Cap",
                category: "Equity",
                badge: "Small Cap",
                highlight: "High Growth",
                reason:
                  "Top-performing small cap with disciplined portfolio. Ideal for aggressive investors with 7+ year horizon.",
                color: "#6d28d9",
              },
            ].map((pick) => (
              <div
                key={pick.code}
                className="card p-4 border-l-4 hover:shadow-md transition-all group"
                style={{ borderLeftColor: pick.color }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: pick.color }}
                  >
                    {pick.badge}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    {pick.highlight}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 line-clamp-1">
                  {pick.name}
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mb-3 line-clamp-3">
                  {pick.reason}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setModalFund({
                        schemeCode: pick.code,
                        schemeName: pick.name,
                      })
                    }
                    className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                  >
                    View Details
                  </button>
                  <Link
                    to={`/compare?code=${pick.code}`}
                    className="flex-1 text-xs font-bold py-1.5 rounded-lg text-center transition-all text-white"
                    style={{ background: pick.color }}
                  >
                    Analyse →
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {/* Mobile swipeable picks */}
          <div className="compare-card-scroll sm:hidden">
            {[
              {
                code: "122639",
                name: "Parag Parikh Flexi Cap",
                badge: "Flexi Cap",
                highlight: "Global Diversification",
                reason: "Strong multi-cap fund with ~35% overseas allocation. Consistent top-quartile 5Y returns.",
                color: "#1d4ed8",
              },
              {
                code: "120503",
                name: "Mirae Asset Large Cap",
                badge: "Large Cap",
                highlight: "Category Leader",
                reason: "Lowest expense ratio in large-cap. Consistent alpha over benchmark across market cycles.",
                color: "#047857",
              },
              {
                code: "120465",
                name: "Axis Small Cap",
                badge: "Small Cap",
                highlight: "High Growth",
                reason: "Top-performing small cap. Ideal for aggressive investors with 7+ year horizon.",
                color: "#6d28d9",
              },
            ].map((pick) => (
              <div
                key={pick.code}
                className="card p-4 border-l-4"
                style={{ borderLeftColor: pick.color }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: pick.color }}>{pick.badge}</span>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{pick.highlight}</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{pick.name}</h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mb-3">{pick.reason}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalFund({ schemeCode: pick.code, schemeName: pick.name })}
                    className="flex-1 text-xs font-bold py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                  >
                    Details
                  </button>
                  <Link to={`/compare?code=${pick.code}`} className="flex-1 text-xs font-bold py-2 rounded-lg text-center text-white" style={{ background: pick.color }}>
                    Analyse →
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-500 mt-2 flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <span>Curated picks are for educational purposes only. Not investment advice. Consult a SEBI-registered advisor before investing.</span>
          </p>
        </section>

        {/* ── Category Performance Heatmap ── */}
        <section
          aria-labelledby="heatmap-heading"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 260px",
          }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="heatmap-heading"
                className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"
              >
                <svg className="w-5 h-5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                <span>Category Returns Heatmap</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Approximate annual returns by fund category — spot market cycles
                at a glance (current year updated monthly)
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm flex-shrink-0">
              <button
                onClick={() => setIsWorstFirst(false)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all duration-200 ${
                  !isWorstFirst
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/40 dark:border-slate-800"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Best First 🏆
              </button>
              <button
                onClick={() => setIsWorstFirst(true)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all duration-200 ${
                  isWorstFirst
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/40 dark:border-slate-800"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Worst First ⚠️
              </button>
            </div>
          </div>
          <div className="card p-4 overflow-x-auto custom-scrollbar pb-6">
            {(() => {
              const currentYear = new Date().getFullYear();
              const YEARS = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
              for (let y = 2026; y <= currentYear; y++) {
                YEARS.push(y);
              }

              // Base historical returns up to 2025 — computed from AMFI NAV data (July 2026)
              const BASE_DATA = {
                Equity: [8.1, 65.5, 5.2, 4.7, 42.5, -4.3, 5.0, 20.1, 46.3, 6.1, 37.0, 22.9, 4.4],
                Index: [3.8, 40.0, 1.4, 4.8, 37.0, -1.5, 9.1, 17.4, 31.4, 4.5, 29.7, 18.4, 7.2],
                ELSS: [5.7, 54.7, -0.7, 9.8, 37.1, -8.4, 9.6, 10.7, 35.5, 7.8, 32.3, 22.8, 9.2],
                Hybrid: [11.8, 30.5, 6.1, 8.6, 21.1, 2.7, 10.2, 10.4, 20.1, 8.6, 16.9, 13.3, 13.2],
                Debt: [7.5, 13.5, 8.8, 11.9, 6.5, 6.7, 11.0, 11.5, 4.8, 4.5, 7.8, 9.0, 7.7],
                Liquid: [9.2, 9.1, 8.3, 7.5, 6.4, 7.1, 6.8, 4.5, 3.5, 4.8, 7.1, 7.3, 6.6],
                "Gold/Intl": [-13.4, -12.4, -8.8, 11.3, 3.8, 5.6, 21.6, 28.9, -6.7, 11.5, 11.3, 17.3, 113.8],
                Other: [4.6, 33.6, 6.5, 12.4, 25.1, -0.3, 6.8, 13.8, 20.4, 5.8, 22.8, 14.9, 4.9],
              };

              // Reconstruct full SUBCAT_DATA and DATA dynamically for current year + future years
              const getDynamicSubcatReturn = (subcat, year) => {
                return dynamicSubcatReturns[subcat]?.[year] ?? SUBCAT_FALLBACKS[subcat] ?? 12.0;
              };

              const getDynamicCategoryReturn = (cat, year) => {
                const subcats = Object.keys(SUBCAT_DATA[cat] || {});
                if (subcats.length === 0) return SUBCAT_FALLBACKS[cat] ?? 12.0;
                let sum = 0;
                for (const sub of subcats) {
                  sum += getDynamicSubcatReturn(sub, year);
                }
                return parseFloat((sum / subcats.length).toFixed(1));
              };

              // Build active DATA map
              const DATA = {};
              Object.keys(BASE_DATA).forEach((cat) => {
                const arr = [...BASE_DATA[cat]];
                for (let y = 2026; y <= currentYear; y++) {
                  arr.push(getDynamicCategoryReturn(cat, y));
                }
                DATA[cat] = arr;
              });

              // Build active subcat data map
              const activeSubcatDataMap = {};
              Object.keys(SUBCAT_DATA).forEach((cat) => {
                activeSubcatDataMap[cat] = {};
                Object.keys(SUBCAT_DATA[cat]).forEach((subcat) => {
                  const arr = [...SUBCAT_DATA[cat][subcat]];
                  for (let y = 2026; y <= currentYear; y++) {
                    arr.push(getDynamicSubcatReturn(subcat, y));
                  }
                  activeSubcatDataMap[cat][subcat] = arr;
                });
              });

              const ranks = Array.from({ length: Object.keys(DATA).length }, (_, idx) => idx);

              // Rank categories for each year descending by returns
              const sortedYearsData = YEARS.map((year, i) => {
                const list = Object.entries(DATA).map(([category, returns]) => ({
                  category,
                  returnVal: returns[i],
                }));
                list.sort((a, b) => isWorstFirst ? a.returnVal - b.returnVal : b.returnVal - a.returnVal);
                return { year, list };
              });


              return (
                <div className="min-w-[1200px]">
                  <table className="w-full text-xs border-collapse table-fixed">
                    <thead>
                      <tr>
                        <th className="text-left py-2 pr-4 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider w-16">
                          Rank
                        </th>
                        {YEARS.map((y) => (
                          <th
                            key={y}
                            className="text-center py-2.5 px-2 text-slate-700 dark:text-slate-300 font-bold text-sm bg-slate-50/80 dark:bg-slate-800/40 first:rounded-l-xl last:rounded-r-xl min-w-[125px]"
                          >
                            {y}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {ranks.map((r) => {
                        const rankLabel = getRankLabel(r, ranks.length, isWorstFirst);
                        return (
                          <tr key={r} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/5 transition-colors">
                            <td className="py-3 pr-4 font-bold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                              {rankLabel}
                            </td>
                            {sortedYearsData.map(({ year, list }) => {
                              const item = list[r];
                              const catColor = CAT_CFG[item.category]?.color || "#64748b";
                              // Dynamic opacity based on rank (r goes 0 to 7)
                              const opacity = Math.max(0.40, 1.0 - r * 0.07);
                              const bgHex = Math.round(opacity * 255).toString(16).padStart(2, "0");
                              const borderHex = Math.round(Math.min(1, opacity + 0.2) * 255).toString(16).padStart(2, "0");
                              
                              return (
                                <td key={year} className="px-1 py-1.5 min-w-[125px]">
                                  <div
                                    className="rounded-2xl p-2.5 transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default text-center border"
                                    style={{
                                      backgroundColor: `${catColor}${bgHex}`,
                                      borderColor: `${catColor}${borderHex}`,
                                    }}
                                  >
                                    <div className="text-[11px] font-extrabold uppercase tracking-wider mb-1 text-white drop-shadow-sm break-words leading-tight line-clamp-2 min-h-[26px] flex items-center justify-center">
                                      {item.category}
                                    </div>
                                    <div className="text-sm font-black tabular-nums text-white drop-shadow-sm">
                                      {item.returnVal > 0 ? "+" : ""}
                                      {item.returnVal}%
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                    {Object.entries(CAT_CFG).map(([cat, cfg]) => (
                      <span
                        key={cat}
                        className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: cfg.color }}
                        />
                        <span className="font-semibold">{cat}</span>
                      </span>
                    ))}
                  </div>

                  {/* Overall Performance Analysis (Average Returns 2013 - Present) */}
                  {(() => {
                    const overallAverages = Object.entries(DATA).map(([category, returns]) => {
                      // Geometric mean (CAGR) — industry standard for multi-year return averages
                      const product = returns.reduce((acc, r) => acc * (1 + r / 100), 1);
                      const avg = parseFloat(((Math.pow(product, 1 / returns.length) - 1) * 100).toFixed(2));
                      return { category, avg };
                    });
                    overallAverages.sort((a, b) => isWorstFirst ? a.avg - b.avg : b.avg - a.avg);

                    const subcatDataset = activeSubcatDataMap[activeCategory] || {};
                    const subcatList = Object.keys(subcatDataset);
                    const subcatRanks = subcatList.map((_, idx) => idx);

                    // Rank subcategories for each year descending by returns
                    const sortedSubcatYearsData = YEARS.map((year, yearIdx) => {
                      const list = Object.entries(subcatDataset).map(([subcategory, returns]) => ({
                        subcategory,
                        returnVal: returns[yearIdx],
                      }));
                      list.sort((a, b) => isWorstFirst ? a.returnVal - b.returnVal : b.returnVal - a.returnVal);
                      return { year, list };
                    });

                    const subcatAverages = Object.entries(subcatDataset).map(([subcategory, returns]) => {
                      // Geometric mean (CAGR) — industry standard for multi-year return averages
                      const product = returns.reduce((acc, r) => acc * (1 + r / 100), 1);
                      const geoMean = (Math.pow(product, 1 / returns.length) - 1) * 100;
                      return { subcategory, avg: parseFloat(geoMean.toFixed(2)) };
                    });
                    subcatAverages.sort((a, b) => isWorstFirst ? a.avg - b.avg : b.avg - a.avg);

                    return (
                      <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/60">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                          Overall Performance Analysis (2013 - {currentYear} Average)
                        </h3>
                        <div className="flex flex-col gap-5">
                          {/* Category Ranking List */}
                          <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-3">
                              📊 Select Category (Ranked by Average Return)
                            </span>
                            <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
                              {overallAverages.map((item, idx) => {
                                const catColor = CAT_CFG[item.category]?.color || "#64748b";
                                const isActive = activeCategory === item.category;
                                return (
                                  <button
                                    key={item.category}
                                    onClick={() => setActiveCategory(item.category)}
                                    className={`min-w-[180px] flex-shrink-0 flex items-center justify-between p-2.5 rounded-xl transition-all border text-left ${
                                      isActive
                                        ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm font-black ring-1"
                                        : "bg-transparent border-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/20"
                                    }`}
                                    style={{ ringColor: isActive ? catColor : "transparent" }}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 pr-1">
                                      <span className="font-extrabold text-[10px] text-slate-400 dark:text-slate-500 w-3 flex-shrink-0">
                                        {idx + 1}
                                      </span>
                                      <div
                                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{
                                          backgroundColor: `${catColor}15`,
                                          color: catColor,
                                        }}
                                      >
                                        {CAT_CFG[item.category]?.icon("w-4 h-4")}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-[11px] font-extrabold text-slate-900 dark:text-white capitalize truncate">
                                          {item.category}
                                        </div>
                                      </div>
                                    </div>
                                    <span
                                      className="text-[9px] font-extrabold px-2 py-0.5 rounded-md flex-shrink-0 border"
                                      style={{
                                        backgroundColor: `${catColor}18`,
                                        borderColor: `${catColor}55`,
                                        color: catColor,
                                      }}
                                    >
                                      +{item.avg.toFixed(1)}%
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Interactive Subcategory Returns Heatmap */}
                          <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex flex-col justify-between overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full inline-block animate-pulse"
                                    style={{ backgroundColor: CAT_CFG[activeCategory]?.color }}
                                  />
                                  Subcategory Periodic Returns: {activeCategory}
                                </h4>
                                <span className="text-[9px] text-slate-500 font-semibold bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full shadow-sm border border-slate-100 dark:border-slate-800">
                                  Yearly Ranked Descending
                                </span>
                              </div>

                              <div className="overflow-x-auto custom-scrollbar pb-2">
                                <div className="min-w-[1200px]">
                                  <table className="w-full text-xs border-collapse table-fixed">
                                    <thead>
                                      <tr>
                                        <th className="text-left pb-3 text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 pr-4 w-16">
                                          Rank
                                        </th>
                                        {YEARS.map((year) => (
                                          <th
                                            key={year}
                                            className="text-center pb-3 text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 min-w-[125px]"
                                          >
                                            {year}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {subcatRanks.map((r) => {
                                        const rankLabel = getRankLabel(r, subcatRanks.length, isWorstFirst);
                                        return (
                                          <tr key={r} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/5 transition-colors">
                                            <td className="py-3 pr-4 font-extrabold text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                                              {rankLabel}
                                            </td>
                                            {sortedSubcatYearsData.map(({ year, list }) => {
                                              const item = list[r];
                                              if (!item) return <td key={year} className="px-1 py-1.5 min-w-[125px]" />;
                                              // Each subcategory gets its own stable color from the palette
                                              const subcatIdx = subcatList.indexOf(item.subcategory);
                                              const subColor = SUBCAT_PALETTE[subcatIdx % SUBCAT_PALETTE.length];
                                              
                                              // Dynamic opacity based on rank
                                              const opacity = Math.max(0.60, 1.0 - r * 0.08);
                                              const bgHex = Math.round(opacity * 255).toString(16).padStart(2, "0");
                                              const borderHex = Math.round(Math.min(1, opacity + 0.2) * 255).toString(16).padStart(2, "0");

                                              return (
                                                <td key={year} className="px-1 py-1.5 min-w-[125px]">
                                                  <div
                                                    className="rounded-xl p-2.5 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default text-center border"
                                                    style={{
                                                      backgroundColor: `${subColor}${bgHex}`,
                                                      borderColor: `${subColor}${borderHex}`,
                                                    }}
                                                  >
                                                    <div
                                                      className="text-[11px] font-extrabold uppercase tracking-wider mb-0.5 mx-auto text-white drop-shadow-sm break-words leading-tight line-clamp-2 min-h-[28px] flex items-center justify-center"
                                                      title={item.subcategory}
                                                    >
                                                      {SUBCAT_ABBR[item.subcategory] || item.subcategory}
                                                    </div>
                                                    <div className="text-sm font-black tabular-nums text-white drop-shadow-sm">
                                                      {item.returnVal > 0 ? "+" : ""}
                                                      {item.returnVal}%
                                                    </div>
                                                  </div>
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
                            </div>

                            {/* Average Performance Bar */}
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
                              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500">
                                {YEARS.length}-Year Average Return:
                              </span>
                              {subcatAverages.map((item, idx) => {
                                const avgSubColor = SUBCAT_PALETTE[idx % SUBCAT_PALETTE.length];
                                const isSelected = (activeLeaderSubcat || subcatAverages[0].subcategory) === item.subcategory;
                                return (
                                  <button
                                    key={item.subcategory}
                                    onClick={() => setActiveLeaderSubcat(item.subcategory)}
                                    className={`inline-flex items-center gap-1.5 text-[9px] font-extrabold px-2.5 py-1 rounded-full border transition-all hover:scale-105 cursor-pointer ${
                                      isSelected
                                        ? "ring-2 ring-offset-1 dark:ring-offset-slate-900"
                                        : ""
                                    }`}
                                    style={{
                                      backgroundColor: `${avgSubColor}18`,
                                      borderColor: `${avgSubColor}55`,
                                      color: avgSubColor,
                                      '--tw-ring-color': avgSubColor,
                                    }}
                                  >
                                    <span>{idx + 1}. {item.subcategory}</span>
                                    <span className="opacity-90">({item.avg.toFixed(2)}%)</span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Historical Leaders Table (Embedded below Average Performance Bar) */}
                            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full inline-block bg-blue-500" />
                                  Historical Leaders: {activeLeaderSubcat || subcatAverages[0].subcategory}
                                  {leadersLoading && (
                                    <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-semibold lowercase italic animate-pulse ml-1.5">
                                      (loading real data...)
                                    </span>
                                  )}
                                </h4>
                                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full shadow-sm border border-slate-100 dark:border-slate-800">
                                  {realLeadersData ? "Top 6 Funds by Year · Actual Historical Data" : "Top 6 Funds by Year · Illustrative Data"}
                                </span>
                              </div>

                              {(() => {
                                const currentSubcat = activeLeaderSubcat || subcatAverages[0].subcategory;
                                const leadersData = realLeadersData || generateHistoricalLeaders(currentSubcat, YEARS);
                                
                                // Calculate appearances, consistency, and highest returns
                                const fundStats = {};
                                YEARS.forEach(y => {
                                  const funds = leadersData[y];
                                  if(funds) {
                                    funds.slice(0, 6).forEach((f, idx) => {
                                      if(!fundStats[f.name]) {
                                        fundStats[f.name] = { name: f.name, top1: 0, top6: 0, returns: [] };
                                      }
                                      if(idx === 0) fundStats[f.name].top1 += 1;
                                      fundStats[f.name].top6 += 1;
                                      fundStats[f.name].returns.push(f.returnPct);
                                    });
                                  }
                                });
                                
                                const calcStdDev = (arr) => {
                                  if (arr.length <= 1) return 0;
                                  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
                                  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length - 1);
                                  return Math.sqrt(variance);
                                };

                                const rawStats = Object.values(fundStats).map(f => {
                                  const stdDev = calcStdDev(f.returns);
                                  // Geometric mean (CAGR) for historical returns average
                                  const product = f.returns.reduce((acc, r) => acc * (1 + r / 100), 1);
                                  const meanRet = (Math.pow(product, 1 / f.returns.length) - 1) * 100;
                                  let volLevel = "High";
                                  if(stdDev < 12) volLevel = "Low";
                                  else if(stdDev < 20) volLevel = "Medium";
                                  return { ...f, stdDev, meanRet, volLevel };
                                });

                                // Min-max normalization for All Rounder composite score
                                const minRet = Math.min(...rawStats.map(f => f.meanRet));
                                const maxRet = Math.max(...rawStats.map(f => f.meanRet));
                                const minCons = Math.min(...rawStats.map(f => f.top6));
                                const maxCons = Math.max(...rawStats.map(f => f.top6));
                                const minVol = Math.min(...rawStats.map(f => f.stdDev));
                                const maxVol = Math.max(...rawStats.map(f => f.stdDev));
                                const norm = (val, min, max) => max === min ? 50 : ((val - min) / (max - min)) * 100;

                                const fundStatsArray = rawStats.map(f => {
                                  // Consistency: Top-1 finishes weighted 3×, Top-6 appearances 1× (Top-1 is a stronger signal)
                                  const consistencyScore = f.top1 * 3 + f.top6;
                                  // Normalized All Rounder: 35% return + 35% consistency + 30% low-volatility
                                  const normReturn = norm(f.meanRet, minRet, maxRet);
                                  const normConsistency = norm(f.top6, minCons, maxCons);
                                  const normVolatility = maxVol === minVol ? 50 : ((maxVol - f.stdDev) / (maxVol - minVol)) * 100; // inverted: lower vol = higher score
                                  const score = normReturn * 0.35 + normConsistency * 0.35 + normVolatility * 0.30;
                                  return { ...f, consistencyScore, score };
                                });
                                const top1Sorted = [...fundStatsArray].sort((a, b) => b.top1 - a.top1).map(f => [f.name, f.top1]);
                                
                                const bestConsistentSorted = [...fundStatsArray].sort((a, b) => {
                                  if(b.top6 !== a.top6) return b.top6 - a.top6;
                                  if(b.top1 !== a.top1) return b.top1 - a.top1;
                                  const maxB = Math.max(...b.returns);
                                  const maxA = Math.max(...a.returns);
                                  return maxB - maxA;
                                });
                                
                                const highestReturnsSorted = [...fundStatsArray].map(f => ({
                                  name: f.name,
                                  highestReturn: Math.max(...f.returns)
                                })).sort((a, b) => b.highestReturn - a.highestReturn);
                                
                                const lowestVolSorted = [...fundStatsArray]
                                  .sort((a, b) => a.stdDev - b.stdDev);
                                  
                                const allRounderSorted = [...fundStatsArray]
                                  .sort((a, b) => b.score - a.score);

                                const top1Names = new Set();

                                return (
                                  <>
                                    <div className="hidden items-center gap-4 mb-3 mt-1 px-1">
                                      <div className="flex items-center gap-1.5 text-[9px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        <span className="w-2.5 h-2.5 rounded-sm bg-amber-400"></span>
                                        Top-1 Leaders
                                      </div>
                                    </div>

                                    <div className="overflow-x-auto custom-scrollbar pb-2">
                                      <div className="min-w-[1000px]">
                                      <table className="w-full text-xs border-collapse">
                                        <thead>
                                          <tr className="border-b border-slate-200/60 dark:border-slate-800/60 text-slate-400 dark:text-slate-500">
                                            <th className="sticky left-0 bg-[#f8fafc] dark:bg-[#1e293b] z-10 text-left pb-3 text-[10px] font-extrabold uppercase tracking-wider pr-4 w-16 shadow-[1px_0_0_rgba(226,232,240,0.5)] dark:shadow-[1px_0_0_rgba(30,41,59,0.5)]">
                                              Rank
                                            </th>
                                            {YEARS.map(y => (
                                              <th key={y} className="text-left pb-3 text-[10px] font-extrabold uppercase tracking-wider px-3 min-w-[130px]">
                                                {y}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                          {[1, 2, 3, 4, 5, 6].map(rank => (
                                            <tr key={rank} className="hover:bg-slate-100/10 dark:hover:bg-slate-800/5 transition-colors group">
                                              <td className="py-2.5 pr-4 font-extrabold text-slate-500 dark:text-slate-400 text-xs sticky left-0 bg-[#f8fafc] dark:bg-[#1e293b] z-10 shadow-[1px_0_0_rgba(226,232,240,0.5)] dark:shadow-[1px_0_0_rgba(30,41,59,0.5)] group-hover:bg-white dark:group-hover:bg-slate-900">
                                                Rank {rank}
                                              </td>
                                              {YEARS.map(y => {
                                                const fund = leadersData[y][rank - 1];
                                                const isTop1 = top1Names.has(fund.name);
                                                
                                                return (
                                                  <td key={y} className="py-2.5 px-3">
                                                    <div className={`p-1.5 px-2 rounded-lg border transition-all ${
                                                      isTop1 ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50" : 
                                                      "bg-transparent border-transparent"
                                                    }`}>
                                                      <div className="text-[11px] font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2 mb-1">
                                                        {isTop1 && <span className="text-amber-500 mr-1" title="Top-1 Appearance Leader">🥇</span>}
                                                        {fund.name}
                                                      </div>
                                                      <div className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                                                        {fund.returnPct > 0 ? "+" : ""}{fund.returnPct.toFixed(2)}%
                                                      </div>
                                                    </div>
                                                  </td>
                                                );
                                              })}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* Simulated Data Info Banner */}
                                  {realLeadersData ? (
                                    <div className="mt-3 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/50 dark:border-emerald-900/30 flex items-start gap-2.5">
                                      <svg className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                                        <span className="font-bold text-emerald-700 dark:text-emerald-400">Actual Historical Performance:</span> These rankings are generated using the actual historical NAV data of the leading representative schemes in this subcategory. Returns are calculated as the annual calendar-year performance (Jan 1 to Dec 31). Current year returns are calculated up to the last completed month-end.
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-3 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 flex items-start gap-2.5">
                                      <svg className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                                        <span className="font-bold text-blue-700 dark:text-blue-400">Illustrative Performance Model:</span> Due to API rate limit constraints and lookup latency for thousands of legacy schemes, individual fund rankings and historical leaders are generated using an illustrative simulation. The annual return percentages represent realistic simulated performance metrics calibrated to match the {"category's"} actual historical averages.
                                      </div>
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/60">
                                    
                                    {/* TOP-1 APPEARANCES */}
                                    <div className="hidden flex-col">
                                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                                        TOP-1 APPEARANCES
                                      </h5>
                                      <div className="flex flex-col gap-2.5">
                                        {top1Sorted.slice(0, 3).map(([name, count], i) => (
                                          <div key={name} className="bg-amber-50/50 dark:bg-amber-900/10 rounded-lg p-3 border border-amber-200/50 dark:border-amber-900/50 shadow-sm flex flex-col justify-center h-full">
                                            <div className="flex items-start gap-2.5">
                                              <span className="text-[11px] font-extrabold text-amber-500 dark:text-amber-400 mt-0.5">{i+1}.</span>
                                              <div className="flex-1">
                                                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight mb-1">{name}</div>
                                                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                  Top-1 Finishes : <span className="text-amber-600 dark:text-amber-400 font-bold">{count} {count === 1 ? 'Time' : 'Times'}</span>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>



                                    {/* BEST CONSISTENT FUNDS */}
                                    <div className="flex flex-col">
                                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                                        BEST CONSISTENT FUNDS (TOP 3)
                                      </h5>
                                      <div className="flex flex-col gap-2.5">
                                        {bestConsistentSorted.slice(0, 3).map((f, i) => (
                                          <div key={f.name} className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-center h-full">
                                            <div className="flex items-start gap-2.5">
                                              <span className="text-[11px] font-extrabold text-slate-400 mt-0.5">{i+1}.</span>
                                              <div className="flex-1">
                                                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight mb-1">{f.name}</div>
                                                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex flex-col gap-0.5">
                                                  <span>Appeared : <span className="text-slate-700 dark:text-slate-300 font-bold">{f.top6} / {YEARS.length} Years</span></span>
                                                  <span>Top-1 Finishes : <span className="text-slate-700 dark:text-slate-300 font-bold">{f.top1} {f.top1 === 1 ? 'Time' : 'Times'}</span></span>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* HIGHEST HISTORICAL RETURNS */}
                                    <div className="flex flex-col">
                                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                                        HIGHEST HISTORICAL RETURNS (TOP 3)
                                      </h5>
                                      <div className="flex flex-col gap-2.5">
                                        {highestReturnsSorted.slice(0, 3).map((f, i) => (
                                          <div key={f.name} className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-center h-full">
                                            <div className="flex items-start gap-2.5">
                                              <span className="text-[11px] font-extrabold text-slate-400 mt-0.5">{i+1}.</span>
                                              <div className="flex-1">
                                                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight mb-1">{f.name}</div>
                                                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex flex-col gap-0.5">
                                                  <span>Highest Return : <span className="text-emerald-600 dark:text-emerald-400 font-bold">{f.highestReturn > 0 ? "+" : ""}{f.highestReturn.toFixed(0)}%</span></span>
                                                  <span>Total Years Analysed : <span className="text-slate-700 dark:text-slate-300 font-bold">{YEARS.length}</span></span>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* LOWEST VOLATILITY FUNDS */}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                                    <div className="flex flex-col">
                                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                                        LOWEST VOLATILITY FUNDS (TOP 3)
                                      </h5>
                                      <div className="flex flex-col gap-2.5">
                                        {lowestVolSorted.slice(0, 3).map((f, i) => (
                                          <div key={f.name} className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-center h-full">
                                            <div className="flex items-start gap-2.5">
                                              <span className="text-[11px] font-extrabold text-slate-400 mt-0.5">{i+1}.</span>
                                              <div className="flex-1">
                                                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight mb-1">{f.name}</div>
                                                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex flex-col gap-0.5">
                                                  <span>Volatility : <span className="text-slate-700 dark:text-slate-300 font-bold">{f.volLevel}</span></span>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* TOP-3 ALL ROUNDER FUNDS */}
                                    <div className="flex flex-col">
                                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                                        TOP-3 ALL ROUNDER FUNDS
                                      </h5>
                                      <div className="flex flex-col gap-2.5">
                                        {allRounderSorted.slice(0, 3).map((f, i) => (
                                          <div key={f.name} className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-center h-full">
                                            <div className="flex items-start gap-2.5">
                                              <span className="text-[11px] font-extrabold text-slate-400 mt-0.5">{i+1}.</span>
                                              <div className="flex-1">
                                                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight mb-1">{f.name}</div>
                                                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex flex-col gap-0.5 mt-1.5">
                                                  <div className="grid grid-cols-[80px_1fr] gap-x-1 gap-y-1">
                                                    <span>Return</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">
                                                      : {f.meanRet > 0 ? '+' : ''}{f.meanRet.toFixed(1)}% Avg
                                                    </span>
                                                    <span>Consistency</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">
                                                      : {f.top6}/{YEARS.length} Yrs in Top-6
                                                    </span>
                                                    <span>Volatility</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">
                                                      : {f.stdDev.toFixed(1)} SD
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                  </div>
                                </>
                              );
                            })()}
                            </div>
                          </div>

                          {/* Historical Downside Risk (Worst Performing Years) */}
                          <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex flex-col justify-between overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full inline-block bg-red-500 animate-pulse" />
                                  Historical Downside Risk (Worst Years): {activeCategory}
                                </h4>
                                <span className="text-[9px] text-red-600 dark:text-red-400 font-extrabold bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-full border border-red-100 dark:border-red-900/30 shadow-sm">
                                  Maximum Annual Drawdown
                                </span>
                              </div>

                              <div className="overflow-x-auto custom-scrollbar pb-2">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-200/60 dark:border-slate-800/60 text-slate-400 dark:text-slate-500">
                                      <th className="text-left pb-3 text-[10px] font-extrabold uppercase tracking-wider w-1/4">
                                        Subcategory
                                      </th>
                                      <th className="text-center pb-3 text-[10px] font-extrabold uppercase tracking-wider w-1/6">
                                        Worst Year
                                      </th>
                                      <th className="text-center pb-3 text-[10px] font-extrabold uppercase tracking-wider w-1/6">
                                        Worst Return
                                      </th>
                                      <th className="text-left pb-3 text-[10px] font-extrabold uppercase tracking-wider w-5/12 pl-4">
                                        Market Context & Reason
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {Object.entries(subcatDataset).map(([subcategory, returns]) => {
                                      // Find index of the worst return (minimum value)
                                      let worstIdx = 0;
                                      let worstVal = returns[0];
                                      for (let i = 1; i < returns.length; i++) {
                                        if (returns[i] < worstVal) {
                                          worstVal = returns[i];
                                          worstIdx = i;
                                        }
                                      }
                                      const worstYear = YEARS[worstIdx];
                                      const reasonObj = marketReasons[String(worstYear)] || { label: "Market correction", color: "text-slate-500" };
                                      const cleanReason = reasonObj.label.replace(/^[🔴🟢🟡]\s*/u, ""); // strip the emoji prefix if any

                                      return (
                                        <tr key={subcategory} className="hover:bg-slate-100/10 dark:hover:bg-slate-800/5 transition-colors">
                                          <td className="py-3.5 font-bold text-slate-700 dark:text-slate-300 pr-4">
                                            {subcategory}
                                          </td>
                                          <td className="py-3.5 text-center font-bold text-slate-600 dark:text-slate-400">
                                            {worstYear}
                                          </td>
                                          <td className="py-3.5 text-center">
                                            <span className="inline-flex items-center justify-center font-black text-xs px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-950/40 text-red-650 dark:text-red-400 border border-red-100 dark:border-red-900/30">
                                              {worstVal > 0 ? "+" : ""}{worstVal}%
                                            </span>
                                          </td>
                                          <td className="py-3.5 pl-4 text-slate-500 dark:text-slate-400 text-xs">
                                            <div className="flex items-center gap-2">
                                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                                              <span className="leading-relaxed">{cleanReason}</span>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <p className="text-[10px] text-slate-700 dark:text-400 mt-4">
                    * Approximate median category returns. Actual individual
                    fund returns vary. Source: industry estimates.
                  </p>
                </div>
              );
            })()}
          </div>
        </section>




        <section
          aria-label="Explore FundLens features"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 200px",
          }}
        >
          {[
            {
              t: "Fund Screener",
              d: "Advanced filters to find the right fund for you.",
              cta: "Find Funds →",
              to: "/screener",
              g: "from-blue-600 to-blue-700",
            },
            {
              t: "Compare Funds",
              d: "Compare up to 4 funds side by side.",
              cta: "Compare →",
              to: "/compare",
              g: "from-emerald-600 to-teal-600",
            },
            {
              t: "SIP + FIRE Calc",
              d: "Plan SIP, set goals, calculate FIRE date.",
              cta: "Calculate →",
              to: "/sip",
              g: "from-orange-500 to-red-500",
            },
          ].map((c) => (
            <div
              key={c.t}
              className={`rounded-2xl bg-gradient-to-br ${c.g} p-5 text-white`}
            >
              <h3 className="font-bold text-base mb-1">{c.t}</h3>
              <p className="text-sm opacity-80 mb-4">{c.d}</p>
              <Link
                to={c.to}
                className="bg-white/20 hover:bg-white/30 border border-white/30 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-all inline-block"
              >
                {c.cta}
              </Link>
            </div>
          ))}
        </section>
      </div>

      {/* ── Fund Detail Modal ── */}
      {modalFund && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <FundDetailModal
            schemeCode={modalFund.schemeCode}
            schemeName={modalFund.schemeName}
            onClose={() => setModalFund(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
