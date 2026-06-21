package com.anushkumar.mflens;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * FundListWidgetProvider
 *
 * Home screen widget that shows each fund's invested vs current value.
 * Uses a RemoteViewsService-backed ListView for the scrollable fund rows.
 *
 * Widget 2 of 2 — "Per-Fund Tracker"
 */
public class FundListWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            updateWidget(context, appWidgetManager, id);
        }
    }

    static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        SharedPreferences prefs = context.getSharedPreferences(
                PortfolioWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);

        String totalCurrent  = prefs.getString("totalCurrent",   "₹0.00");
        String totalInvested = prefs.getString("totalInvested",  "₹0.00");
        String dailyChange   = prefs.getString("dailyChange",    "₹0.00");
        boolean isProfit     = prefs.getBoolean("isProfit", true);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.fund_list_widget);

        // Header values
        views.setTextViewText(R.id.fund_widget_current,  totalCurrent);
        views.setTextViewText(R.id.fund_widget_invested, totalInvested);

        String arrow = isProfit ? "▲ " : "▼ ";
        views.setTextViewText(R.id.fund_widget_change, arrow + dailyChange);
        views.setTextColor(R.id.fund_widget_change,
                isProfit ? 0xFF10b981 : 0xFFef4444);

        // Wire up the ListView via RemoteViewsService
        Intent serviceIntent = new Intent(context, FundListRemoteViewsService.class);
        serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        views.setRemoteAdapter(R.id.fund_list_view, serviceIntent);
        views.setEmptyView(R.id.fund_list_view, R.id.fund_list_empty);

        manager.updateAppWidget(widgetId, views);
        manager.notifyAppWidgetViewDataChanged(widgetId, R.id.fund_list_view);
    }
}
