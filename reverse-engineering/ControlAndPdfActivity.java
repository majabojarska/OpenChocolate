package com.cubeSuite.activitys;
public class ControlAndPdfActivity extends com.cubeSuite.activitys.BaseDeviceActivity {
    private static final int MSG_CONNECTION_DEVICE = 10001;
    private androidx.appcompat.app.AppCompatActivity activity;
    private android.widget.Button back;
    private com.fastble.callback.BleGattCallback bleGattCallback;
    com.cubeSuite.fragment.ControlBaseFragment controlFragment;
    private android.os.Handler handler;
    private android.content.Intent intent;
    androidx.fragment.app.FragmentManager manager;
    private com.cubeSuite.fragment.WebPdfFragment webPdfFragment;

    public ControlAndPdfActivity()
    {
        this.manager = this.getSupportFragmentManager();
        this.handler = new android.os.Handler(android.os.Looper.getMainLooper(), new com.cubeSuite.activitys.ControlAndPdfActivity$1(this));
        this.bleGattCallback = new com.cubeSuite.activitys.ControlAndPdfActivity$2(this);
        this.handler.sendEmptyMessage(10001);
        this.webPdfFragment = new com.cubeSuite.fragment.WebPdfFragment();
        this.controlFragment = com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getControlFragment();
        return;
    }

    private void Montior()
    {
        this.back = ((android.widget.Button) this.findViewById(2131296353));
        return;
    }

    static synthetic com.fastble.callback.BleGattCallback access$000(com.cubeSuite.activitys.ControlAndPdfActivity p0)
    {
        return p0.bleGattCallback;
    }

    static synthetic void access$100(com.cubeSuite.activitys.ControlAndPdfActivity p0)
    {
        p0.backHomePage();
        return;
    }

    static synthetic androidx.appcompat.app.AppCompatActivity access$200(com.cubeSuite.activitys.ControlAndPdfActivity p0)
    {
        return p0.activity;
    }

    static synthetic void access$300(com.cubeSuite.activitys.ControlAndPdfActivity p0)
    {
        p0.setMtu();
        return;
    }

    private void backHomePage()
    {
        com.fastble.BleManager.getInstance().disconnectAllDevice();
        this.activity.finish();
        return;
    }

    private void changeFragment(int p2)
    {
        androidx.fragment.app.FragmentTransaction v0_1 = this.manager.beginTransaction();
        if (p2 == null) {
            v0_1.show(this.controlFragment);
        }
        v0_1.commit();
        return;
    }

    private void initOnclick()
    {
        this.back.setOnClickListener(new com.cubeSuite.activitys.ControlAndPdfActivity$$ExternalSyntheticLambda1(this));
        return;
    }

    static synthetic androidx.core.view.WindowInsetsCompat lambda$onCreate$0(android.view.View p4, androidx.core.view.WindowInsetsCompat p5)
    {
        p4.setPadding(p4.getPaddingLeft(), p5.getInsets(androidx.core.view.WindowInsetsCompat$Type.statusBars()).top, p4.getPaddingRight(), p4.getPaddingBottom());
        return p5;
    }

    private void setMtu()
    {
        com.fastble.BleManager.getInstance().setMtu(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), 203, new com.cubeSuite.activitys.ControlAndPdfActivity$3(this));
        return;
    }

    synthetic void lambda$initOnclick$1$com-cubeSuite-activitys-ControlAndPdfActivity(android.view.View p1)
    {
        com.fastble.BleManager.getInstance().disconnectAllDevice();
        this.activity.finish();
        return;
    }

    public void onBackPressed()
    {
        com.fastble.BleManager.getInstance().disconnectAllDevice();
        this.overridePendingTransition(0, 0);
        super.onBackPressed();
        return;
    }

    protected void onCreate(android.os.Bundle p5)
    {
        super.onCreate(p5);
        this.setContentView(2131492898);
        new androidx.core.view.WindowInsetsControllerCompat(this.getWindow(), this.getWindow().getDecorView()).setAppearanceLightStatusBars(1);
        this.getWindow().setStatusBarColor(this.getResources().getColor(2131100415, 0));
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(this.findViewById(2131296880), new com.cubeSuite.activitys.ControlAndPdfActivity$$ExternalSyntheticLambda0());
        this.Montior();
        this.initOnclick();
        this.activity = this;
        com.cubeSuite.activitys.ActivityStackUtil.getInstance().addActivity(this);
        if (p5 == 0) {
            this.getSupportFragmentManager().beginTransaction().add(2131296442, this.controlFragment, 0).commit();
        }
        this.changeFragment(0);
        return;
    }

    public boolean onCreateOptionsMenu(android.view.Menu p3)
    {
        this.getMenuInflater().inflate(2131623938, p3);
        return 1;
    }

    public void onDestroy()
    {
        super.onDestroy();
        return;
    }

    public void onResume()
    {
        if (((this.controlFragment instanceof com.cubeSuite.fragment.looperDrum.LooperDrumFragment)) && (this.activity.getRequestedOrientation() != 0)) {
            this.activity.setRequestedOrientation(0);
        }
        super.onResume();
        return;
    }

    protected void onSaveInstanceState(android.os.Bundle p1)
    {
        super.onSaveInstanceState(p1);
        return;
    }
}
