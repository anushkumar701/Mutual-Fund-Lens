// utils/portfolioWidget.js
// Pushes live portfolio data to the Android home screen widgets.
// On non-Capacitor environments (web/PWA) this is a safe no-op.

import { formatCurrencyINR } from "./formatCurrency";

/** Returns true when the code is running inside the Capacitor native shell. */
function isNativeApp() {
  return (
    typeof window !== "undefined" &&
    window.Capacitor?.isNativePlatform?.()
  );
}

/**
 * Sends the current portfolio snapshot to both Android home screen widgets
 * and persists notification preference for background delivery.
 *
 * @param {object} params
 * @param {number}   params.totalCurrent    Total current portfolio value (₹)
 * @param {number}   params.totalInvested   Total amount invested (₹)
 * @param {number}   params.dailyChange     Absolute daily change in ₹ (can be negative)
 * @param {number}   params.dailyChangePct  Daily change as % (can be negative)
 * @param {Array}    params.holdings        Raw holdings array for background NAV sync
 * @param {boolean}  params.notifyEnabled   Whether user has enabled portfolio notifications
 */
export async function syncPortfolioWidget({
  totalCurrent,
  totalInvested,
  dailyChange,
  dailyChangePct,
  holdings,
  notifyEnabled = false,
}) {
  if (!isNativeApp()) return; // graceful no-op on web

  try {
    const { Capacitor } = await import("@capacitor/core");
    const plugin = Capacitor.Plugins.PortfolioWidget;

    if (!plugin?.updateWidgetData) {
      // Plugin not registered — widget code may not have been compiled yet
      return;
    }

    const isProfit = dailyChange >= 0;
    const sign     = isProfit ? "+" : "";

    await plugin.updateWidgetData({
      totalCurrent:   formatCurrencyINR(totalCurrent),
      totalInvested:  formatCurrencyINR(totalInvested ?? 0),
      dailyChange:    sign + formatCurrencyINR(Math.abs(dailyChange)),
      dailyChangePct: sign + Math.abs(dailyChangePct).toFixed(2) + "%",
      isProfit,
      holdingsJson:   JSON.stringify(holdings || []),
      notifyEnabled:  notifyEnabled ? "true" : "false",
    });
  } catch (err) {
    // Widget update is best-effort — never throw into the portfolio UI
    console.warn("[FundLens] Widget sync failed:", err?.message);
  }
}
