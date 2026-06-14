// hooks/useSparkline.js
// Lazy-loads 30-day NAV sparkline data when the card enters the viewport.
// Uses a module-level cache + concurrency limiter to avoid hammering the API.
import { useState, useEffect, useRef } from "react";

const navCache = new Map(); // code → navData[]
const inFlight = new Set(); // codes currently being fetched
const waiters = new Map(); // code → [resolve, ...]
const fetchQueue = [];
const MAX_CONCURRENT = 3;
let activeRequests = 0;

function flushQueue() {
  while (fetchQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const code = fetchQueue.shift();
    activeRequests++;
    fetch(`https://api.mfapi.in/mf/${code}`)
      .then((r) => r.json())
      .then((json) => {
        // Reverse so oldest→newest, keep last 30 points
        const data = (json.data || []).slice(0, 30).reverse();
        navCache.set(code, data);
        (waiters.get(code) || []).forEach((r) => r(data));
      })
      .catch(() => {
        navCache.set(code, []);
        (waiters.get(code) || []).forEach((r) => r([]));
      })
      .finally(() => {
        inFlight.delete(code);
        waiters.delete(code);
        activeRequests--;
        flushQueue();
      });
  }
}

function requestSparkline(code) {
  if (navCache.has(code)) return Promise.resolve(navCache.get(code));
  return new Promise((resolve) => {
    const arr = waiters.get(code) || [];
    arr.push(resolve);
    waiters.set(code, arr);
    if (!inFlight.has(code)) {
      inFlight.add(code);
      fetchQueue.push(code);
      flushQueue();
    }
  });
}

/**
 * Returns { navData, loading, ref }.
 * Attach `ref` to the card element — data is fetched only when it enters the viewport.
 */
export function useSparkline(schemeCode) {
  const [navData, setNavData] = useState(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || fetchedRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          observer.disconnect();
          setLoading(true);
          requestSparkline(String(schemeCode))
            .then((data) => setNavData(data))
            .finally(() => setLoading(false));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [schemeCode]);

  return { navData, loading, ref };
}
