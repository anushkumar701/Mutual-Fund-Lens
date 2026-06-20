package com.anushkumar.mflens;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.NumberFormat;
import java.util.Locale;

/**
 * WidgetSyncWorker
 *
 * Background WorkManager task that runs at 9:20 AM and 3:32 PM IST (weekdays only).
 * It reads the stored holdings JSON from SharedPreferences, fetches the latest NAV
 * for each fund from mfapi.in, computes portfolio totals, and refreshes the widget.
 */
public class WidgetSyncWorker extends Worker {

    public WidgetSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(
            PortfolioWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE
        );

        String holdingsJson = prefs.getString("holdingsJson", null);
        if (holdingsJson == null || holdingsJson.equals("[]")) {
            // No holdings stored yet — nothing to refresh
            return Result.success();
        }

        try {
            JSONArray holdings = new JSONArray(holdingsJson);
            double totalCurrent   = 0;
            double totalPrevDay   = 0;

            for (int i = 0; i < holdings.length(); i++) {
                JSONObject h       = holdings.getJSONObject(i);
                String schemeCode  = h.getString("schemeCode");
                double units       = h.getDouble("units");

                // Skip manual holdings (no API schemeCode)
                if (schemeCode.startsWith("manual-")) {
                    double savedNav = h.optDouble("currentNav", h.optDouble("buyNav", 0));
                    totalCurrent += units * savedNav;
                    totalPrevDay += units * savedNav;
                    continue;
                }

                // Fetch latest 2 NAV entries from mfapi.in
                double[] navs = fetchLatestNavs(schemeCode);
                if (navs == null) continue;  // network error — skip this holding

                double latestNav  = navs[0];
                double prevNav    = navs[1];

                totalCurrent += units * latestNav;
                totalPrevDay += units * prevNav;
            }

            double dailyChange    = totalCurrent - totalPrevDay;
            double dailyChangePct = totalPrevDay > 0 ? (dailyChange / totalPrevDay) * 100 : 0;
            boolean isProfit      = dailyChange >= 0;

            // Format using Indian number system
            String fmtCurrent = formatINR(totalCurrent);
            String fmtChange  = (isProfit ? "+" : "") + formatINR(Math.abs(dailyChange));
            String fmtPct     = String.format(Locale.US, "%s%.2f%%", isProfit ? "+" : "-", Math.abs(dailyChangePct));

            // Persist updated values
            SharedPreferences.Editor editor = prefs.edit();
            editor.putString("totalCurrent",   fmtCurrent);
            editor.putString("dailyChange",    fmtChange);
            editor.putString("dailyChangePct", fmtPct);
            editor.putBoolean("isProfit",      isProfit);
            editor.apply();

            // Trigger widget repaint
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, PortfolioWidgetProvider.class)
            );
            for (int id : ids) {
                PortfolioWidgetProvider.updateWidget(context, manager, id);
            }

            return Result.success();

        } catch (Exception e) {
            return Result.retry();
        }
    }

    // ────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────

    /**
     * Fetches the two most recent NAV values for a fund from mfapi.in.
     * Returns [latestNav, prevNav] or null on failure.
     */
    private double[] fetchLatestNavs(String schemeCode) {
        try {
            URL url = new URL("https://api.mfapi.in/mf/" + schemeCode + "/latest");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestMethod("GET");

            int status = conn.getResponseCode();
            if (status != 200) return null;

            BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream())
            );
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();

            // Try /latest endpoint first (returns last 2 days quickly)
            JSONObject response = new JSONObject(sb.toString());
            JSONArray data = response.optJSONArray("data");
            if (data == null || data.length() == 0) return null;

            double latest = Double.parseDouble(data.getJSONObject(0).getString("nav"));
            double prev   = data.length() > 1
                ? Double.parseDouble(data.getJSONObject(1).getString("nav"))
                : latest;

            return new double[]{ latest, prev };

        } catch (Exception e) {
            return null;
        }
    }

    /** Format a number in Indian Rupee notation (₹X,XX,XXX.XX). */
    private String formatINR(double value) {
        // Indian locale formatting
        NumberFormat nf = NumberFormat.getNumberInstance(new Locale("en", "IN"));
        nf.setMinimumFractionDigits(2);
        nf.setMaximumFractionDigits(2);
        return "₹" + nf.format(value);
    }
}
