// hooks/useFunds.js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { get, set } from 'idb-keyval';

const BASE_URL = 'https://api.mfapi.in/mf';
const AMFI_NAV_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';

// Module-level singletons — CLIENT-ONLY (pure SPA, no SSR).
let memoryCachedList = null;
let activeListFetchPromise = null;
const activeDetailFetchPromises = new Map();

const FUND_LIST_CACHE_KEY = 'fundlens_all_funds_v2';
const FUND_LIST_TTL = 24 * 60 * 60 * 1000; // 24 hours

class CappedLRU extends Map {
  constructor(maxSize) { super(); this.maxSize = maxSize; }
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
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, { ...options, timeout: 8000 });
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && (!err.response || err.response.status >= 500)) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      } else {
        break;
      }
    }
  }
  throw lastError;
}

function parseAmfiNavText(text) {
  const funds = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('Scheme Code') || !line.includes(';')) continue;
    const parts = line.split(';');
    if (parts.length < 4) continue;
    const code = parts[0].trim();
    const name = parts[3].trim();
    if (!code || !/^\d+$/.test(code) || !name) continue;
    funds.push({ schemeCode: parseInt(code, 10), schemeName: name });
  }
  return funds;
}

async function fetchFundListWithFallback() {
  try {
    const res = await fetchWithRetry(BASE_URL, {}, 1);
    if (Array.isArray(res.data) && res.data.length > 100) {
      return { data: res.data, source: 'mfapi' };
    }
    throw new Error('mfapi returned empty or invalid list');
  } catch (primaryErr) {
    console.warn('[FundLens] mfapi.in list failed, trying AMFI fallback:', primaryErr.message);
  }

  try {
    const res = await axios.get(AMFI_NAV_URL, { timeout: 12000, responseType: 'text' });
    const funds = parseAmfiNavText(res.data);
    if (funds.length < 100) throw new Error('AMFI returned too few records');
    console.info(`[FundLens] Loaded ${funds.length} funds from AMFI fallback.`);
    return { data: funds, source: 'amfi' };
  } catch (fallbackErr) {
    console.error('[FundLens] AMFI fallback also failed:', fallbackErr.message);
    throw new Error('Both mfapi.in and AMFI are unreachable. Please try again later.');
  }
}

export function useFunds() {
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [error, setError] = useState(null);

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
        if (ref.current) { setFunds(memoryCachedList); }
        return;
      }

      // 2. Deduplicate in-flight requests
      if (activeListFetchPromise) {
        // FIX: propagate rejection so this component also calls setError
        const data = await activeListFetchPromise;
        if (ref.current) setFunds(data);
        return;
      }

      // 3. IndexedDB cache
      const idbCached = await get(FUND_LIST_CACHE_KEY);
      const now = Date.now();
      if (idbCached && idbCached.ts && (now - idbCached.ts < FUND_LIST_TTL)) {
        memoryCachedList = idbCached.data;
        if (ref.current) setFunds(idbCached.data);

        // Background refresh if >12h old
        if (!activeListFetchPromise && now - idbCached.ts > FUND_LIST_TTL / 2) {
          activeListFetchPromise = fetchFundListWithFallback()
            .then(({ data }) => {
              memoryCachedList = data;
              set(FUND_LIST_CACHE_KEY, { ts: Date.now(), data });
              activeListFetchPromise = null;
              return data;
            })
            .catch(() => { activeListFetchPromise = null; });
        }
        return;
      }

      // 4. Network fetch
      activeListFetchPromise = fetchFundListWithFallback()
        .then(({ data }) => {
          memoryCachedList = data;
          set(FUND_LIST_CACHE_KEY, { ts: Date.now(), data });
          activeListFetchPromise = null;
          return data;
        })
        .catch(err => {
          activeListFetchPromise = null;
          throw err;
        });

      const data = await activeListFetchPromise;
      if (ref.current) setFunds(data);

    } catch (err) {
      if (ref.current) {
        setError(err.message || 'Unable to load fund list. Please check your connection and try again.');
      }
    } finally {
      clearTimeout(slowTimer);
      if (ref.current) { setLoading(false); setLoadingSlow(false); }
    }
  }, []);

  useEffect(() => {
    // FIX: use a ref object so the async function can observe unmount at any await point.
    const mountedRef = { current: true };
    fetchFunds(mountedRef);
    return () => { mountedRef.current = false; };
  }, [fetchFunds]);

  // Public refetch: create its own mounted ref (component is still alive when user triggers this)
  const refetch = useCallback(() => fetchFunds(null), [fetchFunds]);

  return { funds, loading, loadingSlow, error, refetch };
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
    const idbKey = `fund_detail_${codeStr}`;
    const idbCached = await get(idbKey);
    const now = Date.now();

    if (idbCached && idbCached.timestamp && (now - idbCached.timestamp < 12 * 60 * 60 * 1000)) {
      detailsMemoryCache.set(codeStr, idbCached.data);
      activeDetailFetchPromises.delete(codeStr);
      return idbCached.data;
    }

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
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 200;
  for (let i = 0; i < fundCodes.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const chunk = fundCodes.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(chunk.map(code => fetchFundDetail(code)));
    if (i + BATCH_SIZE < fundCodes.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }
}
