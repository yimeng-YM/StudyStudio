package cn.mengstudystudio.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocalSearchGateway.ensureStarted(getApplicationContext());
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        LocalSearchGateway.ensureStarted(getApplicationContext());
    }
}
