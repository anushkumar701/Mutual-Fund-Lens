package com.anushkumar.mflens;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * WidgetAlarmReceiver
 *
 * Listens for two types of broadcasts:
 *  1. BOOT_COMPLETED   — reschedules both daily alarms after phone restart.
 *  2. ACTION_WIDGET_SYNC (custom) — fired by AlarmManager at 9:20 AM and 3:32 PM IST
 *       → enqueues WidgetSyncWorker to fetch fresh NAVs in the background
 *       → schedules the next alarm in the sequence
 *
 * Alarms only fire on weekdays (Mon–Fri) matching Indian stock market trading days.
 */
public class WidgetAlarmReceiver extends BroadcastReceiver {

    static final String ACTION_WIDGET_SYNC = "com.anushkumar.mflens.WIDGET_SYNC";

    // Market schedule in IST (UTC+5:30)
    private static final int MORNING_HOUR   = 9;
    private static final int MORNING_MINUTE = 20;
    private static final int CLOSING_HOUR   = 15;
    private static final int CLOSING_MINUTE = 32;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            // Phone restarted — re-register both alarms
            scheduleBothAlarms(context);
        } else if (ACTION_WIDGET_SYNC.equals(action)) {
            // Alarm fired — kick off the background NAV fetch
            enqueueSync(context);
            // Schedule next alarm in the cycle
            scheduleNextAlarm(context);
        }
    }

    // ────────────────────────────────────────────────────────────
    //  Enqueue WorkManager job
    // ────────────────────────────────────────────────────────────

    private void enqueueSync(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WidgetSyncWorker.class)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            "portfolio_widget_sync",
            ExistingWorkPolicy.REPLACE,
            request
        );
    }

    // ────────────────────────────────────────────────────────────
    //  Alarm scheduling helpers
    // ────────────────────────────────────────────────────────────

    /**
     * Schedule both the morning (9:20 AM IST) and closing (3:32 PM IST) alarms.
     * Called once on first app launch and after BOOT_COMPLETED.
     */
    static void scheduleBothAlarms(Context context) {
        scheduleAlarm(context, MORNING_HOUR,  MORNING_MINUTE,  1001);
        scheduleAlarm(context, CLOSING_HOUR, CLOSING_MINUTE, 1002);
    }

    /**
     * After each alarm fires, schedule the next one in the cycle:
     *   morning → closing (same day)
     *   closing → morning (next weekday)
     */
    private void scheduleNextAlarm(Context context) {
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
        int hour   = now.get(Calendar.HOUR_OF_DAY);
        int minute = now.get(Calendar.MINUTE);

        // If we just fired before or at the morning slot, schedule closing next
        boolean beforeClosing = hour < CLOSING_HOUR ||
            (hour == CLOSING_HOUR && minute < CLOSING_MINUTE);

        if (beforeClosing) {
            scheduleAlarm(context, CLOSING_HOUR, CLOSING_MINUTE, 1002);
        } else {
            // Fired closing — schedule morning on the next weekday
            scheduleAlarm(context, MORNING_HOUR, MORNING_MINUTE, 1001);
        }
    }

    /**
     * Schedule an exact alarm on the next weekday at the given IST hour:minute.
     * Skips weekends (Saturday=7, Sunday=1 in Calendar).
     */
    private static void scheduleAlarm(Context context, int hour, int minute, int requestCode) {
        Calendar target = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
        target.set(Calendar.HOUR_OF_DAY, hour);
        target.set(Calendar.MINUTE,      minute);
        target.set(Calendar.SECOND,      0);
        target.set(Calendar.MILLISECOND, 0);

        // If the target time has already passed today, move to tomorrow
        if (target.before(Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata")))) {
            target.add(Calendar.DAY_OF_YEAR, 1);
        }

        // Advance past weekends to the next Monday
        int dayOfWeek = target.get(Calendar.DAY_OF_WEEK);
        if (dayOfWeek == Calendar.SATURDAY) {
            target.add(Calendar.DAY_OF_YEAR, 2); // skip to Monday
        } else if (dayOfWeek == Calendar.SUNDAY) {
            target.add(Calendar.DAY_OF_YEAR, 1); // skip to Monday
        }

        Intent intent = new Intent(context, WidgetAlarmReceiver.class);
        intent.setAction(ACTION_WIDGET_SYNC);

        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            // setExactAndAllowWhileIdle fires even in Doze mode
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                target.getTimeInMillis(),
                pending
            );
        }
    }
}
