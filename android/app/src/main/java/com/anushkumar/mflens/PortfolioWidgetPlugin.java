package com.anushkumar.mflens;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * PortfolioWidgetPlugin
 *
 * Capacitor bridge plugin that accepts portfolio data from React and writes it
 * to SharedPreferences so the home screen widgets can read it and refresh.
 *
 * Called from React via:
 *   Capacitor.Plugins.PortfolioWidget.updateWidgetData({ ... })
 */
@CapacitorPlugin(name = "PortfolioWidget")
public class PortfolioWidgetPlugin extends Plugin {

    /**
     * Accepts portfolio summary data from React and pushes it to all active widgets.
     *
     * Expected payload:
     * {
     *   totalCurrent:      "₹1,24,532.80",
     *   totalInvested:     "₹1,20,000.00",
     *   dailyChange:       "₹296.48",
     *   dailyChangePct:    "0.30%",
     *   isProfit:          true,
     *   holdingsJson:      "[{...}]",      // raw holdings array as JSON string
     *   notifyEnabled:     "true"          // user notification preference
     * }
     */
    @PluginMethod
    public void updateWidgetData(PluginCall call) {
        String totalCurrent   = call.getString("totalCurrent",   "₹0.00");
        String totalInvested  = call.getString("totalInvested",  "₹0.00");
        String dailyChange    = call.getString("dailyChange",    "₹0.00");
        String dailyChangePct = call.getString("dailyChangePct", "0.00%");
        boolean isProfit      = Boolean.TRUE.equals(call.getBoolean("isProfit", true));
        String holdingsJson   = call.getString("holdingsJson",   "[]");
        String notifyEnabled  = call.getString("notifyEnabled",  "false");

        Context context = getContext();

        // 1. Persist to SharedPreferences
        SharedPreferences.Editor editor = context
                .getSharedPreferences(PortfolioWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
                .edit();
        editor.putString("totalCurrent",   totalCurrent);
        editor.putString("totalInvested",  totalInvested);
        editor.putString("dailyChange",    dailyChange);
        editor.putString("dailyChangePct", dailyChangePct);
        editor.putBoolean("isProfit",      isProfit);
        editor.putString("holdingsJson",   holdingsJson);
        editor.putString("notifyEnabled",  notifyEnabled);
        editor.apply();

        // 2. Refresh Widget 1 (Portfolio Summary)
        AppWidgetManager manager = AppWidgetManager.getInstance(context);

        int[] ids1 = manager.getAppWidgetIds(
                new ComponentName(context, PortfolioWidgetProvider.class));
        if (ids1 != null && ids1.length > 0) {
            Intent intent = new Intent(context, PortfolioWidgetProvider.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids1);
            context.sendBroadcast(intent);
        }

        // 3. Refresh Widget 2 (Per-Fund List)
        int[] ids2 = manager.getAppWidgetIds(
                new ComponentName(context, FundListWidgetProvider.class));
        if (ids2 != null && ids2.length > 0) {
            for (int id : ids2) {
                FundListWidgetProvider.updateWidget(context, manager, id);
            }
            manager.notifyAppWidgetViewDataChanged(ids2, R.id.fund_list_view);
        }

        call.resolve();
    }
}
