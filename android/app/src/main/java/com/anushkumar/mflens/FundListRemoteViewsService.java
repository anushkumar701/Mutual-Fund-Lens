package com.anushkumar.mflens;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * FundListRemoteViewsService
 *
 * Provides the data adapter for the scrollable ListView inside FundListWidgetProvider.
 * Reads the persisted per-fund breakdown JSON from SharedPreferences and populates
 * one row per unique fund (consolidated across multiple transactions).
 */
public class FundListRemoteViewsService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new FundRowFactory(getApplicationContext());
    }

    // ─────────────────────────────────────────────────────────────
    //  RemoteViewsFactory — builds each row in the widget ListView
    // ─────────────────────────────────────────────────────────────

    static class FundRowFactory implements RemoteViewsFactory {

        private final Context context;
        private final List<FundRow> rows = new ArrayList<>();

        FundRowFactory(Context ctx) {
            this.context = ctx;
        }

        @Override
        public void onCreate() {
            loadData();
        }

        @Override
        public void onDataSetChanged() {
            loadData();
        }

        @Override
        public void onDestroy() {
            rows.clear();
        }

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.fund_list_row);
            if (position >= rows.size()) return rv;

            FundRow row = rows.get(position);
            rv.setTextViewText(R.id.row_fund_name,     row.name);
            rv.setTextViewText(R.id.row_invested,      "Inv: " + row.invested);
            rv.setTextViewText(R.id.row_current,       "Now: " + row.current);

            // Colour the gain/loss text
            boolean isProfit = row.gainValue >= 0;
            String gainPrefix = isProfit ? "+" : "";
            rv.setTextViewText(R.id.row_gain,
                    gainPrefix + row.gain + " (" + row.gainPct + ")");
            rv.setTextColor(R.id.row_gain, isProfit ? 0xFF10b981 : 0xFFef4444);

            return rv;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null; // use default
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }

        // ─────────────────────────────────────────────────────────
        //  Data loading
        // ─────────────────────────────────────────────────────────

        private void loadData() {
            rows.clear();
            SharedPreferences prefs = context.getSharedPreferences(
                    PortfolioWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);

            String json = prefs.getString("fundBreakdownJson", null);
            if (json == null || json.equals("[]")) return;

            try {
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    double invested    = obj.optDouble("invested", 0);
                    double current     = obj.optDouble("current", 0);
                    double gain        = current - invested;
                    double gainPct     = invested > 0 ? (gain / invested) * 100 : 0;

                    FundRow row = new FundRow();
                    row.name     = obj.optString("name", "Unknown Fund");
                    row.invested = formatINR(invested);
                    row.current  = formatINR(current);
                    row.gain     = formatINR(Math.abs(gain));
                    row.gainPct  = String.format(Locale.US, "%.1f%%", Math.abs(gainPct));
                    row.gainValue = gain;
                    rows.add(row);
                }
            } catch (Exception e) {
                // Leave rows empty on parse error
            }
        }

        private String formatINR(double value) {
            NumberFormat nf = NumberFormat.getNumberInstance(new Locale("en", "IN"));
            nf.setMinimumFractionDigits(0);
            nf.setMaximumFractionDigits(0);
            return "₹" + nf.format(value);
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  Simple data holder
    // ─────────────────────────────────────────────────────────────

    static class FundRow {
        String name;
        String invested;
        String current;
        String gain;
        String gainPct;
        double gainValue;
    }
}
