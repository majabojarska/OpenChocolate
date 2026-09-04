package com.cubeSuite.fragment;
public abstract class ControlBaseFragment extends androidx.fragment.app.Fragment {
    public static com.cubeSuite.communication.CommunicationUtil communicationUtil;
    protected com.cubeSuite.activitys.BaseDeviceActivity activity;

    public ControlBaseFragment()
    {
        return;
    }

    public abstract com.cubeSuite.activitys.BaseDeviceActivity getBaseActivity();

    public abstract void initData();

    public void initialize()
    {
        this.activity = this.getBaseActivity();
        if (com.cubeSuite.fragment.ControlBaseFragment.communicationUtil == null) {
            com.cubeSuite.fragment.ControlBaseFragment.communicationUtil = new com.cubeSuite.communication.CommunicationUtil();
        }
        com.cubeSuite.fragment.ControlBaseFragment.communicationUtil.connect(new com.cubeSuite.fragment.ControlBaseFragment$$ExternalSyntheticLambda0(this));
        return;
    }

    synthetic void lambda$initialize$0$com-cubeSuite-fragment-ControlBaseFragment(boolean p3)
    {
        if (p3 == null) {
            com.cubeSuite.customControl.AlertDialogUtil.getInstance(this.activity).showDialog().setTitle(2131951762).setContent(2131951709).setBtnVisible(com.cubeSuite.customControl.AlertDialogUtil$SelectBtn.CONFIRM);
            return;
        } else {
            try {
                Thread.sleep(3000);
                this.initData();
            } catch (Exception) {
            }
            return;
        }
    }
}
