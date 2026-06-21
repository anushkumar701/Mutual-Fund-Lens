package com.anushkumar.mflens;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * PortfolioWidgetProvider — Widget 1: Portfolio Summary
 *
 * Shows:
 *  • Total Current Portfolio Value (large)
 *  • Total Amount Invested
 *  • Today's Daily Change (▲ / ▼)
 *  • Last-updated timestamp
 */
public class PortfolioWidgetProvider extends AppWidgetProvider {

    static final String PREFS_NAME = "PortfolioWidgetPrefs";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int widgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId);
        }
    }

    static void updateWidget(Context context, AppWidgetManager appWidgetManager, int widgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        String totalValue    = prefs.getString("totalCurrent",    "₹0.00");
        String totalInvested = prefs.getString("totalInvested",   "₹0.00");
        String dailyChange   = prefs.getString("dailyChange",     "₹0.00");
        String dailyChangePct = prefs.getString("dailyChangePct", "0.00%");
        boolean isProfit     = prefs.getBoolean("isProfit", true);

        String time = new SimpleDateFormat("h:mm a", Locale.getDefault()).format(new Date());

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.portfolio_widget);

        views.setTextViewText(R.id.widget_total_value,    totalValue);
        views.setTextViewText(R.id.widget_total_invested, totalInvested);
        views.setTextViewText(R.id.widget_last_updated,   time);

        // Daily change with directional arrow
        String arrow     = isProfit ? "▲ " : "▼ ";
        String changeStr = arrow + dailyChange + " (" + dailyChangePct + ")";
        views.setTextViewText(R.id.widget_daily_change, changeStr);

        int changeColor = isProfit
                ? Color.parseColor("#10b981")   // emerald-500
                : Color.parseColor("#ef4444");  // red-500
        views.setTextColor(R.id.widget_daily_change, changeColor);

        appWidgetManager.updateAppWidget(widgetId, views);
    }
}
