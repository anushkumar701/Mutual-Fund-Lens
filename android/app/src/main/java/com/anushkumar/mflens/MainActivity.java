package com.anushkumar.mflens;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Schedule widget auto-refresh alarms (9:20 AM and 3:32 PM IST)
        WidgetAlarmReceiver.scheduleBothAlarms(this);

        // Schedule background notification alarms (same times, independent of app)
        NotificationAlarmReceiver.scheduleBothAlarms(this);
    }
}
