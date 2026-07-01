// hooks/useFunds.js
import { useState, useEffect, useCallback } from "react";

const BASE_URL = "https://api.mfapi.in/mf";
const AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

async function getWithTimeout(key, timeoutMs = 1000) {
  try {
    const { get } = await import("idb-keyval");
    return await Promise.race([
      get(key),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("IndexedDB timeout")), timeoutMs),
      ),
    ]);
  } catch (err) {
    console.warn(
      `[FundLens] IndexedDB get timed out or failed for ${key}:`,
      err.message,
    );
    return null;
  }
}

async function setWithTimeout(key, value, timeoutMs = 1000) {
  try {
    const { set } = await import("idb-keyval");
    return await Promise.race([
      set(key, value),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("IndexedDB timeout")), timeoutMs),
      ),
    ]);
  } catch (err) {
    console.warn(
      `[FundLens] IndexedDB set timed out or failed for ${key}:`,
      err.message,
    );
  }
}

// Module-level singletons — CLIENT-ONLY (pure SPA, no SSR).
let memoryCachedList = null;
let activeListFetchPromise = null;
const activeDetailFetchPromises = new Map();

const FUND_LIST_CACHE_KEY = "fundlens_all_funds_v2";
const FUND_LIST_TTL = 24 * 60 * 60 * 1000; // 24 hours

class CappedLRU extends Map {
  constructor(maxSize) {
    super();
    this.maxSize = maxSize;
  }
  get(key) {
    if (!this.has(key)) return undefined;
    const value = super.get(key);
    this.delete(key);
    super.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.has(key)) this.delete(key);
    super.set(key, value);
    if (this.size > this.maxSize) {
      this.delete(this.keys().next().value);
    }
    return this;
  }
}

const detailsMemoryCache = new CappedLRU(50);

async function fetchWithRetry(url, options, maxRetries = 2) {
  const axios = (await import("axios")).default;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, { ...options, timeout: 8000 });
    } catch (err) {
      lastError = err;
      if (
        attempt < maxRetries &&
        (!err.response || err.response.status >= 500)
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      } else {
        break;
      }
    }
  }
  throw lastError;
}

function parseAmfiNavText(text) {
  const funds = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("Scheme Code") || !line.includes(";"))
      continue;
    const parts = line.split(";");
    if (parts.length < 4) continue;
    const code = parts[0].trim();
    const name = parts[3].trim();
    if (!code || !/^\d+$/.test(code) || !name) continue;
    funds.push({ schemeCode: parseInt(code, 10), schemeName: name });
  }
  return funds;
}

function deduplicateFunds(fundsArray) {
  if (!Array.isArray(fundsArray)) return [];
  const seen = new Set();
  const unique = [];
  for (const fund of fundsArray) {
    if (!fund || !fund.schemeCode) continue;
    const code = String(fund.schemeCode);
    if (!seen.has(code)) {
      seen.add(code);
      unique.push(fund);
    }
  }
  return unique;
}

async function fetchFundListWithFallback() {
  try {
    const res = await fetchWithRetry(BASE_URL, {}, 1);
    if (Array.isArray(res.data) && res.data.length > 100) {
      return { data: deduplicateFunds(res.data), source: "mfapi", staleDate: null };
    }
    throw new Error("mfapi returned empty or invalid list");
  } catch (primaryErr) {
    console.warn(
      "[FundLens] mfapi.in list failed, trying AMFI fallback:",
      primaryErr.message,
    );
  }

  try {
    const axios = (await import("axios")).default;
    const res = await axios.get(AMFI_NAV_URL, {
      timeout: 12000,
      responseType: "text",
    });
    const funds = parseAmfiNavText(res.data);
    if (funds.length < 100) throw new Error("AMFI returned too few records");
    console.info(`[FundLens] Loaded ${funds.length} funds from AMFI fallback.`);
    return { data: deduplicateFunds(funds), source: "amfi", staleDate: null };
  } catch (fallbackErr) {
    console.error("[FundLens] AMFI fallback also failed:", fallbackErr.message);
  }

  // BOTH sources down — serve last cached data (never blank screen)
  try {
    const idbCached = await getWithTimeout(FUND_LIST_CACHE_KEY, 2000);
    if (idbCached && idbCached.data && idbCached.data.length > 100) {
      const staleDate = idbCached.ts ? new Date(idbCached.ts) : null;
      console.warn(
        `[FundLens] Both APIs down. Serving stale cache from ${staleDate?.toLocaleDateString() || "unknown date"}.`,
      );
      return {
        data: deduplicateFunds(idbCached.data),
        source: "stale-cache",
        staleDate,
      };
    }
  } catch (cacheErr) {
    console.error("[FundLens] Stale cache retrieval also failed:", cacheErr.message);
  }

  throw new Error(
    "Both mfapi.in and AMFI are unreachable, and no cached data is available. Please check your internet connection and try again.",
  );
}

export function useFunds(options = {}) {
  const lazy = options.lazy ?? false;
  const [funds, setFunds] = useState([]);
  const [wasTriggered, setWasTriggered] = useState(!lazy);
  const [loading, setLoading] = useState(!lazy);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [error, setError] = useState(null);

  const triggerFetch = useCallback(() => {
    setWasTriggered((prev) => {
      if (!prev) {
        setLoading(true);
      }
      return true;
    });
  }, []);

  const fetchFunds = useCallback(async (mountedRef) => {
    // mountedRef is passed from useEffect so unmount sets it to false externally.
    // When called manually (refetch), we create a local ref that stays true.
    const ref = mountedRef ?? { current: true };

    setLoading(true);
    setLoadingSlow(false);
    setError(null);

    const slowTimer = setTimeout(() => {
      if (ref.current) setLoadingSlow(true);
    }, 8000);

    try {
      // 1. Memory cache
      if (memoryCachedList) {
        if (ref.current) {
          setFunds(deduplicateFunds(memoryCachedList));
        }
        return;
      }

      // 2. Deduplicate in-flight requests
      if (activeListFetchPromise) {
        // FIX: propagate rejection so this component also calls setError
        const data = await activeListFetchPromise;
        if (ref.current) setFunds(deduplicateFunds(data));
        return;
      }

      // 3. IndexedDB cache
      const idbCached = await getWithTimeout(FUND_LIST_CACHE_KEY);
      const now = Date.now();
      if (idbCached && idbCached.ts && now - idbCached.ts < FUND_LIST_TTL) {
        memoryCachedList = deduplicateFunds(idbCached.data);
        if (ref.current) setFunds(memoryCachedList);

        // Background refresh if >12h old
        if (!activeListFetchPromise && now - idbCached.ts > FUND_LIST_TTL / 2) {
          activeListFetchPromise = fetchFundListWithFallback()
            .then(({ data }) => {
              memoryCachedList = data;
              setWithTimeout(FUND_LIST_CACHE_KEY, { ts: Date.now(), data });
              activeListFetchPromise = null;
              return data;
            })
            .catch(() => {
              activeListFetchPromise = null;
            });
        }
        return;
      }

      // 4. Network fetch (with stale-cache fallback built in)
      activeListFetchPromise = fetchFundListWithFallback()
        .then(({ data, source, staleDate }) => {
          memoryCachedList = data;
          // Only update IDB cache if this is fresh data (not stale cache)
          if (source !== "stale-cache") {
            setWithTimeout(FUND_LIST_CACHE_KEY, { ts: Date.now(), data });
          }
          activeListFetchPromise = null;
          return { data, source, staleDate };
        })
        .catch((err) => {
          activeListFetchPromise = null;
          throw err;
        });

      const result = await activeListFetchPromise;
      if (ref.current) {
        setFunds(deduplicateFunds(result.data));
        // If serving stale data, set a non-blocking warning instead of a hard error
        if (result.source === "stale-cache" && result.staleDate) {
          setError(
            `Network unavailable. Showing cached data from ${result.staleDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Some information may be outdated.`,
          );
        }
      }
    } catch (err) {
      if (ref.current) {
        setError(
          err.message ||
            "Unable to load fund list. Please check your connection and try again.",
        );
      }
    } finally {
      clearTimeout(slowTimer);
      if (ref.current) {
        setLoading(false);
        setLoadingSlow(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!wasTriggered) return;

    // FIX: use a ref object so the async function can observe unmount at any await point.
    const mountedRef = { current: true };
    
    // Defer the heavy initial fetching to let the main thread clear first,
    // reducing Total Blocking Time (TBT).
    const runFetch = () => {
      if (mountedRef.current) {
        fetchFunds(mountedRef);
      }
    };
    
    let handle;
    if (typeof window.requestIdleCallback === "function") {
      handle = window.requestIdleCallback(runFetch, { timeout: 2000 });
    } else {
      handle = setTimeout(runFetch, 100);
    }
    
    return () => {
      mountedRef.current = false;
      if (typeof window.requestIdleCallback === "function") {
        window.cancelIdleCallback(handle);
      } else {
        clearTimeout(handle);
      }
    };
  }, [fetchFunds, wasTriggered]);

  // Public refetch: create its own mounted ref (component is still alive when user triggers this)
  const refetch = useCallback(() => fetchFunds(null), [fetchFunds]);

  return { funds, loading, loadingSlow, error, refetch, triggerFetch };
}

export async function fetchFundDetail(schemeCode) {
  const codeStr = String(schemeCode);

  if (detailsMemoryCache.has(codeStr)) {
    return detailsMemoryCache.get(codeStr);
  }

  if (activeDetailFetchPromises.has(codeStr)) {
    return activeDetailFetchPromises.get(codeStr);
  }

  const promise = (async () => {
    try {
      const idbKey = `fund_detail_${codeStr}`;
      const idbCached = await getWithTimeout(idbKey);
      const now = Date.now();

      // Align TTL with AMFI daily update (~11 PM IST)
      // Calculate ms until next 11 PM IST from the cache timestamp
      const DAILY_UPDATE_HOUR_IST = 23; // 11 PM IST
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
      let cacheTTL = 12 * 60 * 60 * 1000; // fallback 12h
      if (idbCached && idbCached.timestamp) {
        const cachedAtIST = new Date(idbCached.timestamp + IST_OFFSET_MS);
        const nextUpdate = new Date(cachedAtIST);
        nextUpdate.setUTCHours(DAILY_UPDATE_HOUR_IST - 5, 30, 0, 0); // 11PM IST in UTC
        if (nextUpdate.getTime() <= idbCached.timestamp) {
          nextUpdate.setUTCDate(nextUpdate.getUTCDate() + 1);
        }
        cacheTTL = nextUpdate.getTime() - idbCached.timestamp;
      }

      if (
        idbCached &&
        idbCached.timestamp &&
        now - idbCached.timestamp < cacheTTL
      ) {
        detailsMemoryCache.set(codeStr, idbCached.data);
        return idbCached.data;
      }

      try {
        const res = await fetchWithRetry(`${BASE_URL}/${codeStr}`);
        const data = res.data;
        detailsMemoryCache.set(codeStr, data);
        await setWithTimeout(idbKey, { timestamp: now, data });
        return data;
      } catch (networkErr) {
        // Network failed — serve stale cached data if available (never blank)
        if (idbCached && idbCached.data) {
          console.warn(
            `[FundLens] Network failed for fund ${codeStr}, serving stale cache.`,
          );
          detailsMemoryCache.set(codeStr, idbCached.data);
          return idbCached.data;
        }
        throw networkErr;
      }
    } finally {
      activeDetailFetchPromises.delete(codeStr);
    }
  })();

  activeDetailFetchPromises.set(codeStr, promise);
  return promise;
}

export async function prefetchTopFunds(fundCodes, signal) {
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 200;
  for (let i = 0; i < fundCodes.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const chunk = fundCodes.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(chunk.map((code) => fetchFundDetail(code)));
    if (i + BATCH_SIZE < fundCodes.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
}
