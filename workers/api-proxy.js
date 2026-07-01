// workers/api-proxy.js
// Cloudflare Worker — thin server-side proxy for mfapi.in
// Centralizes caching, fallback, and retry logic in one place.
// Deploy separately via `wrangler deploy --config workers/wrangler.toml`

const MFAPI_BASE = "https://api.mfapi.in/mf";
const AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

// Cache TTLs
const FUND_LIST_TTL = 24 * 60 * 60; // 24h for full scheme list (~40k, rarely changes)
const FUND_DETAIL_TTL = calculateTTLToNextAMFIUpdate(); // Dynamic TTL till next 11PM IST

function calculateTTLToNextAMFIUpdate() {
  // AMFI updates NAVs daily around 11 PM IST (17:30 UTC)
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(17, 30, 0, 0); // 11 PM IST = 17:30 UTC
  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return Math.max(Math.floor((target - now) / 1000), 3600); // minimum 1 hour
}

function parseAmfiNavText(text) {
  const funds = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("Scheme Code") || !line.includes(";")) continue;
    const parts = line.split(";");
    if (parts.length < 4) continue;
    const code = parts[0].trim();
    const name = parts[3].trim();
    if (!code || !/^\d+$/.test(code) || !name) continue;
    funds.push({ schemeCode: parseInt(code, 10), schemeName: name });
  }
  return funds;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Route: GET /api/mf — full fund list
    if (url.pathname === "/api/mf" || url.pathname === "/api/mf/") {
      return handleFundList(request, ctx);
    }

    // Route: GET /api/mf/:schemeCode — individual fund detail
    const detailMatch = url.pathname.match(/^\/api\/mf\/(\d+)\/?$/);
    if (detailMatch) {
      return handleFundDetail(detailMatch[1], request, ctx);
    }

    // Route: GET /api/mf/:schemeCode/latest — latest NAV only
    const latestMatch = url.pathname.match(/^\/api\/mf\/(\d+)\/latest\/?$/);
    if (latestMatch) {
      return handleFundDetail(latestMatch[1], request, ctx, true);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};

async function handleFundList(request, ctx) {
  const cache = caches.default;
  const cacheKey = new Request("https://fundlens-proxy/api/mf", request);

  // Try cache first
  let response = await cache.match(cacheKey);
  if (response) {
    return new Response(response.body, {
      headers: { ...Object.fromEntries(response.headers), ...CORS_HEADERS, "X-Cache": "HIT" },
    });
  }

  // Try mfapi.in
  try {
    const res = await fetch(MFAPI_BASE, { cf: { cacheTtl: FUND_LIST_TTL } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 100) {
        response = new Response(JSON.stringify(data), {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${FUND_LIST_TTL}`,
            "X-Source": "mfapi",
            "X-Cache": "MISS",
          },
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }
    }
  } catch (e) {
    console.error("mfapi.in list fetch failed:", e.message);
  }

  // Fallback: AMFI NAVAll.txt
  try {
    const res = await fetch(AMFI_NAV_URL);
    if (res.ok) {
      const text = await res.text();
      const funds = parseAmfiNavText(text);
      if (funds.length > 100) {
        response = new Response(JSON.stringify(funds), {
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${FUND_LIST_TTL}`,
            "X-Source": "amfi",
            "X-Cache": "MISS",
          },
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }
    }
  } catch (e) {
    console.error("AMFI fallback also failed:", e.message);
  }

  return new Response(JSON.stringify({ error: "Both upstream sources are unavailable" }), {
    status: 502,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function handleFundDetail(schemeCode, request, ctx, latestOnly = false) {
  const cache = caches.default;
  const suffix = latestOnly ? "/latest" : "";
  const cacheKey = new Request(`https://fundlens-proxy/api/mf/${schemeCode}${suffix}`, request);
  const ttl = calculateTTLToNextAMFIUpdate();

  // Try cache first
  let response = await cache.match(cacheKey);
  if (response) {
    return new Response(response.body, {
      headers: { ...Object.fromEntries(response.headers), ...CORS_HEADERS, "X-Cache": "HIT" },
    });
  }

  // Fetch from mfapi.in
  try {
    const upstreamUrl = `${MFAPI_BASE}/${schemeCode}${latestOnly ? "/latest" : ""}`;
    const res = await fetch(upstreamUrl);
    if (res.ok) {
      const body = await res.text();
      response = new Response(body, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`,
          "X-Source": "mfapi",
          "X-Cache": "MISS",
          "X-TTL-Seconds": String(ttl),
        },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }
  } catch (e) {
    console.error(`Fund detail fetch failed for ${schemeCode}:`, e.message);
  }

  return new Response(JSON.stringify({ error: "Upstream unavailable" }), {
    status: 502,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
