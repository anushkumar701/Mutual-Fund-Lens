// pages/Portfolio.jsx
import { useState, useEffect, useMemo, useRef, Fragment, lazy, Suspense } from "react";
import { useFunds, fetchFundDetail } from "../hooks/useFunds";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDebounce } from "../hooks/useDebounce";
import { useToast } from "../components/Toast";
import { formatCurrencyINR } from "../utils/formatCurrency";
import { syncPortfolioWidget } from "../utils/portfolioWidget";
import {
  calcStampDuty,
  UNIT_PRECISION,
  CAGR_MIN_YEARS,
  STORAGE_KEYS,
  loadAndMigrateHoldings,
} from "../config/financial";
import { calculateTrueXIRR } from "../utils/metrics";
import { inferCategory } from "../utils/goalFilters";

const PortfolioCharts = lazy(() => import("../components/PortfolioCharts"));

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

/**
 * getNavOnDate — returns the NAV applicable on the given date.
 *
 * Indian mutual fund convention: the applicable NAV is the one last declared
 * ON OR BEFORE the investment date (floor).
 * e.g. investing on a Saturday → Friday's NAV is used (not Monday's).
 *
 * sortedNavs: array sorted ascending by `ts` (oldest → newest)
 * targetTs:   UTC midnight timestamp for the investment date
 */
const getNavOnDate = (sortedNavs, targetTs) => {
  if (!sortedNavs || sortedNavs.length === 0) return 0;

  const oldest = sortedNavs[0];
  const latest = sortedNavs[sortedNavs.length - 1];

  // Before fund inception — use oldest available NAV
  if (targetTs <= oldest.ts) return oldest.nav;
  // After latest data — use latest NAV
  if (targetTs >= latest.ts) return latest.nav;

  // Binary search for the last entry whose ts <= targetTs (floor)
  let lo = 0;
  let hi = sortedNavs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1; // upper-mid to bias toward right (floor)
    if (sortedNavs[mid].ts <= targetTs) lo = mid;
    else hi = mid - 1;
  }
  return sortedNavs[lo].nav;
};

// Calculate NAV for purchases using a floor search (units-allocated-date convention).
// The allocated date always corresponds to a real trading day, so we simply find
// the exact NAV on that date (or the closest prior date if unavailable).
const getPurchaseNavOnDate = (sortedNavs, dateStr) => {
  if (!sortedNavs || sortedNavs.length === 0) return 0;
  const [year, month, day] = dateStr.split("-").map(Number);
  const targetTs = Date.UTC(year, month - 1, day);
  // Delegate to the standard floor search
  return getNavOnDate(sortedNavs, targetTs);
};

// Stamp duty is now sourced from the centralized financial config.
// To update the rate when SEBI changes it, edit src/config/financial.js only.
const calculateStampDuty = calcStampDuty;

export default function Portfolio() {
  const addToast = useToast();
  const { funds, loading: listLoading } = useFunds();

  // Portfolio items in LocalStorage — run schema migration on every load
  // so old saved data is automatically upgraded to the current shape.
  const [holdings, setHoldingsRaw] = useLocalStorage(STORAGE_KEYS.HOLDINGS, []);
  const holdings_migrated = useMemo(() => loadAndMigrateHoldings(holdings), [holdings]);
  // Expose migrated version downstream; writes still go through setHoldingsRaw
  const setHoldings = setHoldingsRaw;
  // Use migrated holdings throughout the component
  const holdingsSafe = holdings_migrated;
  
  // Notification Preferences
  const [notifyConfig, setNotifyConfig] = useLocalStorage(STORAGE_KEYS.NOTIFY_CONFIG, {
    enabled: false,
    type: "total",
    time: "evening",
  });

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone ||
      localStorage.getItem("fundlens_pwa_installed") === "1" ||
      !!window.Capacitor
    );
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      localStorage.setItem("fundlens_pwa_installed", "1");
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        localStorage.setItem("fundlens_pwa_installed", "1");
        setIsAppInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      addToast("To install: Tap your browser menu or Share icon, then select 'Add to Home Screen' or 'Install App'.", "info");
    }
  };

  // Cached fund details (NAV list, current price) moved to IndexedDB (5-10MB limit safe)
  const [detailsCache, setDetailsCache] = useState({});
  const [detailsCacheLoaded, setDetailsCacheLoaded] = useState(false);
  
  // Mirror detailsCache in a ref so effects can read the current value
  // without needing it in their dependency arrays (avoids stale-closure bugs).
  const detailsCacheRef = useRef(detailsCache);

  useEffect(() => {
    const loadCache = async () => {
      try {
        const { get } = await import("idb-keyval");
        const saved = await get("fundlens_portfolio_details_cache");
        const savedTs = await get("fundlens_portfolio_details_cache_ts");
        if (saved && savedTs) {
          const ageHours = (Date.now() - parseInt(savedTs, 10)) / (1000 * 60 * 60);
          // Invalidate cache if older than 12 hours (aligns roughly with AMFI daily updates)
          if (ageHours < 12) {
            setDetailsCache(saved);
            detailsCacheRef.current = saved;
          }
        }
      } catch (e) {
        console.warn("Failed to load details cache from IndexedDB:", e);
      } finally {
        setDetailsCacheLoaded(true);
      }
    };
    loadCache();
  }, []);

  useEffect(() => {
    if (!detailsCacheLoaded) return;
    const saveCache = async () => {
      try {
        if (Object.keys(detailsCache).length > 0) {
          const { set } = await import("idb-keyval");
          await set("fundlens_portfolio_details_cache", detailsCache);
          await set("fundlens_portfolio_details_cache_ts", Date.now().toString());
        }
      } catch (e) {
        console.warn("Failed to save details cache to IndexedDB:", e);
      }
    };
    saveCache();
  }, [detailsCache, detailsCacheLoaded]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [editNavLoading, setEditNavLoading] = useState(false);
  const [failedPortfolioCodes, setFailedPortfolioCodes] = useState(new Set());

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
    STORAGE_KEYS.FILTER_DIRECT,
    true
  );
  const [filterGrowthOnly, setFilterGrowthOnly] = useLocalStorage(
    STORAGE_KEYS.FILTER_GROWTH,
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
  const [chartRange, setChartRange] = useState("all");
  const [viewMode, setViewMode] = useState("fund"); // "fund" or "transaction"
  const [expandedFunds, setExpandedFunds] = useState({});
  const toggleFundExpand = (code) => {
    setExpandedFunds((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };



  // Load details for all holdings when they mount or change.
  // Uses holdingsSafe (schema-migrated) so stale/corrupt entries never hit the API.
  useEffect(() => {
    if (!detailsCacheLoaded || holdingsSafe.length === 0) return;
    
    let isMounted = true;
    const fetchAllDetails = async () => {
      setDetailsLoading(true);

      // Read current cache from ref — avoids the setState read anti-pattern
      const currentCache = detailsCacheRef.current;

      // Deduplicate: only fetch scheme codes we haven't loaded yet
      const seenCodes = new Set();
      const neededHoldings = holdingsSafe.filter(h => {
        const isManual = typeof h.schemeCode === "string" && h.schemeCode.startsWith("manual-");
        if (isManual) return false;
        if (seenCodes.has(h.schemeCode)) return false;
        seenCodes.add(h.schemeCode);
        return !currentCache[h.schemeCode];
      });

      if (neededHoldings.length === 0) {
        setDetailsLoading(false);
        return;
      }

      const fetchPromises = neededHoldings.map(async (h) => {
        try {
          const data = await fetchFundDetail(h.schemeCode);
          if (data) {
            setFailedPortfolioCodes((prev) => {
              const next = new Set(prev);
              next.delete(h.schemeCode);
              return next;
            });
            return { code: h.schemeCode, data: { ...data, sortedNavs: processNavData(data) } };
          }
        } catch (err) {
          console.error(`Failed to load details for ${h.schemeCode}:`, err);
          setFailedPortfolioCodes((prev) => {
            const next = new Set(prev);
            next.add(h.schemeCode);
            return next;
          });
        }
        return null;
      });

      const results = await Promise.all(fetchPromises);
      if (!isMounted) return;

      setDetailsCache(prev => {
        const next = { ...prev };
        let updated = false;
        results.forEach(res => {
          if (res) { next[res.code] = res.data; updated = true; }
        });
        const resolved = updated ? next : prev;
        // Keep ref in sync with state
        detailsCacheRef.current = resolved;
        return resolved;
      });

      setDetailsLoading(false);
    };

    fetchAllDetails();
    return () => {
      isMounted = false;
    };
  }, [holdingsSafe]);

  // Autocomplete fund matching
  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2 || !funds) return [];
    const q = debouncedQuery.trim().toLowerCase();
    const matches = funds.filter((f) => {
      const name = f.schemeName.toLowerCase();
      if (filterDirectOnly && !name.includes("direct")) return false;
      if (
        filterGrowthOnly &&
        (name.includes("idcw") || name.includes("dividend"))
      )
        return false;
      return (
        name.includes(q) ||
        f.schemeCode.toString().includes(q)
      );
    });

    const scoredMatches = matches.map((f) => {
      const name = f.schemeName.toLowerCase();
      const code = f.schemeCode.toString();

      let score = 0;
      if (code === q) {
        score = 1000;
      } else if (name.startsWith(q)) {
        score = 500 - name.length;
      } else {
        const index = name.indexOf(q);
        score = 100 - index - name.length;
      }

      return { fund: f, score };
    });

    return scoredMatches
      .sort((a, b) => b.score - a.score)
      .map((item) => item.fund)
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

  useEffect(() => {
    if (!selectedFund || manualOverride) {
      setNavLoading(false);
      return;
    }

    let cancelled = false;
    setCustomNav("");
    setNavLoading(true);
    const getNAV = async () => {
      try {
        const details = await fetchFundDetail(selectedFund.schemeCode);
        if (cancelled) return;
        if (details?.data) {
          const sorted = processNavData(details);
          const buyNav = getPurchaseNavOnDate(sorted, investDate);
          setCustomNav(buyNav.toFixed(5));
        }
      } catch (err) {
        console.warn("Failed to lookup historical NAV:", err);
      } finally {
        if (!cancelled) setNavLoading(false);
      }
    };
    getNAV();
    return () => { cancelled = true; };
  // manualOverride change alone should NOT re-trigger this fetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFund, investDate]);

  // Auto-calculate units when amount or NAV changes
  useEffect(() => {
    if (manualOverride) return;
    if (amount && customNav && !isNaN(amount) && !isNaN(customNav)) {
      const parsedAmount = parseFloat(amount);
      const parsedNav = parseFloat(customNav);
      if (parsedNav > 0) {
        const sDuty = calculateStampDuty(parsedAmount, investDate);
        const netAmt = parsedAmount - sDuty;
        setCustomUnits((netAmt / parsedNav).toFixed(UNIT_PRECISION));
      }
    } else {
      setCustomUnits("");
    }
  }, [amount, customNav, investDate, manualOverride]);

  useEffect(() => {
    if (!editingHolding || editManualOverride) {
      setEditNavLoading(false);
      return;
    }
    if (typeof editingHolding.schemeCode === "string" && editingHolding.schemeCode.startsWith("manual-")) {
      setEditNavLoading(false);
      return;
    }

    let cancelled = false;
    setEditCustomNav("");
    setEditNavLoading(true);
    const getNAV = async () => {
      try {
        const details = await fetchFundDetail(editingHolding.schemeCode);
        if (cancelled) return;
        if (details?.data) {
          const sorted = processNavData(details);
          const buyNav = getPurchaseNavOnDate(sorted, editInvestDate);
          setEditCustomNav(buyNav.toFixed(5));
        }
      } catch (err) {
        console.warn("Failed to lookup historical NAV for edit:", err);
      } finally {
        if (!cancelled) setEditNavLoading(false);
      }
    };
    getNAV();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingHolding, editInvestDate]);

  // Auto-calculate edit units when amount or NAV changes
  useEffect(() => {
    if (editManualOverride) return;
    if (editAmount && editCustomNav && !isNaN(editAmount) && !isNaN(editCustomNav)) {
      const parsedAmount = parseFloat(editAmount);
      const parsedNav = parseFloat(editCustomNav);
      if (parsedNav > 0) {
        const sDuty = calculateStampDuty(parsedAmount, editInvestDate);
        const netAmt = parsedAmount - sDuty;
        setEditCustomUnits((netAmt / parsedNav).toFixed(UNIT_PRECISION));
      }
    } else {
      setEditCustomUnits("");
    }
  }, [editAmount, editCustomNav, editInvestDate, editManualOverride]);

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
    
    // Reset only amount/nav/units — keep fund and date so the user
    // can quickly add another transaction for the same fund
    setAmount("");
    setCustomNav("");
    setCustomUnits("");
    setManualOverride(false);
    // Do NOT close the form — let the user add more transactions
    // setShowAddForm(false);  ← intentionally removed

    // Show notification permission prompt if enabled is off and permission is default
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      requestNotificationPermission();
    }
  };

   const requestNotificationPermission = async () => {
    if (window.Capacitor) {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display === "granted") {
          setNotifyConfig((prev) => ({ ...prev, enabled: true }));
          addToast("Daily notifications enabled!", "success");
        } else {
          addToast("Notification permission denied.", "warning");
        }
        return;
      } catch (err) {
        console.error("Capacitor notification permission request failed:", err);
        addToast("Failed to request notification permission.", "error");
        return;
      }
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      addToast("Notifications are not supported by this browser. On iOS, you must first 'Add to Home Screen' (Install).", "warning");
      return;
    }
    try {
      // Modern Promise-based request
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setNotifyConfig((prev) => ({ ...prev, enabled: true }));
        addToast("Daily notifications enabled!", "success");
      } else {
        addToast("Notification permission denied by browser.", "warning");
      }
    } catch (err) {
      console.warn("Promise-based notification request failed, trying callback fallback:", err);
      // Fallback for older Safari/WebKit browsers using callbacks
      try {
        Notification.requestPermission((permission) => {
          if (permission === "granted") {
            setNotifyConfig((prev) => ({ ...prev, enabled: true }));
            addToast("Daily notifications enabled!", "success");
          } else {
            addToast("Notification permission denied by browser.", "warning");
          }
        });
      } catch (innerErr) {
        console.error("Callback-based notification request failed:", innerErr);
        addToast("Failed to request notification permission.", "error");
      }
    }
  };

  const handleNotificationToggle = () => {
    if (!window.Capacitor) {
      if (typeof window === "undefined" || !("Notification" in window)) {
        addToast("Notifications are not supported by this browser. On iOS, you must first 'Add to Home Screen' (Install).", "warning");
        return;
      }
      if (Notification.permission === "denied") {
        addToast("Notification permission is blocked. Please reset permissions in your browser settings.", "warning");
        return;
      }
    }
    if (!notifyConfig.enabled) {
      requestNotificationPermission();
    } else {
      setNotifyConfig((prev) => ({ ...prev, enabled: false }));
      addToast("Notifications disabled.", "info");
    }
  };

  const triggerTestNotification = async () => {
    if (!window.Capacitor) {
      if (typeof window === "undefined" || !("Notification" in window)) {
        addToast("Notifications are not supported by this browser.", "warning");
        return;
      }

      if (Notification.permission !== "granted") {
        addToast("Please enable notifications in your browser first.", "warning");
        return;
      }
    }

    const totalVal = portfolioSummary.totalCurrent;
    const holdingsCount = portfolioSummary.holdings.length;

    const showNotification = async (title, options) => {
      if (window.Capacitor) {
        try {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          await LocalNotifications.schedule({
            notifications: [
              {
                title: title,
                body: options?.body || "Portfolio Valuation Update",
                id: Math.floor(Math.random() * 100000),
                extra: null,
              },
            ],
          });
          return;
        } catch (e) {
          console.warn("Capacitor LocalNotifications failed: ", e);
        }
      }

      let shown = false;
      if ("serviceWorker" in navigator) {
        try {
          const swReady = navigator.serviceWorker.ready;
          const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 800));
          const reg = await Promise.race([swReady, timeout]);
          if (reg && "showNotification" in reg) {
            await reg.showNotification(title, options);
            shown = true;
          }
        } catch (e) {
          console.warn("SW showNotification failed:", e);
        }
      }
      if (!shown) {
        try {
          new Notification(title, options);
        } catch (e) {
          console.error("Notification constructor failed:", e);
        }
      }
    };

    if (notifyConfig.type === "total") {
      const valStr = holdingsCount > 0 ? formatCurrencyINR(totalVal) : "₹1,24,532.80";

      await showNotification(`Portfolio: ${valStr}`, {
        icon: "/favicon.svg",
        tag: "fundlens-portfolio-daily-total-test",
      });
      addToast("Test notification sent!", "success");
    } else {
      if (holdingsCount === 0) {
        await showNotification("Parag Parikh Flexi Cap Fund", {
          body: "Current Value: ₹50,710.00",
          icon: "/favicon.svg",
          tag: "fundlens-fund-detail-test-mock",
        });
        addToast("Demo test notification sent!", "success");
      } else {
        for (let index = 0; index < consolidatedHoldings.length; index++) {
          const item = consolidatedHoldings[index];
          await showNotification(item.schemeName, {
            body: `Current Value: ${formatCurrencyINR(item.currentValue)}`,
            icon: "/favicon.svg",
            tag: `fundlens-fund-detail-${index}-test`,
          });
        }
        addToast(`Sent test notification for ${consolidatedHoldings.length} fund(s)!`, "success");
      }
    }
  };

  const get12HourParts = (timeStr) => {
    if (!timeStr || !timeStr.includes(":")) {
      return { hour: 10, minute: "00", ampm: "AM" };
    }
    const [h24Str, mStr] = timeStr.split(":");
    const h24 = parseInt(h24Str, 10) || 0;
    const minute = mStr || "00";
    let hour = h24 % 12;
    if (hour === 0) hour = 12;
    const ampm = h24 >= 12 ? "PM" : "AM";
    return { hour, minute, ampm };
  };

  const handleTimePartChange = (part, value) => {
    const { hour, minute, ampm } = get12HourParts(notifyConfig.time);
    let newHour = part === "hour" ? parseInt(value, 10) : hour;
    let newMinute = part === "minute" ? value : minute;
    let newAmpm = part === "ampm" ? value : ampm;
    let h24 = newHour % 12;
    if (newAmpm === "PM") h24 += 12;
    const h24Str = String(h24).padStart(2, "0");
    setNotifyConfig((prev) => ({ ...prev, time: `${h24Str}:${newMinute}` }));
  };

  // Compute live portfolio metrics from schema-migrated holdings
  const portfolioSummary = useMemo(() => {
    let totalInvested = 0;
    let totalCurrent = 0;
    let totalDailyChange = 0;

    const holdingRows = holdingsSafe.map((h) => {
      const details = detailsCache[h.schemeCode];
      const currentNav = details?.data?.[0]?.nav ? parseFloat(details.data[0].nav) : h.buyNav;
      const prevNav = details?.data?.[1]?.nav ? parseFloat(details.data[1].nav) : currentNav;
      
      const investedValue = h.amount;
      const currentValue = h.units * currentNav;
      const gainLoss = currentValue - investedValue;
      const gainLossPct = investedValue > 0 ? (gainLoss / investedValue) * 100 : 0;
      
      const dailyChange = h.units * (currentNav - prevNav);
      const dailyChangePct = prevNav > 0 ? ((currentNav - prevNav) / prevNav) * 100 : 0;

      totalInvested += investedValue;
      totalCurrent += currentValue;
      totalDailyChange += dailyChange;

      // Calculate CAGR — only meaningful after CAGR_MIN_YEARS holding period
      const buyTime = new Date(h.investedDate).getTime();
      const todayTime = Date.now();
      const years = (todayTime - buyTime) / (1000 * 60 * 60 * 24 * 365.25);
      const cagr = years >= CAGR_MIN_YEARS
        ? (Math.pow(currentValue / investedValue, 1 / years) - 1) * 100
        : null;

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

    // Calculate overall portfolio XIRR
    const cashflows = [];
    holdingRows.forEach(h => {
      if (h.amount > 0) {
        cashflows.push({ amount: -h.amount, when: new Date(h.investedDate) });
      }
    });
    if (totalCurrent > 0) {
      cashflows.push({ amount: totalCurrent, when: new Date() });
    }
    const portfolioXirr = calculateTrueXIRR(cashflows);

    return {
      totalInvested,
      totalCurrent,
      totalGainLoss,
      totalGainLossPct,
      totalDailyChange,
      totalDailyChangePct,
      xirr: portfolioXirr,
      holdings: holdingRows,
    };
  }, [holdingsSafe, detailsCache]);

  const consolidatedHoldings = useMemo(() => {
    const groups = {};
    portfolioSummary.holdings.forEach((h) => {
      if (!groups[h.schemeCode]) {
        groups[h.schemeCode] = {
          schemeCode: h.schemeCode,
          schemeName: h.schemeName,
          totalInvested: 0,
          totalUnits: 0,
          currentNav: h.currentNav,
          dailyChange: 0,
          transactions: [],
        };
      }
      const g = groups[h.schemeCode];
      g.totalInvested += h.amount;
      g.totalUnits += h.units;
      g.dailyChange += h.dailyChange;
      g.transactions.push(h);
    });

    return Object.values(groups).map((g) => {
      // Sort transactions by date descending so latest purchase is first
      g.transactions.sort((a, b) => new Date(b.investedDate).getTime() - new Date(a.investedDate).getTime());
      
      const currentValue = g.totalUnits * g.currentNav;
      const gainLoss = currentValue - g.totalInvested;
      const gainLossPct = g.totalInvested > 0 ? (gainLoss / g.totalInvested) * 100 : 0;
      const avgBuyNav = g.totalUnits > 0 ? g.totalInvested / g.totalUnits : 0;
      const dailyChangePct = (currentValue - g.dailyChange) > 0
        ? (g.dailyChange / (currentValue - g.dailyChange)) * 100
        : 0;

      // Calculate fund-level XIRR
      const cashflows = [];
      g.transactions.forEach(t => {
        if (t.amount > 0) {
          cashflows.push({ amount: -t.amount, when: new Date(t.investedDate) });
        }
      });
      if (currentValue > 0) {
        cashflows.push({ amount: currentValue, when: new Date() });
      }
      const fundXirr = calculateTrueXIRR(cashflows);

      return {
        ...g,
        currentValue,
        gainLoss,
        gainLossPct,
        avgBuyNav,
        dailyChangePct,
        xirr: fundXirr,
      };
    }).sort((a, b) => b.currentValue - a.currentValue);
  }, [portfolioSummary.holdings]);

  // Update cached total portfolio value in localStorage for Navbar and Dashboard usage
  useEffect(() => {
    if (holdingsSafe.length === 0) {
      localStorage.setItem(STORAGE_KEYS.TOTAL_VALUE, "0");
      return;
    }

    const hasAnyApiHolding = holdingsSafe.some(
      (h) => !(typeof h.schemeCode === "string" && h.schemeCode.startsWith("manual-"))
    );
    const hasLoadedAllApiHoldings = holdingsSafe.every((h) => {
      const isManual = typeof h.schemeCode === "string" && h.schemeCode.startsWith("manual-");
      return isManual || detailsCache[h.schemeCode]?.data?.[0]?.nav;
    });

    if (!hasAnyApiHolding || hasLoadedAllApiHoldings) {
      if (portfolioSummary.totalCurrent > 0) {
        localStorage.setItem(STORAGE_KEYS.TOTAL_VALUE, String(portfolioSummary.totalCurrent));

        // Sync data to the Android home screen widget (safe no-op on web/PWA)
        syncPortfolioWidget({
          totalCurrent:   portfolioSummary.totalCurrent,
          totalInvested:  portfolioSummary.totalInvested,
          dailyChange:    portfolioSummary.totalDailyChange,
          dailyChangePct: portfolioSummary.totalDailyChangePct,
          holdings:       holdingsSafe,
          notifyEnabled:  notifyConfig?.enabled === true,
        });
      }
    }
  }, [portfolioSummary.totalCurrent, portfolioSummary.totalInvested, portfolioSummary.totalDailyChange, portfolioSummary.totalDailyChangePct, holdingsSafe, detailsCache, notifyConfig?.enabled]);

  // Reconstruct portfolio valuation chart data over time
  const historicalChartData = useMemo(() => {
    if (holdingsSafe.length === 0) return [];
    const allLoaded = holdingsSafe.every((h) => {
      const isManual = typeof h.schemeCode === "string" && h.schemeCode.startsWith("manual-");
      return isManual || failedPortfolioCodes.has(h.schemeCode) || detailsCache[h.schemeCode]?.sortedNavs;
    });
    if (!allLoaded) return [];
    return generateHistoricalData(holdingsSafe, detailsCache, failedPortfolioCodes);
  }, [holdingsSafe, detailsCache, failedPortfolioCodes]);

  // Filter historical growth data by time range
  const filteredChartData = useMemo(() => {
    if (chartRange === "all" || historicalChartData.length === 0) return historicalChartData;
    
    const cutoffDate = new Date();
    if (chartRange === "30d") cutoffDate.setDate(cutoffDate.getDate() - 30);
    else if (chartRange === "90d") cutoffDate.setDate(cutoffDate.getDate() - 90);
    else if (chartRange === "180d") cutoffDate.setDate(cutoffDate.getDate() - 180);
    else if (chartRange === "365d") cutoffDate.setDate(cutoffDate.getDate() - 365);

    const cutoffTs = cutoffDate.getTime();
    return historicalChartData.filter((item) => item.timestamp >= cutoffTs);
  }, [historicalChartData, chartRange]);

  // Pie chart data for fund weight allocation (grouped by scheme name).
  // Depends on portfolioSummary.holdings, not the whole object, to avoid
  // spurious re-renders when unrelated summary fields change.
  const pieChartData = useMemo(() => {
    if (portfolioSummary.totalCurrent === 0) return [];
    const groups = {};
    portfolioSummary.holdings.forEach((h) => {
      const displayName = h.schemeName.length > 25 ? h.schemeName.slice(0, 25) + "..." : h.schemeName;
      groups[displayName] = (groups[displayName] || 0) + h.currentValue;
    });
    return Object.entries(groups).map(([name, value]) => ({ name, value }));
  }, [portfolioSummary.holdings, portfolioSummary.totalCurrent]);

  const overlapWarnings = useMemo(() => {
    if (!consolidatedHoldings || consolidatedHoldings.length < 2) return [];
    
    // Quick local subcat inferrer for overlap check
    const localGetSubCat = (name) => {
      const n = name.toLowerCase();
      if (n.includes("small") && n.includes("cap")) return "Small Cap";
      if (n.includes("mid") && n.includes("cap")) return "Mid Cap";
      if (n.includes("large") && n.includes("cap")) return "Large Cap";
      if (n.includes("flexi") && n.includes("cap")) return "Flexi Cap";
      if (n.includes("multi") && n.includes("cap")) return "Multi Cap";
      if (n.includes("elss") || n.includes("tax saver")) return "ELSS";
      if (n.includes("value") || n.includes("contra")) return "Value/Contra";
      if (n.includes("focused")) return "Focused";
      if (n.includes("sector") || n.includes("thematic") || n.includes("pharma") || n.includes("tech") || n.includes("auto") || n.includes("infra") || n.includes("financial") || n.includes("bank")) return "Sector/Thematic";
      if (n.includes("index") || n.includes("nifty") || n.includes("sensex")) return "Index";
      return "Other";
    };

    const subcats = {};
    consolidatedHoldings.forEach(c => {
      const cat = inferCategory(c.schemeName);
      if (cat !== 'Equity') return; 
      const sc = localGetSubCat(c.schemeName);
      if (sc && sc !== 'Other') {
        if (!subcats[sc]) subcats[sc] = [];
        subcats[sc].push(c);
      }
    });

    const warnings = [];
    for (const [sc, funds] of Object.entries(subcats)) {
      if (funds.length > 1) {
        warnings.push({
          subCat: sc,
          count: funds.length,
          funds: funds.map(f => f.schemeName)
        });
      }
    }
    return warnings;
  }, [consolidatedHoldings]);

  // Export holdings as a JSON file — revoke URL after click to prevent memory leak
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
    URL.revokeObjectURL(url);
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

        // Run schema migration on imported data — handles old backup formats automatically.
        // Corrupt/missing records are silently dropped by migrateHolding.
        const migrated = loadAndMigrateHoldings(imported);
        if (migrated.length === 0) throw new Error("No valid holdings found after migration");

        setHoldings(migrated);
        const dropped = imported.length - migrated.length;
        const msg = dropped > 0
          ? `Imported ${migrated.length} holdings (${dropped} skipped — corrupt format).`
          : `Successfully imported ${migrated.length} holdings!`;
        addToast(msg, "success");
      } catch (err) {
        addToast(`Failed to parse backup: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset input
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-slate-900 dark:text-slate-100">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mutual Fund Portfolio</h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Current Portfolio Value</span>
              <div className="text-2xl font-black mt-1.5">{formatCurrencyINR(portfolioSummary.totalCurrent)}</div>
              <div className="mt-2 text-xs font-medium text-slate-400">Live Valuation</div>
            </div>

            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Invested</span>
              <div className="text-2xl font-black mt-1.5">{formatCurrencyINR(portfolioSummary.totalInvested)}</div>
              <div className="mt-2 text-xs font-medium text-slate-400">Total Capital Deployed</div>
            </div>

            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Gain / Loss</span>
              <div className={`text-2xl font-black mt-1.5 ${portfolioSummary.totalGainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.totalGainLoss >= 0 ? "+" : ""}
                {formatCurrencyINR(portfolioSummary.totalGainLoss)}
              </div>
              <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${portfolioSummary.totalGainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.totalGainLoss >= 0 ? "▲" : "▼"}{" "}
                {portfolioSummary.totalGainLossPct.toFixed(2)}%
                <span className="text-slate-400 font-normal">(Absolute)</span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Actual Return (XIRR)</span>
              <div className={`text-2xl font-black mt-1.5 ${portfolioSummary.xirr === null ? "text-slate-600 dark:text-slate-400" : portfolioSummary.xirr >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.xirr !== null ? `${portfolioSummary.xirr >= 0 ? "+" : ""}${portfolioSummary.xirr.toFixed(2)}%` : "N/A"}
              </div>
              <div className="mt-2 text-xs font-bold text-slate-400 flex items-center gap-1">
                Annualized Yield
              </div>
            </div>

            <div className="bg-white dark:bg-[#111622] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Today&apos;s Returns</span>
              <div className={`text-2xl font-black mt-1.5 ${portfolioSummary.totalDailyChange >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.totalDailyChange >= 0 ? "+" : ""}
                {formatCurrencyINR(portfolioSummary.totalDailyChange)}
              </div>
              <div className={`mt-2 text-xs font-bold flex items-center gap-1 ${portfolioSummary.totalDailyChange >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {portfolioSummary.totalDailyChange >= 0 ? "▲" : "▼"}{" "}
                {portfolioSummary.totalDailyChangePct.toFixed(2)}%
                <span className="text-slate-400 font-normal">(Daily)</span>
              </div>
            </div>
          </div>

          {/* Charts Row — lazy-loaded so empty portfolio avoids ~400KB recharts bundle */}
          <Suspense
            fallback={
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 min-h-[350px] rounded-2xl skeleton" />
                <div className="min-h-[350px] rounded-2xl skeleton" />
              </div>
            }
          >
            <PortfolioCharts
              chartRange={chartRange}
              setChartRange={setChartRange}
              detailsLoading={detailsLoading}
              filteredChartData={filteredChartData}
              pieChartData={pieChartData}
              totalCurrent={portfolioSummary.totalCurrent}
            />
          </Suspense>

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
              
              <div className="flex items-center gap-2">
                {!isAppInstalled && (
                  <button
                    onClick={handleInstallApp}
                    className="px-4 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 active:scale-95 transition-all"
                  >
                    📥 Install App
                  </button>
                )}
                {notifyConfig.enabled && (
                  <button
                    onClick={triggerTestNotification}
                    className="px-4 py-2 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/40 active:scale-95 transition-all"
                  >
                    🔔 Test Notification
                  </button>
                )}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Invested Holdings ({consolidatedHoldings.length} Funds)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {portfolioSummary.holdings.length} total transactions
                </p>
              </div>

              {/* View Toggle */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setViewMode("fund")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === "fund"
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  📁 Fund-wise View
                </button>
                <button
                  onClick={() => setViewMode("transaction")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === "transaction"
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  📝 Transaction View
                </button>
              </div>
            </div>
            
            {viewMode === "fund" ? (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800/60 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      <th className="px-5 py-3 w-[30%]">Mutual Fund</th>
                      <th className="px-5 py-3 text-right">Invested Amount</th>
                      <th className="px-5 py-3 text-right">Current Value</th>
                      <th className="px-5 py-3 text-right">Total Profit / Loss</th>
                      <th className="px-5 py-3 text-right">XIRR</th>
                      <th className="px-5 py-3 text-right">Units Held</th>
                      <th className="px-5 py-3 text-right">Avg Buy NAV</th>
                      <th className="px-5 py-3 text-right">Current NAV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/30 text-sm">
                    {consolidatedHoldings.map((c) => {
                      const isExpanded = !!expandedFunds[c.schemeCode];
                      return (
                        <Fragment key={c.schemeCode}>
                          {/* Consolidated Main Row */}
                          <tr 
                            onClick={() => toggleFundExpand(c.schemeCode)}
                            className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 cursor-pointer transition-colors group"
                          >
                            <td className="px-5 py-4 font-bold">
                              <div className="flex items-start gap-2">
                                <span className="text-slate-400 transition-transform mt-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                                  {isExpanded ? "▼" : "▶"}
                                </span>
                                <div className="truncate text-slate-800 dark:text-slate-200 max-w-[280px]" title={c.schemeName}>
                                  {c.schemeName}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 ml-5 text-[10px] font-semibold text-slate-400">
                                <span className="font-mono">Code: {c.schemeCode}</span>
                                <span>•</span>
                                <span className="text-blue-500">{c.transactions.length} purchase{c.transactions.length > 1 ? "s" : ""}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right font-bold text-slate-800 dark:text-slate-200">
                              {formatCurrencyINR(c.totalInvested)}
                            </td>
                            <td className="px-5 py-4 text-right font-bold text-slate-800 dark:text-slate-200">
                              {formatCurrencyINR(c.currentValue)}
                            </td>
                            <td className="px-5 py-4 text-right font-bold">
                              <span className={c.gainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}>
                                {c.gainLoss >= 0 ? "+" : ""}
                                {formatCurrencyINR(c.gainLoss)}
                              </span>
                              <div className={`text-[10px] font-bold mt-1 ${c.gainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                {c.gainLoss >= 0 ? "▲" : "▼"} {c.gainLossPct.toFixed(2)}%
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right font-bold text-slate-700 dark:text-slate-300">
                              <span className={c.xirr === null ? "text-slate-500" : c.xirr >= 0 ? "text-emerald-500" : "text-rose-500"}>
                                {c.xirr !== null ? `${c.xirr >= 0 ? "+" : ""}${c.xirr.toFixed(1)}%` : "N/A"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                              {c.totalUnits.toFixed(4)}
                            </td>
                            <td className="px-5 py-4 text-right font-mono text-slate-600 dark:text-slate-400">
                              ₹{c.avgBuyNav.toFixed(4)}
                            </td>
                            <td className="px-5 py-4 text-right font-mono text-slate-700 dark:text-slate-300">
                              ₹{c.currentNav.toFixed(4)}
                            </td>
                          </tr>

                          {/* Expanded Transactions Subtable */}
                          {isExpanded && (
                            <tr className="bg-slate-50/40 dark:bg-slate-900/10">
                              <td colSpan="7" className="px-6 py-4">
                                <div className="border-l-2 border-slate-200 dark:border-slate-800 pl-4 py-1 space-y-2.5">
                                  <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                                    Detailed Transactions
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-800/60 text-slate-400 font-bold uppercase tracking-wider">
                                          <th className="py-2 pr-4">Date</th>
                                          <th className="py-2 text-right pr-4">Invested Amount</th>
                                          <th className="py-2 text-right pr-4">Current Value</th>
                                          <th className="py-2 text-right pr-4">Gain / Loss</th>
                                          <th className="py-2 text-right pr-4">Units</th>
                                          <th className="py-2 text-right pr-4">Buy NAV</th>
                                          <th className="py-2 text-right">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/20">
                                        {c.transactions.map((t) => (
                                          <tr key={t.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-800/10 transition-colors">
                                            <td className="py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                                              {new Date(t.investedDate).toLocaleDateString("en-IN", {
                                                day: "2-digit",
                                                month: "short",
                                                year: "numeric",
                                              })}
                                            </td>
                                            <td className="py-2.5 text-right font-bold text-slate-800 dark:text-slate-200 pr-4">
                                              {formatCurrencyINR(t.amount)}
                                            </td>
                                            <td className="py-2.5 text-right font-bold text-slate-800 dark:text-slate-200 pr-4">
                                              {formatCurrencyINR(t.currentValue)}
                                            </td>
                                            <td className="py-2.5 text-right font-bold pr-4">
                                              <span className={t.gainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}>
                                                {t.gainLoss >= 0 ? "+" : ""}
                                                {formatCurrencyINR(t.gainLoss)}
                                              </span>
                                              <span className={`text-[10px] font-bold block ${t.gainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                                {t.gainLossPct.toFixed(2)}%
                                              </span>
                                            </td>
                                            <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400 pr-4">
                                              {t.units.toFixed(4)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400 pr-4">
                                              ₹{t.buyNav.toFixed(4)}
                                            </td>
                                            <td className="py-2.5 text-right text-[10px] font-bold space-x-2">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleEditClick(t);
                                                }}
                                                className="text-blue-500 hover:text-blue-600 hover:underline active:scale-95 transition-all"
                                              >
                                                Edit
                                              </button>
                                              <span className="text-slate-300">|</span>
                                              {confirmDeleteId === String(t.id) ? (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setHoldings((prev) => prev.filter((item) => String(item.id) !== String(t.id)));
                                                    addToast("Holding removed.", "info");
                                                    setConfirmDeleteId(null);
                                                  }}
                                                  className="text-amber-500 hover:underline active:scale-95 transition-all animate-pulse"
                                                >
                                                  Confirm?
                                                </button>
                                              ) : (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmDeleteId(String(t.id));
                                                    setTimeout(() => {
                                                      setConfirmDeleteId((prev) => prev === String(t.id) ? null : prev);
                                                    }, 3000);
                                                  }}
                                                  className="text-rose-500 hover:text-rose-600 hover:underline active:scale-95 transition-all"
                                                >
                                                  Delete
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800/60 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      <th className="px-5 py-3">Fund Name</th>
                      <th className="px-5 py-3">Investment Details</th>
                      <th className="px-5 py-3 text-right">Invested Amount</th>
                      <th className="px-5 py-3 text-right">Current Value</th>
                      <th className="px-5 py-3 text-right">Total Gain / Loss</th>
                      <th className="px-5 py-3 text-right">Units Held</th>
                      <th className="px-5 py-3 text-right">Current NAV</th>
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
                            {failedPortfolioCodes.has(h.schemeCode) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[9px] font-extrabold tracking-wide animate-pulse" title="Failed to fetch live NAV. Using purchase NAV as fallback.">
                                ⚠️ Live Price Offline
                              </span>
                            )}
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
                        <td className="px-5 py-4 text-right font-bold text-slate-800 dark:text-slate-200">
                          {formatCurrencyINR(h.amount)}
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-slate-800 dark:text-slate-200">
                          {formatCurrencyINR(h.currentValue)}
                        </td>
                        <td className="px-5 py-4 text-right font-bold">
                          <span className={h.gainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}>
                            {h.gainLoss >= 0 ? "+" : ""}
                            {formatCurrencyINR(h.gainLoss)}
                          </span>
                          <div className={`text-[10px] font-bold mt-1 ${h.gainLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {h.gainLoss >= 0 ? "▲" : "▼"} {h.gainLossPct.toFixed(2)}%
                            {h.cagr !== null && (
                              <span className="text-slate-400 font-normal"> ({h.cagr.toFixed(1)}% XIRR)</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-medium">{h.units.toFixed(4)}</td>
                        <td className="px-5 py-4 text-right font-mono text-slate-700 dark:text-slate-300">
                          ₹{h.currentNav.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                      step="any"
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
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 truncate">
                      Purchase NAV (₹)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        step="0.0001"
                        readOnly={!manualOverride}
                        placeholder={
                          selectedFund 
                            ? (navLoading ? "Fetching..." : "NAV")
                            : "NAV"
                        }
                        value={customNav}
                        onChange={(e) => setCustomNav(e.target.value)}
                        className={`w-full pl-3 pr-8 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                          navLoading ? "animate-pulse" : ""
                        } ${
                          manualOverride
                            ? "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                            : "bg-slate-100 dark:bg-slate-800/40 border-transparent text-slate-400 cursor-not-allowed"
                        }`}
                      />
                      {navLoading && (
                        <div className="absolute right-2.5 top-2.5 flex items-center justify-center">
                          <svg className="animate-spin h-4.5 w-4.5 text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 truncate">
                      Stamp Duty (₹)
                    </label>
                    <input
                      type="text"
                      readOnly
                      placeholder="0.00"
                      value={amount ? calculateStampDuty(amount, investDate).toFixed(2) : "0.00"}
                      className="w-full px-3 py-2.5 text-xs rounded-xl border border-transparent bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 truncate">
                      Units Allocated
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        step="0.0001"
                        readOnly={!manualOverride}
                        placeholder={
                          manualOverride 
                            ? "Units" 
                            : (customNav ? "Auto" : "Auto")
                        }
                        value={customUnits}
                        onChange={(e) => setCustomUnits(e.target.value)}
                        className={`w-full pl-3 pr-7 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                          manualOverride
                            ? "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                            : "bg-slate-100 dark:bg-slate-800/40 border-transparent text-slate-400 cursor-not-allowed"
                        }`}
                      />
                      {!manualOverride && (
                        <div className="absolute right-2.5 top-3.5 text-[10px] text-slate-400/80 dark:text-slate-500/80" title="Auto-calculated from amount and NAV">
                          🔒
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFund(null);
                      setSearchQuery("");
                      setAmount("");
                      setCustomNav("");
                      setCustomUnits("");
                      setManualOverride(false);
                      setShowAddForm(false);
                    }}
                    className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
                  >
                    Done
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg active:scale-95 transition-all"
                  >
                    + Add Transaction
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
                      step="any"
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
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 truncate">
                      Purchase NAV (₹)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        step="0.0001"
                        readOnly={!editManualOverride}
                        placeholder={editNavLoading ? "Fetching..." : "NAV"}
                        value={editCustomNav}
                        onChange={(e) => setEditCustomNav(e.target.value)}
                        className={`w-full pl-3 pr-8 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                          editNavLoading ? "animate-pulse" : ""
                        } ${
                          editManualOverride
                            ? "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                            : "bg-slate-100 dark:bg-slate-800/40 border-transparent text-slate-400 cursor-not-allowed"
                        }`}
                      />
                      {editNavLoading && (
                        <div className="absolute right-2.5 top-2.5 flex items-center justify-center">
                          <svg className="animate-spin h-4.5 w-4.5 text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 truncate">
                      Stamp Duty (₹)
                    </label>
                    <input
                      type="text"
                      readOnly
                      placeholder="0.00"
                      value={editAmount ? calculateStampDuty(editAmount, editInvestDate).toFixed(2) : "0.00"}
                      className="w-full px-3 py-2.5 text-xs rounded-xl border border-transparent bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 truncate">
                      Units Allocated
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        step="0.0001"
                        readOnly={!editManualOverride}
                        placeholder={
                          editManualOverride 
                            ? "Units" 
                            : (editCustomNav ? "Auto" : "Auto")
                        }
                        value={editCustomUnits}
                        onChange={(e) => setEditCustomUnits(e.target.value)}
                        className={`w-full pl-3 pr-7 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                          editManualOverride
                            ? "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                            : "bg-slate-100 dark:bg-slate-800/40 border-transparent text-slate-400 cursor-not-allowed"
                        }`}
                      />
                      {!editManualOverride && (
                        <div className="absolute right-2.5 top-3.5 text-[10px] text-slate-400/80 dark:text-slate-500/80" title="Auto-calculated from amount and NAV">
                          🔒
                        </div>
                      )}
                    </div>
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
function generateHistoricalData(holdings, detailsMap, failedPortfolioCodes) {
  let oldestDate = new Date();
  holdings.forEach((h) => {
    if (h.investedDate) {
      const [yyyy, mm, dd] = h.investedDate.split("-");
      const d = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
      if (d < oldestDate) oldestDate = d;
    }
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
      if (h.investedDate) {
        const [yyyy, mm, dd] = h.investedDate.split("-");
        const buyDate = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
        if (currentDate >= buyDate) {
          totalInvestedValue += h.amount;

          const details = detailsMap[h.schemeCode];
          if (details?.sortedNavs && !failedPortfolioCodes?.has(h.schemeCode)) {
            const navVal = getNavOnDate(details.sortedNavs, ts);
            totalCurrentValue += h.units * navVal;
          } else {
            totalCurrentValue += h.amount;
          }
        }
      }
    });

    dataPoints.push({
      date: dateStr,
      timestamp: ts,
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
      timestamp: today.getTime(),
      "Portfolio Value": Math.round(totalCurrentValue),
      "Invested Capital": Math.round(totalInvestedValue),
    });
  }

  return dataPoints;
}
