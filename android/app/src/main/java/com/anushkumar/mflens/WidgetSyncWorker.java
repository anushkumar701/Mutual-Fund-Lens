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
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * WidgetSyncWorker
 *
 * Background WorkManager task that:
 *  1. Reads stored holdingsJson from SharedPreferences
 *  2. Fetches the latest NAV for each unique fund from mfapi.in
 *  3. Computes totalCurrent, totalInvested, dailyChange, and per-fund breakdown
 *  4. Writes all updated values back to SharedPreferences
 *  5. Forces Widget 1 (PortfolioWidgetProvider) and Widget 2 (FundListWidgetProvider) to repaint
 *  6. Posts an updated background notification (if enabled by user)
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
                PortfolioWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);

        String holdingsJson = prefs.getString("holdingsJson", null);
        if (holdingsJson == null || holdingsJson.equals("[]")) {
            return Result.success();
        }

        try {
            JSONArray holdings = new JSONArray(holdingsJson);

            double totalCurrent  = 0;
            double totalInvested = 0;
            double totalPrevDay  = 0;

            // Consolidate per-fund current value (multiple transactions → one fund row)
            Map<String, Double> fundCurrentMap  = new HashMap<>();
            Map<String, Double> fundInvestedMap = new HashMap<>();
            Map<String, String> fundNameMap     = new HashMap<>();

            for (int i = 0; i < holdings.length(); i++) {
                JSONObject h      = holdings.getJSONObject(i);
                String code       = h.getString("schemeCode");
                double units      = h.getDouble("units");
                double invested   = h.optDouble("amount", 0);
                String name       = h.optString("schemeName", "Fund");

                // Accumulate invested across all transactions
                totalInvested += invested;
                fundInvestedMap.put(code,
                        fundInvestedMap.getOrDefault(code, 0.0) + invested);
                if (!fundNameMap.containsKey(code)) {
                    fundNameMap.put(code, name);
                }

                // Skip manual entries (no API code)
                if (code.startsWith("manual-")) {
                    double savedNav = h.optDouble("currentNav", h.optDouble("buyNav", 0));
                    double cur = units * savedNav;
                    totalCurrent += cur;
                    totalPrevDay += cur;
                    fundCurrentMap.put(code,
                            fundCurrentMap.getOrDefault(code, 0.0) + cur);
                    continue;
                }

                double[] navs = fetchLatestNavs(code);
                if (navs == null) continue;

                double latestNav = navs[0];
                double prevNav   = navs[1];

                double cur = units * latestNav;
                totalCurrent += cur;
                totalPrevDay += units * prevNav;
                fundCurrentMap.put(code,
                        fundCurrentMap.getOrDefault(code, 0.0) + cur);
            }

            double dailyChange    = totalCurrent - totalPrevDay;
            double dailyChangePct = totalPrevDay > 0 ? (dailyChange / totalPrevDay) * 100 : 0;
            boolean isProfit      = dailyChange >= 0;

            // Format summary values
            String fmtCurrent    = formatINR(totalCurrent);
            String fmtInvested   = formatINR(totalInvested);
            String fmtChange     = (isProfit ? "+" : "") + formatINR(Math.abs(dailyChange));
            String fmtPct        = String.format(Locale.US, "%s%.2f%%",
                    isProfit ? "+" : "-", Math.abs(dailyChangePct));

            // Build per-fund breakdown JSON for Widget 2
            JSONArray breakdown = new JSONArray();
            for (String code : fundCurrentMap.keySet()) {
                JSONObject entry = new JSONObject();
                entry.put("name",     fundNameMap.getOrDefault(code, "Fund"));
                entry.put("current",  fundCurrentMap.getOrDefault(code, 0.0));
                entry.put("invested", fundInvestedMap.getOrDefault(code, 0.0));
                breakdown.put(entry);
            }

            // Persist all computed values
            SharedPreferences.Editor editor = prefs.edit();
            editor.putString("totalCurrent",      fmtCurrent);
            editor.putString("totalInvested",     fmtInvested);
            editor.putString("dailyChange",       fmtChange);
            editor.putString("dailyChangePct",    fmtPct);
            editor.putBoolean("isProfit",         isProfit);
            editor.putString("fundBreakdownJson", breakdown.toString());
            editor.apply();

            // Repaint Widget 1
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids1 = manager.getAppWidgetIds(
                    new ComponentName(context, PortfolioWidgetProvider.class));
            for (int id : ids1) {
                PortfolioWidgetProvider.updateWidget(context, manager, id);
            }

            // Repaint Widget 2
            int[] ids2 = manager.getAppWidgetIds(
                    new ComponentName(context, FundListWidgetProvider.class));
            for (int id : ids2) {
                FundListWidgetProvider.updateWidget(context, manager, id);
            }

            // Post updated background notification if enabled
            String notifyEnabled = prefs.getString("notifyEnabled", "false");
            if ("true".equals(notifyEnabled)) {
                String arrow = isProfit ? "▲" : "▼";
                String title = "FundLens · Portfolio Updated";
                String body  = "Current: " + fmtCurrent
                        + "  " + arrow + " " + fmtChange + " (" + fmtPct + ")"
                        + "\nInvested: " + fmtInvested;
                NotificationAlarmReceiver.postNotification(context, title, body,
                        NotificationAlarmReceiver.NOTIF_ID_MORNING);
            }

            return Result.success();

        } catch (Exception e) {
            return Result.retry();
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  Network helper: fetch [latestNav, prevNav] from mfapi.in
    // ─────────────────────────────────────────────────────────────

    private double[] fetchLatestNavs(String schemeCode) {
        try {
            URL url = new URL("https://api.mfapi.in/mf/" + schemeCode + "/latest");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestMethod("GET");

            if (conn.getResponseCode() != 200) return null;

            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            conn.disconnect();

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

    // ─────────────────────────────────────────────────────────────
    //  Format helper
    // ─────────────────────────────────────────────────────────────

    private String formatINR(double value) {
        NumberFormat nf = NumberFormat.getNumberInstance(new Locale("en", "IN"));
        nf.setMinimumFractionDigits(0);
        nf.setMaximumFractionDigits(0);
        return "₹" + nf.format(value);
    }
}
