package com.anushkumar.mflens;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * NotificationAlarmReceiver
 *
 * Fires a native Android notification at 9:20 AM and 3:32 PM IST (weekdays only)
 * INDEPENDENT of whether the app is open. Uses NotificationManager directly so
 * it works even when the app process is completely dead.
 *
 * Flow:
 *   AlarmManager → onReceive() → enqueue WidgetSyncWorker (fetch fresh NAV)
 *                              → post immediate notification with last-known data
 *   WidgetSyncWorker finishes  → updates SharedPrefs + posts updated notification
 */
public class NotificationAlarmReceiver extends BroadcastReceiver {

    public static final String ACTION_NOTIFY_SYNC  = "com.anushkumar.mflens.NOTIFY_SYNC";
    public static final String CHANNEL_ID          = "fundlens_portfolio";
    public static final String CHANNEL_NAME        = "Portfolio Updates";
    public static final int   NOTIF_ID_MORNING    = 2001;
    public static final int   NOTIF_ID_EVENING    = 2002;

    // IST schedule
    private static final int MORNING_HOUR    = 9;
    private static final int MORNING_MINUTE  = 20;
    private static final int CLOSING_HOUR    = 15;
    private static final int CLOSING_MINUTE  = 32;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            // Re-schedule after phone restart
            scheduleBothAlarms(context);
            return;
        }

        if (!ACTION_NOTIFY_SYNC.equals(action)) return;

        // 1. Kick off fresh NAV fetch in background
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WidgetSyncWorker.class)
                .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
                "portfolio_notif_sync",
                ExistingWorkPolicy.REPLACE,
                request
        );

        // 2. Post an immediate notification with last-known values from SharedPrefs
        SharedPreferences prefs = context.getSharedPreferences(
                PortfolioWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE);

        String notifyEnabled = prefs.getString("notifyEnabled", "false");
        if (!"true".equals(notifyEnabled)) {
            scheduleNextAlarm(context);
            return; // user has not enabled notifications
        }

        String totalCurrent   = prefs.getString("totalCurrent",    "—");
        String totalInvested  = prefs.getString("totalInvested",   "—");
        String dailyChange    = prefs.getString("dailyChange",     "₹0.00");
        String dailyChangePct = prefs.getString("dailyChangePct",  "0.00%");
        boolean isProfit      = prefs.getBoolean("isProfit", true);

        String arrow = isProfit ? "▲" : "▼";
        String title = "FundLens · Portfolio Update";
        String body  = "Current: " + totalCurrent
                + "  " + arrow + " " + dailyChange + " (" + dailyChangePct + ")"
                + "\nInvested: " + totalInvested;

        postNotification(context, title, body, isProfit ? NOTIF_ID_MORNING : NOTIF_ID_EVENING);

        // 3. Schedule next alarm
        scheduleNextAlarm(context);
    }

    // ─────────────────────────────────────────────────────────────
    //  Notification posting
    // ─────────────────────────────────────────────────────────────

    public static void postNotification(Context context, String title, String body, int notifId) {
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Create channel (safe to call repeatedly; Android ignores duplicate creations)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Daily portfolio valuation updates from FundLens");
            nm.createNotificationChannel(channel);
        }

        // Tap notification → open the app
        Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingLaunch = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingLaunch)
                .setAutoCancel(true);

        nm.notify(notifId, builder.build());
    }

    // ─────────────────────────────────────────────────────────────
    //  Alarm scheduling
    // ─────────────────────────────────────────────────────────────

    public static void scheduleBothAlarms(Context context) {
        scheduleAlarm(context, MORNING_HOUR,  MORNING_MINUTE,  3001);
        scheduleAlarm(context, CLOSING_HOUR,  CLOSING_MINUTE,  3002);
    }

    private void scheduleNextAlarm(Context context) {
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
        int hour   = now.get(Calendar.HOUR_OF_DAY);
        int minute = now.get(Calendar.MINUTE);

        boolean beforeClosing = hour < CLOSING_HOUR ||
                (hour == CLOSING_HOUR && minute < CLOSING_MINUTE);

        if (beforeClosing) {
            scheduleAlarm(context, CLOSING_HOUR, CLOSING_MINUTE, 3002);
        } else {
            scheduleAlarm(context, MORNING_HOUR, MORNING_MINUTE, 3001);
        }
    }

    private static void scheduleAlarm(Context context, int hour, int minute, int requestCode) {
        Calendar target = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
        target.set(Calendar.HOUR_OF_DAY, hour);
        target.set(Calendar.MINUTE,      minute);
        target.set(Calendar.SECOND,      0);
        target.set(Calendar.MILLISECOND, 0);

        if (target.before(Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata")))) {
            target.add(Calendar.DAY_OF_YEAR, 1);
        }

        // Skip weekends
        int day = target.get(Calendar.DAY_OF_WEEK);
        if (day == Calendar.SATURDAY) {
            target.add(Calendar.DAY_OF_YEAR, 2);
        } else if (day == Calendar.SUNDAY) {
            target.add(Calendar.DAY_OF_YEAR, 1);
        }

        Intent intent = new Intent(context, NotificationAlarmReceiver.class);
        intent.setAction(ACTION_NOTIFY_SYNC);

        PendingIntent pending = PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    target.getTimeInMillis(),
                    pending
            );
        }
    }
}
