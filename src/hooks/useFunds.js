import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../utils/queryClient";
import { getMergerChain, spliceNavHistories } from "../utils/schemeMergers";

const BASE_URL = "https://api.mfapi.in/mf";
const AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

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

  // Both APIs failed, and Workbox Service Worker might be returning network error if cache is also missing.
  throw new Error(
    "Both mfapi.in and AMFI are unreachable. Please check your internet connection and try again."
  );
}

export function useFunds(options = {}) {
  const lazy = options.lazy ?? false;
  
  const { data, isLoading, error, refetch, fetchStatus } = useQuery({
    queryKey: ["fundsList"],
    queryFn: fetchFundListWithFallback,
    enabled: !lazy,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
  });

  return {
    funds: data?.data || [],
    loading: isLoading,
    loadingSlow: fetchStatus === "fetching" && isLoading,
    error: error?.message,
    refetch,
    triggerFetch: refetch,
  };
}

export async function fetchFundDetail(schemeCode) {
  const codeStr = String(schemeCode);
  const idbKey = `fund_detail_${codeStr}`;

  return queryClient.fetchQuery({
    queryKey: ["fundDetail", codeStr],
    queryFn: async () => {
      let idbCached = null;
      try {
        const { get } = await import("idb-keyval");
        idbCached = await get(idbKey);
        
        // If we have a fresh IDB cache, use it immediately
        if (idbCached && idbCached.timestamp) {
          const now = Date.now();
          const DAILY_UPDATE_HOUR_IST = 23; 
          const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
          const cachedAtIST = new Date(idbCached.timestamp + IST_OFFSET_MS);
          const nextUpdate = new Date(cachedAtIST);
          nextUpdate.setUTCHours(DAILY_UPDATE_HOUR_IST - 5, 30, 0, 0); 
          if (nextUpdate.getTime() <= idbCached.timestamp) {
            nextUpdate.setUTCDate(nextUpdate.getUTCDate() + 1);
          }
          const cacheTTL = nextUpdate.getTime() - idbCached.timestamp;
          
          if (now - idbCached.timestamp < cacheTTL) {
            return idbCached.data;
          }
        }
      } catch (e) { /* ignore idb read errors */ }

      try {
        const chain = getMergerChain(codeStr);
        const responses = [];
        for (let i = 0; i < chain.length; i++) {
          try {
            const res = await fetchWithRetry(`${BASE_URL}/${chain[i]}`);
            responses.push(res.data);
          } catch (err) {
            // Only throw if the primary (active) code fails. Ignore missing history.
            if (i === 0) throw err;
            console.warn(`[FundLens] Missing historical data for merged code ${chain[i]}`);
          }
        }
        
        const finalData = responses[0];
        for (let i = 1; i < responses.length; i++) {
          finalData.data = spliceNavHistories(responses[i].data, finalData.data);
        }
        
        // Save to IDB for next time (page refresh)
        try {
          const { set } = await import("idb-keyval");
          await set(idbKey, { timestamp: Date.now(), data: finalData });
        } catch (e) { /* ignore */ }
        
        return finalData;
      } catch (networkErr) {
        // Fallback to stale IDB cache if network fails (e.g. rate limit)
        if (idbCached && idbCached.data) {
          console.warn(`[FundLens] Network failed for ${codeStr}, serving stale cache.`);
          return idbCached.data;
        }
        throw networkErr;
      }
    },
    // Align TTL with AMFI daily update (~11 PM IST)
    staleTime: 12 * 60 * 60 * 1000,
  });
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
