// utils/platformLinks.js
// Investment platform deeplinks and metadata for major Indian MF platforms.
// Used to show "Invest Now" links tailored to the user's chosen platform.

/**
 * All supported investment platforms with metadata and URL generators.
 * Each platform has:
 *  - id: unique identifier (stored in localStorage)
 *  - name: display name
 *  - icon: emoji icon
 *  - color: brand color (hex)
 *  - getUrl: function(schemeName, schemeCode) → URL to invest/view this fund on that platform
 *  - tip: one-line platform-specific advice
 */
export const PLATFORMS = [
  {
    id: "groww",
    name: "Groww",
    icon: "🟢",
    color: "#00d09c",
    getUrl: (name) => {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      return `https://groww.in/mutual-funds/${slug}`;
    },
    tip: "Groww automatically invests in Direct plans. Zero commission.",
  },
  {
    id: "zerodha",
    name: "Zerodha Coin",
    icon: "🔵",
    color: "#387ed1",
    getUrl: (name) => {
      const q = encodeURIComponent(name.split("-")[0].trim());
      return `https://coin.zerodha.com/explore?q=${q}`;
    },
    tip: "Zerodha Coin: Only Direct plans. Funds held in Demat. ₹0 commission.",
  },
  {
    id: "kuvera",
    name: "Kuvera",
    icon: "🟣",
    color: "#6366f1",
    getUrl: (name) => {
      const q = encodeURIComponent(name.split("-")[0].trim());
      return `https://kuvera.in/explore?q=${q}`;
    },
    tip: "Kuvera: Free Direct plan investing. Great tax harvesting tools.",
  },
  {
    id: "mfcentral",
    name: "MFCentral",
    icon: "🏛️",
    color: "#1e3a5f",
    getUrl: () => "https://www.mfcentral.com/",
    tip: "MFCentral: Official AMFI portal. View all your MF holdings in one place.",
  },
  {
    id: "paytm",
    name: "Paytm Money",
    icon: "💙",
    color: "#00b9f1",
    getUrl: (name) => {
      const q = encodeURIComponent(name.split("-")[0].trim());
      return `https://www.paytmmoney.com/mutual-funds/explore?q=${q}`;
    },
    tip: "Paytm Money: UPI-based instant SIP setup. Only Direct plans.",
  },
  {
    id: "etmoney",
    name: "ET Money",
    icon: "🟠",
    color: "#f97316",
    getUrl: () => "https://www.etmoney.com/mutual-funds",
    tip: "ET Money: Zero-commission Direct plans with smart tax planning.",
  },
  {
    id: "mfutility",
    name: "MFUtility",
    icon: "🏦",
    color: "#059669",
    getUrl: () => "https://www.mfuonline.com/",
    tip: "MFUtility: Industry utility for investing across all AMCs with a single CAN.",
  },
  {
    id: "other",
    name: "Other / AMC Direct",
    icon: "🌐",
    color: "#6b7280",
    getUrl: (name) => {
      const q = encodeURIComponent(name);
      return `https://www.google.com/search?q=${q}+invest`;
    },
    tip: "Invest directly on the AMC website for maximum control.",
  },
];

// localStorage key for the user's preferred platform
const PLATFORM_KEY = "fundlens_platform";

/**
 * Get the user's preferred platform.
 * @returns {object|null} Platform object or null if not set.
 */
export function getUserPlatform() {
  try {
    const id = localStorage.getItem(PLATFORM_KEY);
    if (!id) return null;
    return PLATFORMS.find((p) => p.id === id) || null;
  } catch {
    return null;
  }
}

/**
 * Set the user's preferred platform.
 * @param {string} platformId - One of the PLATFORM ids.
 */
export function setUserPlatform(platformId) {
  try {
    localStorage.setItem(PLATFORM_KEY, platformId);
  } catch {
    // silently fail
  }
}

/**
 * Clear the user's platform preference.
 */
export function clearUserPlatform() {
  try {
    localStorage.removeItem(PLATFORM_KEY);
  } catch {
    // silently fail
  }
}

/**
 * Get the invest URL for a fund on the user's preferred platform.
 * Falls back to a Google search if no platform is set.
 */
export function getInvestUrl(schemeName, schemeCode) {
  const platform = getUserPlatform();
  if (platform) {
    return { url: platform.getUrl(schemeName, schemeCode), platform };
  }
  return null;
}

/**
 * Get invest URLs for ALL platforms for a given fund (for the multi-platform link row).
 */
export function getAllPlatformUrls(schemeName, schemeCode) {
  return PLATFORMS.map((p) => ({
    ...p,
    url: p.getUrl(schemeName, schemeCode),
  }));
}
