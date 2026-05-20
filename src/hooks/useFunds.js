// hooks/useFunds.js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { get, set } from 'idb-keyval';

const BASE_URL = 'https://api.mfapi.in/mf';
let memoryCachedList = null;

const FUND_LIST_CACHE_KEY = 'fundlens_all_funds_v2'; // v2 busts old forever-cached data
const FUND_LIST_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
      
      // 2. Check IndexedDB cache — 24 hour expiry
      const idbCached = await get(FUND_LIST_CACHE_KEY);
      const now = Date.now();
      if (idbCached && idbCached.ts && (now - idbCached.ts < FUND_LIST_TTL)) {
        memoryCachedList = idbCached.data;
        setFunds(idbCached.data);
        setLoading(false);
        // Fire & forget background update if >12h old (keeps data fresh without blocking)
        if (now - idbCached.ts > FUND_LIST_TTL / 2) {
          axios.get(BASE_URL, { timeout: 15000 }).then(res => {
            memoryCachedList = res.data;
            set(FUND_LIST_CACHE_KEY, { ts: Date.now(), data: res.data });
            setFunds(res.data);
          }).catch(() => {});
        }
        return;
      }

      // 3. Network fetch
      const res = await axios.get(BASE_URL, { timeout: 15000 });
      memoryCachedList = res.data;
      set(FUND_LIST_CACHE_KEY, { ts: Date.now(), data: res.data });
      setFunds(res.data);
    } catch (err) {
      setError('Unable to load funds. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  return { funds, loading, error, refetch: fetchFunds };
}

// Memory cache for individual details
const detailsMemoryCache = new Map();

export async function fetchFundDetail(schemeCode) {
  // 1. Check Memory Cache
  if (detailsMemoryCache.has(schemeCode)) {
    return detailsMemoryCache.get(schemeCode);
  }

  // 2. Check IndexedDB
  const idbKey = `fund_detail_${schemeCode}`;
  const idbCached = await get(idbKey);
  
  // Cache valid for 12 hours
  const now = Date.now();
  if (idbCached && idbCached.timestamp && (now - idbCached.timestamp < 12 * 60 * 60 * 1000)) {
    detailsMemoryCache.set(schemeCode, idbCached.data);
    return idbCached.data;
  }

  // 3. Network Fetch
  const res = await axios.get(`${BASE_URL}/${schemeCode}`, { timeout: 15000 });
  const data = res.data;
  
  detailsMemoryCache.set(schemeCode, data);
  set(idbKey, { timestamp: now, data });
  
  return data;
}

export async function prefetchTopFunds(fundCodes) {
  // Silent background fetch for top funds
  for (const code of fundCodes) {
    try {
      await fetchFundDetail(code);
    } catch (e) {
      // Ignore errors for prefetching
    }
  }
}
