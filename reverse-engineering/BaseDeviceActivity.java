package com.cubeSuite.activitys;
public class BaseDeviceActivity extends androidx.appcompat.app.AppCompatActivity {
    private android.content.Intent intent;

    public BaseDeviceActivity()
    {
        return;
    }

    public void jumpToMain()
    {
        if (this.intent == null) {
            this.intent = new android.content.Intent();
        }
        this.intent.setClass(this.getApplicationContext(), com.cubeSuite.MainActivity);
        com.fastble.BleManager.getInstance().disconnectAllDevice();
        com.cubeSuite.bluetooth.BleHandle.homeDeviceList.clear();
        this.startActivity(this.intent);
        this.overridePendingTransition(0, 0);
        com.cubeSuite.activitys.ActivityStackUtil.getInstance().exit();
        return;
    }
}
