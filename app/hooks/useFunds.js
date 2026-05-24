import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { get, set } from 'idb-keyval';

const BASE_URL = 'https://api.mfapi.in/mf';
let memoryCachedList = null;

const FUND_LIST_CACHE_KEY = 'fundlens_all_funds_v2';
const FUND_LIST_TTL = 24 * 60 * 60 * 1000;

async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get(url, { ...options, timeout: 15000 });
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

export function useFunds() {
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFunds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (memoryCachedList) {
        setFunds(memoryCachedList);
        setLoading(false);
        return;
      }
      
      const idbCached = await get(FUND_LIST_CACHE_KEY);
      const now = Date.now();
      if (idbCached && idbCached.ts && (now - idbCached.ts < FUND_LIST_TTL)) {
        memoryCachedList = idbCached.data;
        setFunds(idbCached.data);
        setLoading(false);
        if (now - idbCached.ts > FUND_LIST_TTL / 2) {
          fetchWithRetry(BASE_URL).then(res => {
            memoryCachedList = res.data;
            set(FUND_LIST_CACHE_KEY, { ts: Date.now(), data: res.data });
            setFunds(res.data);
          }).catch(() => {});
        }
        return;
      }

      const res = await fetchWithRetry(BASE_URL);
      memoryCachedList = res.data;
      set(FUND_LIST_CACHE_KEY, { ts: Date.now(), data: res.data });
      setFunds(res.data);
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

const detailsMemoryCache = new Map();

export async function fetchFundDetail(schemeCode) {
  if (detailsMemoryCache.has(schemeCode)) {
    return detailsMemoryCache.get(schemeCode);
  }

  const idbKey = `fund_detail_${schemeCode}`;
  const idbCached = await get(idbKey);
  
  const now = Date.now();
  if (idbCached && idbCached.timestamp && (now - idbCached.timestamp < 12 * 60 * 60 * 1000)) {
    detailsMemoryCache.set(schemeCode, idbCached.data);
    return idbCached.data;
  }

  const res = await fetchWithRetry(`${BASE_URL}/${schemeCode}`);
  const data = res.data;
  
  detailsMemoryCache.set(schemeCode, data);
  set(idbKey, { timestamp: now, data });
  
  return data;
}

export async function prefetchTopFunds(fundCodes) {
  for (const code of fundCodes) {
    try {
      await fetchFundDetail(code);
    } catch (e) {
      // Ignore errors for prefetching
    }
  }
}
