package com.anushkumar.mflens;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Schedule twice-daily widget auto-refresh alarms (9:20 AM and 3:32 PM IST)
        WidgetAlarmReceiver.scheduleBothAlarms(this);
    }
}
