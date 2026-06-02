// hooks/useFunds.js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { get, set } from 'idb-keyval';

const BASE_URL = 'https://api.mfapi.in/mf';
// ⚠️ Module-level singletons — intentionally CLIENT-ONLY (pure SPA, no SSR).
// Do NOT enable SSR without refactoring these to per-request scope.
let memoryCachedList = null;
let activeListFetchPromise = null;
const activeDetailFetchPromises = new Map();

const FUND_LIST_CACHE_KEY = 'fundlens_all_funds_v2'; // v2 busts old forever-cached data
const FUND_LIST_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Proper LRU CappedMap — evicts the least recently USED entry (not oldest inserted).
 * On get(), the entry is re-inserted at the tail (most-recent position).
 */
class CappedLRU extends Map {
  constructor(maxSize) { super(); this.maxSize = maxSize; }
  get(key) {
    if (!this.has(key)) return undefined;
    const value = super.get(key);
    this.delete(key);
    super.set(key, value); // re-insert at tail = mark as most recently used
    return value;
  }
  set(key, value) {
    if (this.has(key)) this.delete(key);
    super.set(key, value);
    if (this.size > this.maxSize) {
      this.delete(this.keys().next().value); // evict LRU (head = oldest)
    }
    return this;
  }
}

// Memory cache for individual details, capped at 50 entries (LRU eviction)
const detailsMemoryCache = new CappedLRU(50);

// Retry with exponential backoff
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, { ...options, timeout: 15000 });
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && (!err.response || err.response.status >= 500)) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      } else {
        break;
      }
    }
  }
  throw lastError;
}

export function useFunds() {
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFunds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Check memory cache
      if (memoryCachedList) {
        setFunds(memoryCachedList);
        setLoading(false);
        return;
      }

      // Deduplicate active fetch requests
      if (activeListFetchPromise) {
        const data = await activeListFetchPromise;
        setFunds(data);
        setLoading(false);
        return;
      }
      
      // 2. Check IndexedDB cache — 24 hour expiry
      const idbCached = await get(FUND_LIST_CACHE_KEY);
      const now = Date.now();
      if (idbCached && idbCached.ts && (now - idbCached.ts < FUND_LIST_TTL)) {
        memoryCachedList = idbCached.data;
        setFunds(idbCached.data);
        setLoading(false);
        
        // Fire & forget background update if >12h old (keeps data fresh without blocking)
        if (now - idbCached.ts > FUND_LIST_TTL / 2) {
          if (!activeListFetchPromise) {
            activeListFetchPromise = fetchWithRetry(BASE_URL).then(res => {
              memoryCachedList = res.data;
              set(FUND_LIST_CACHE_KEY, { ts: Date.now(), data: res.data });
              activeListFetchPromise = null;
              return res.data;
            }).catch(() => {
              activeListFetchPromise = null;
            });
          }
        }
        return;
      }

      // 3. Network fetch with retry
      activeListFetchPromise = fetchWithRetry(BASE_URL).then(res => {
        memoryCachedList = res.data;
        set(FUND_LIST_CACHE_KEY, { ts: Date.now(), data: res.data });
        activeListFetchPromise = null;
        return res.data;
      }).catch((err) => {
        activeListFetchPromise = null;
        throw err;
      });

      const data = await activeListFetchPromise;
      setFunds(data);
    } catch (err) {
      const isNetworkError = !err.response;
      setError(isNetworkError
        ? 'Unable to load funds — network issue. Please check your connection.'
        : 'Unable to load funds from server. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  return { funds, loading, error, refetch: fetchFunds };
}

export async function fetchFundDetail(schemeCode) {
  const codeStr = String(schemeCode);

  // 1. Check Memory Cache
  if (detailsMemoryCache.has(codeStr)) {
    return detailsMemoryCache.get(codeStr);
  }

  // 2. Check ongoing fetch promise
  if (activeDetailFetchPromises.has(codeStr)) {
    return activeDetailFetchPromises.get(codeStr);
  }

  const promise = (async () => {
    // 3. Check IndexedDB
    const idbKey = `fund_detail_${codeStr}`;
    const idbCached = await get(idbKey);
    
    // Cache valid for 12 hours
    const now = Date.now();
    if (idbCached && idbCached.timestamp && (now - idbCached.timestamp < 12 * 60 * 60 * 1000)) {
      detailsMemoryCache.set(codeStr, idbCached.data);
      activeDetailFetchPromises.delete(codeStr);
      return idbCached.data;
    }

    // 4. Network Fetch with retry
    const res = await fetchWithRetry(`${BASE_URL}/${codeStr}`);
    const data = res.data;
    
    detailsMemoryCache.set(codeStr, data);
    set(idbKey, { timestamp: now, data });
    activeDetailFetchPromises.delete(codeStr);
    
    return data;
  })();

  activeDetailFetchPromises.set(codeStr, promise);
  return promise;
}

export async function prefetchTopFunds(fundCodes, signal) {
  // Rate-limited: fetch in batches of 3 with 200ms gap — prevents API abuse on mfapi.in
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 200;
  for (let i = 0; i < fundCodes.length; i += BATCH_SIZE) {
    if (signal?.aborted) break; // respect cancellation from Dashboard unmount
    const chunk = fundCodes.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(chunk.map(code => fetchFundDetail(code)));
    if (i + BATCH_SIZE < fundCodes.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }
}
