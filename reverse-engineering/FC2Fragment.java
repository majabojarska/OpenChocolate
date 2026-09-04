package com.cubeSuite.fragment.FootControl2;
public class FC2Fragment extends com.cubeSuite.fragment.ControlBaseFragment {
    private final int[] FOOT_SWITCH_NAME;
    private final int INTERFACE_TYPE;
    int advMixKeyPage;
    private final android.widget.Button[] advMode1BtnArr;
    int advMode1Page;
    private androidx.appcompat.widget.AppCompatSpinner advancedCustomMode1Spinner;
    private android.view.View advancedCustomMode1View;
    private android.widget.Button[] customControlButArr;
    private android.view.View customControlView;
    private androidx.appcompat.widget.AppCompatSpinner customKeySpinner;
    private final android.widget.Button[] customKeyboardBtnArr;
    int customKeyboardPage;
    private android.view.View customKeyboardView;
    private com.cubeSuite.fragment.FootControl2.EditAdvMode1ListPopupWindow[][] editAdvMode1ListPopupWindow;
    com.cubeSuite.fragment.FootControl2.EditInterfaceListPopupWindow editInterfaceListPopupWindow;
    public androidx.activity.result.ActivityResultLauncher exportLauncher;
    private com.cubeSuite.entity.fc2.FC2Struct fcEntry;
    String fileName;
    private final android.os.Handler handler;
    public androidx.activity.result.ActivityResultLauncher importLauncher;
    private android.view.View maxGroupCountContainer31;
    private androidx.appcompat.widget.AppCompatSpinner maxGroupCountSpinner15;
    private androidx.appcompat.widget.AppCompatSpinner maxGroupCountSpinner31;
    androidx.appcompat.widget.SwitchCompat midiSwitch;
    private final android.widget.Button[] mixKeyBtnArr;
    private androidx.appcompat.widget.AppCompatSpinner mixKeyModeSpinner;
    private com.cubeSuite.fragment.FootControl2.MixKeyListPopupWindow[][] mixKeyPopupWindow;
    private android.view.View mixKeyView;
    private android.widget.TextView modeExplainTv;
    private com.contrarywind.view.WheelView modeSelect;
    int[] modelsTextExplain;
    private android.view.View pcdispContainer;
    androidx.appcompat.widget.SwitchCompat pcdispSwitch;
    android.widget.TextView sendMidiChannel;
    com.cubeSuite.fragment.FootControl2.TrsMidiPopupWindow trsMidiWindow;

    public FC2Fragment()
    {
        this.fcEntry = new com.cubeSuite.entity.fc2.FC2Struct();
        this.INTERFACE_TYPE = 4;
        this.advMode1Page = 0;
        this.advMixKeyPage = 0;
        this.customKeyboardPage = 0;
        com.cubeSuite.fragment.FootControl2.FC2Fragment$1 v2_0 = new android.widget.Button[4];
        this.customKeyboardBtnArr = v2_0;
        com.cubeSuite.fragment.FootControl2.FC2Fragment$1 v2_2 = new android.widget.Button[5];
        this.customControlButArr = v2_2;
        com.cubeSuite.fragment.FootControl2.FC2Fragment$1 v2_3 = new android.widget.Button[4];
        this.advMode1BtnArr = v2_3;
        com.cubeSuite.fragment.FootControl2.FC2Fragment$1 v2_4 = new android.widget.Button[4];
        this.mixKeyBtnArr = v2_4;
        int v3_0 = new int[2];
        v3_0[1] = 4;
        v3_0[0] = 10;
        this.editAdvMode1ListPopupWindow = ((com.cubeSuite.fragment.FootControl2.EditAdvMode1ListPopupWindow[][]) reflect.Array.newInstance(com.cubeSuite.fragment.FootControl2.EditAdvMode1ListPopupWindow, v3_0));
        com.cubeSuite.fragment.FootControl2.FC2Fragment$1 v2_6 = new int[2];
        v2_6[1] = 4;
        v2_6[0] = 6;
        this.mixKeyPopupWindow = ((com.cubeSuite.fragment.FootControl2.MixKeyListPopupWindow[][]) reflect.Array.newInstance(com.cubeSuite.fragment.FootControl2.MixKeyListPopupWindow, v2_6));
        this.FOOT_SWITCH_NAME = new int[] {2131951773, 2131951774, 2131951775, 2131951776, 2131952000});
        android.os.Handler v0_10 = new int[13];
        v0_10 = {2131952022, 2131952024, 2131951721, 2131951663, 2131951847, 2131952121, 2131952142, 2131951808, 2131951810, 2131951948, 2131951717, 2131951880, 2131951621};
        this.modelsTextExplain = v0_10;
        this.handler = new android.os.Handler(android.os.Looper.getMainLooper(), new com.cubeSuite.fragment.FootControl2.FC2Fragment$1(this));
        return;
    }

    static synthetic com.cubeSuite.activitys.BaseDeviceActivity access$000(com.cubeSuite.fragment.FootControl2.FC2Fragment p0)
    {
        return p0.activity;
    }

    static synthetic com.cubeSuite.entity.fc2.FC2Struct access$100(com.cubeSuite.fragment.FootControl2.FC2Fragment p0)
    {
        return p0.fcEntry;
    }

    static synthetic void access$200(com.cubeSuite.fragment.FootControl2.FC2Fragment p0, com.cubeSuite.entity.addrData.AddrU8 p1)
    {
        p0.sendData(p1);
        return;
    }

    static synthetic void access$300(com.cubeSuite.fragment.FootControl2.FC2Fragment p0)
    {
        p0.showTrsMidiSlect();
        return;
    }

    static synthetic android.os.Handler access$400(com.cubeSuite.fragment.FootControl2.FC2Fragment p0)
    {
        return p0.handler;
    }

    static synthetic com.cubeSuite.activitys.BaseDeviceActivity access$500(com.cubeSuite.fragment.FootControl2.FC2Fragment p0)
    {
        return p0.activity;
    }

    private void sendData(com.cubeSuite.entity.addrData.AddrU8 p6)
    {
        byte[] v1_1 = new byte[1];
        v1_1[0] = p6.getByteData();
        com.cubeSuite.fragment.FootControl2.FC2Fragment.communicationUtil.splitWriteData(4, v1_1, p6.getAddr());
        return;
    }

    private void showCustomKeyboardDialog(int p7)
    {
        int v0_1 = this.customKeySpinner.getSelectedItemPosition();
        new com.cubeSuite.customControl.SelectCombKey(this.getContext()).setTitle(new StringBuilder("FootSwitch[").append((p7 + 1)).append("]").toString()).setData(this.fcEntry.customKey[v0_1][p7][0].getData(), this.fcEntry.customKey[v0_1][p7][1].getData(), this.fcEntry.customKey[v0_1][p7][2].getData()).showDialog().setListening(new com.cubeSuite.fragment.FootControl2.FC2Fragment$13(this, v0_1, p7));
        return;
    }

    private void showTrsMidiSlect()
    {
        if (this.trsMidiWindow == null) {
            this.trsMidiWindow = new com.cubeSuite.fragment.FootControl2.TrsMidiPopupWindow(this.getActivity(), com.cubeSuite.fragment.FootControl2.FC2Fragment.communicationUtil);
        }
        this.trsMidiWindow.updateView(this.fcEntry);
        this.trsMidiWindow.showAtLocation(this.getView(), 80, 0, 0);
        return;
    }

    public com.cubeSuite.activitys.BaseDeviceActivity getBaseActivity()
    {
        return ((com.cubeSuite.activitys.ControlAndPdfActivity) this.getActivity());
    }

    public void initData()
    {
        java.util.Objects.requireNonNull(this.fcEntry);
        com.cubeSuite.fragment.FootControl2.FC2Fragment.communicationUtil.splitReadData(4, 0, 23646, new com.cubeSuite.fragment.FootControl2.FC2Fragment$15(this));
        return;
    }

    void initModeSelect()
    {
        this.modeSelect.setItemsVisibleCount(6);
        this.modeSelect.setTextSize(1096810496);
        this.modeSelect.setCyclic(0);
        this.modeSelect.setTextColorCenter(android.graphics.Color.rgb(255, 255, 255));
        this.modeSelect.setTextColorOut(android.graphics.Color.rgb(51, 234, 184));
        this.modeSelect.setDividerColor(android.graphics.Color.rgb(51, 234, 184));
        com.contrarywind.view.WheelView v0_4 = new java.util.ArrayList();
        v0_4.add(this.getString(2131952020));
        v0_4.add(this.getString(2131952023));
        v0_4.add(this.getString(2131951720));
        v0_4.add(this.getString(2131951660));
        v0_4.add(this.getString(2131951846));
        v0_4.add(this.getString(2131952120));
        v0_4.add(this.getString(2131952141));
        v0_4.add(this.getString(2131951807));
        v0_4.add(this.getString(2131951809));
        v0_4.add(this.getString(2131951947));
        v0_4.add(this.getString(2131951716));
        v0_4.add(this.getString(2131951617));
        v0_4.add(this.getString(2131951620));
        this.modeSelect.setAdapter(new com.cubeSuite.adapter.other.ArrayWheelAdapter(v0_4));
        this.modeSelect.setOnItemSelectedListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$14(this));
        return;
    }

    void initView()
    {
        this.modeSelect.setCurrentItem(this.fcEntry.state.getData());
        this.showStateDetailView(this.fcEntry.state.getData());
        this.advMode1Page = this.fcEntry.usrpage.getData();
        this.advMixKeyPage = this.fcEntry.mixpage.getData();
        this.advancedCustomMode1Spinner.setSelection(this.fcEntry.usrpage.getData());
        this.mixKeyModeSpinner.setSelection(this.fcEntry.mixpage.getData());
        this.customKeyboardPage = this.fcEntry.hidpage.getData();
        this.customKeySpinner.setSelection(this.fcEntry.hidpage.getData());
        int v2 = 1;
        this.sendMidiChannel.setText(String.valueOf((this.fcEntry.ch.getData() + 1)));
        androidx.appcompat.widget.SwitchCompat v0_14 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.CUSTOM_COMMAND_STR;
        int v3_0 = 0;
        while (v3_0 < 5) {
            if (v3_0 == 4) {
                v0_14 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.CUSTOM_COMMAND_STR_KNOB;
            }
            this.customControlButArr[v3_0].setText(v0_14[this.fcEntry.usr[v3_0][1].getData()]);
            v3_0++;
        }
        int v3_4;
        this.updateMaxGroupCount();
        if (this.fcEntry.bankMidi.getData() == 0) {
            v3_4 = 0;
        } else {
            v3_4 = 1;
        }
        this.midiSwitch.setChecked(v3_4);
        if (this.fcEntry.pcdisp.getData() == 0) {
            v2 = 0;
        }
        this.pcdispSwitch.setChecked(v2);
        return;
    }

    synthetic void lambda$onCreateView$0$com-cubeSuite-fragment-FootControl2-FC2Fragment(int p1, android.view.View p2)
    {
        this.showEditAdvMode1ListPopupWindow(p1);
        return;
    }

    synthetic void lambda$onCreateView$1$com-cubeSuite-fragment-FootControl2-FC2Fragment(int p1, android.view.View p2)
    {
        this.showMixKeyListPopupWindow(p1);
        return;
    }

    synthetic void lambda$onCreateView$2$com-cubeSuite-fragment-FootControl2-FC2Fragment(android.view.View p1)
    {
        this.showEditMidiWindow();
        return;
    }

    synthetic void lambda$onCreateView$3$com-cubeSuite-fragment-FootControl2-FC2Fragment(int p1, android.view.View p2)
    {
        this.showCustomKeyboardDialog(p1);
        return;
    }

    synthetic void lambda$onCreateView$4$com-cubeSuite-fragment-FootControl2-FC2Fragment(int p1, android.view.View p2)
    {
        this.showCustomControlDialog(p1);
        return;
    }

    synthetic void lambda$onCreateView$5$com-cubeSuite-fragment-FootControl2-FC2Fragment(android.view.View p2)
    {
        if (this.fcEntry.ch.getData() < 15) {
            this.fcEntry.ch.setData((this.fcEntry.ch.getData() + 1));
            this.sendMidiChannel.setText(String.valueOf((this.fcEntry.ch.getData() + 1)));
            this.sendData(this.fcEntry.ch);
        }
        return;
    }

    synthetic void lambda$onCreateView$6$com-cubeSuite-fragment-FootControl2-FC2Fragment(android.view.View p2)
    {
        if (this.fcEntry.ch.getData() > 0) {
            this.fcEntry.ch.setData((this.fcEntry.ch.getData() - 1));
            this.sendMidiChannel.setText(String.valueOf((this.fcEntry.ch.getData() + 1)));
            this.sendData(this.fcEntry.ch);
        }
        return;
    }

    synthetic void lambda$onCreateView$7$com-cubeSuite-fragment-FootControl2-FC2Fragment(java.util.List p11)
    {
        int v2 = 0;
        while (v2 < p11.size()) {
            Throwable v0_0 = com.cubeSuite.utils.PathUtil.getPath(this.getContext(), ((android.net.Uri) p11.get(v2)));
            if (!com.cubeSuite.utils.PathUtil.getFileExtension(v0_0).equals("fcp")) {
                android.widget.Toast.makeText(this.getContext(), 2131951771, 0).show();
            } else {
                int v3_5 = new java.util.ArrayList();
                try {
                    com.cubeSuite.communication.CommunicationUtil v4_2 = new java.io.FileInputStream(v0_0);
                    try {
                        while(true) {
                            Throwable v0_4 = v4_2.read();
                            v3_5.add(Byte.valueOf(((byte) v0_4)));
                        }
                        v4_2.close();
                        com.cubeSuite.customControl.AlertDialogUtil.getInstance(this.activity).setContent(2131951770).setBtnVisible(com.cubeSuite.customControl.AlertDialogUtil$SelectBtn.ALL_INVISIBLE).showDialog();
                        com.cubeSuite.fragment.FootControl2.FC2Fragment.communicationUtil.splitWriteData(4, com.cubeSuite.communication.Communication.byteListToByteArr(v3_5), 0, new com.cubeSuite.fragment.FootControl2.FC2Fragment$12(this, v3_5));
                    } catch (Throwable v0_5) {
                        Throwable v5_1 = v0_5;
                        try {
                            v4_2.close();
                        } catch (Throwable v0_6) {
                            v5_1.addSuppressed(v0_6);
                        }
                        throw v5_1;
                    }
                    if (v0_4 == -1) {
                    }
                } catch (Throwable v0_7) {
                    v0_7.printStackTrace();
                }
            }
            v2++;
        }
        return;
    }

    synthetic void lambda$onCreateView$8$com-cubeSuite-fragment-FootControl2-FC2Fragment(android.net.Uri p6)
    {
        if (p6 == null) {
            android.widget.Toast.makeText(this.getContext(), "uri null", 0).show();
            return;
        } else {
            try {
                Throwable v6_2 = android.provider.DocumentsContract.createDocument(this.getContext().getContentResolver(), android.provider.DocumentsContract.buildDocumentUriUsingTree(p6, android.provider.DocumentsContract.getTreeDocumentId(p6)), "application/octet-stream", new StringBuilder().append(this.fileName).append(".fcp").toString());
            } catch (Throwable v6_9) {
                v6_9.printStackTrace();
                android.widget.Toast.makeText(this.getContext(), v6_9.getMessage(), 0).show();
                return;
            }
            if (v6_2 == null) {
                android.widget.Toast.makeText(this.getContext(), "createDocument failed", 0).show();
                return;
            } else {
                Throwable v6_6 = this.getContext().getContentResolver().openOutputStream(v6_2);
                if (v6_6 != null) {
                    try {
                        android.widget.Toast v1_9 = this.fcEntry.getData().iterator();
                    } catch (android.widget.Toast v1_12) {
                        if (v6_6 != null) {
                            try {
                                v6_6.close();
                            } catch (Throwable v6_8) {
                                v1_12.addSuppressed(v6_8);
                            }
                        }
                        throw v1_12;
                    }
                    while (v1_9.hasNext()) {
                        v6_6.write(((Byte) v1_9.next()).byteValue());
                    }
                    android.widget.Toast.makeText(this.getContext(), "Success", 0).show();
                }
                if (v6_6 == null) {
                    return;
                } else {
                    v6_6.close();
                    return;
                }
            }
        }
    }

    synthetic void lambda$showCustomControlDialog$10$com-cubeSuite-fragment-FootControl2-FC2Fragment(int p2, android.widget.CompoundButton p3, boolean p4)
    {
        this.fcEntry.usr[p2][0].setData(p4);
        this.sendData(this.fcEntry.usr[p2][0]);
        return;
    }

    synthetic void lambda$showCustomControlDialog$9$com-cubeSuite-fragment-FootControl2-FC2Fragment(int p3, String[] p4, int p5)
    {
        this.fcEntry.usr[p3][1].setData(p5);
        this.customControlButArr[p3].setText(p4[p5]);
        this.sendData(this.fcEntry.usr[p3][1]);
        return;
    }

    public android.view.View onCreateView(android.view.LayoutInflater p10, android.view.ViewGroup p11, android.os.Bundle p12)
    {
        super.onCreate(p12);
        com.cubeSuite.fragment.FootControl2.FC2Fragment$11 v0_0 = 0;
        android.view.View v10_1 = p10.inflate(2131492926, p11, 0);
        this.modeSelect = ((com.contrarywind.view.WheelView) v10_1.findViewById(2131296699));
        this.modeExplainTv = ((android.widget.TextView) v10_1.findViewById(2131296701));
        this.customControlView = v10_1.findViewById(2131296426);
        this.advancedCustomMode1View = v10_1.findViewById(2131296334);
        this.mixKeyView = v10_1.findViewById(2131296693);
        this.customKeyboardView = v10_1.findViewById(2131296427);
        androidx.activity.result.ActivityResultLauncher v11_24 = ((com.cubeSuite.customControl.ButtonIconView) v10_1.findViewById(2131297048));
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda9 v12_8 = ((com.cubeSuite.customControl.ButtonIconView) v10_1.findViewById(2131296674));
        com.cubeSuite.customControl.ButtonIconView v1_2 = ((com.cubeSuite.customControl.ButtonIconView) v10_1.findViewById(2131296675));
        this.sendMidiChannel = ((android.widget.TextView) v10_1.findViewById(2131296914));
        this.customControlButArr[0] = ((android.widget.Button) v10_1.findViewById(2131296421));
        this.customControlButArr[1] = ((android.widget.Button) v10_1.findViewById(2131296422));
        this.customControlButArr[2] = ((android.widget.Button) v10_1.findViewById(2131296423));
        this.customControlButArr[3] = ((android.widget.Button) v10_1.findViewById(2131296424));
        this.customControlButArr[4] = ((android.widget.Button) v10_1.findViewById(2131296425));
        this.customKeyboardBtnArr[0] = ((android.widget.Button) v10_1.findViewById(2131296592));
        this.customKeyboardBtnArr[1] = ((android.widget.Button) v10_1.findViewById(2131296593));
        this.customKeyboardBtnArr[2] = ((android.widget.Button) v10_1.findViewById(2131296594));
        this.customKeyboardBtnArr[3] = ((android.widget.Button) v10_1.findViewById(2131296596));
        this.customKeySpinner = ((androidx.appcompat.widget.AppCompatSpinner) v10_1.findViewById(2131296440));
        android.widget.Button v2_6 = ((android.widget.ImageButton) v10_1.findViewById(2131297073));
        this.advMode1BtnArr[0] = ((android.widget.Button) v10_1.findViewById(2131296329));
        this.advMode1BtnArr[1] = ((android.widget.Button) v10_1.findViewById(2131296330));
        this.advMode1BtnArr[2] = ((android.widget.Button) v10_1.findViewById(2131296331));
        this.advMode1BtnArr[3] = ((android.widget.Button) v10_1.findViewById(2131296332));
        this.mixKeyBtnArr[0] = ((android.widget.Button) v10_1.findViewById(2131296335));
        this.mixKeyBtnArr[1] = ((android.widget.Button) v10_1.findViewById(2131296336));
        this.mixKeyBtnArr[2] = ((android.widget.Button) v10_1.findViewById(2131296337));
        this.mixKeyBtnArr[3] = ((android.widget.Button) v10_1.findViewById(2131296338));
        this.advancedCustomMode1Spinner = ((androidx.appcompat.widget.AppCompatSpinner) v10_1.findViewById(2131296333));
        this.mixKeyModeSpinner = ((androidx.appcompat.widget.AppCompatSpinner) v10_1.findViewById(2131296691));
        this.maxGroupCountContainer31 = v10_1.findViewById(2131296665);
        this.maxGroupCountSpinner31 = ((androidx.appcompat.widget.AppCompatSpinner) v10_1.findViewById(2131296667));
        this.maxGroupCountSpinner15 = ((androidx.appcompat.widget.AppCompatSpinner) v10_1.findViewById(2131296666));
        this.midiSwitch = ((androidx.appcompat.widget.SwitchCompat) v10_1.findViewById(2131296683));
        this.pcdispSwitch = ((androidx.appcompat.widget.SwitchCompat) v10_1.findViewById(2131296825));
        this.pcdispContainer = v10_1.findViewById(2131296824);
        this.midiSwitch.setOnCheckedChangeListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$2(this));
        this.pcdispSwitch.setOnCheckedChangeListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$3(this));
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5 v3_36 = new java.util.ArrayList();
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda4 v4_10 = 0;
        while (v4_10 < 32) {
            v3_36.add(new StringBuilder().append(((v4_10 * 4) + 3)).append("").toString());
            v4_10++;
        }
        this.maxGroupCountSpinner31.setAdapter(new android.widget.ArrayAdapter(this.getContext(), 2131492901, v3_36));
        this.maxGroupCountSpinner31.setOnItemSelectedListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$4(this));
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5 v3_40 = new java.util.ArrayList();
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda4 v4_15 = 0;
        while (v4_15 < 8) {
            v4_15++;
            v3_40.add(new StringBuilder().append(v4_15).append("").toString());
        }
        this.maxGroupCountSpinner15.setAdapter(new android.widget.ArrayAdapter(this.getContext(), 2131492901, v3_40));
        this.maxGroupCountSpinner15.setOnItemSelectedListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$5(this));
        ((android.widget.Button) v10_1.findViewById(2131296537)).setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$6(this));
        ((android.widget.Button) v10_1.findViewById(2131296536)).setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$7(this));
        this.advancedCustomMode1Spinner.setOnItemSelectedListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$8(this));
        this.mixKeyModeSpinner.setOnItemSelectedListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$9(this));
        this.customKeySpinner.setOnItemSelectedListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$10(this));
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5 v3_53 = new java.util.ArrayList();
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda4 v4_30 = 0;
        while (v4_30 < 8) {
            v4_30++;
            v3_53.add(new StringBuilder().append(v4_30).append("").toString());
        }
        this.advancedCustomMode1Spinner.setAdapter(new android.widget.ArrayAdapter(this.getContext(), 2131492901, v3_53));
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5 v3_56 = new java.util.ArrayList();
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda4 v4_33 = 0;
        while (v4_33 < 6) {
            v4_33++;
            v3_56.add(new StringBuilder().append(v4_33).append("").toString());
        }
        this.mixKeyModeSpinner.setAdapter(new android.widget.ArrayAdapter(this.getContext(), 2131492901, v3_56));
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5 v3_59 = new java.util.ArrayList();
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda4 v4_36 = 0;
        while (v4_36 < 6) {
            v4_36++;
            v3_59.add(new StringBuilder().append(v4_36).append("").toString());
        }
        this.customKeySpinner.setAdapter(new android.widget.ArrayAdapter(this.getContext(), 2131492901, v3_59));
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5 v3_61 = 0;
        while(true) {
            com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda4 v4_39 = this.advMode1BtnArr;
            if (v3_61 >= v4_39.length) {
                break;
            }
            v4_39[v3_61].setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda0(this, v3_61));
            v3_61++;
        }
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5 v3_62 = 0;
        while(true) {
            com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda4 v4_40 = this.mixKeyBtnArr;
            if (v3_62 >= v4_40.length) {
                break;
            }
            v4_40[v3_62].setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda2(this, v3_62));
            v3_62++;
        }
        v2_6.setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda3(this));
        android.widget.Button v2_7 = 0;
        while(true) {
            com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5 v3_65 = this.customKeyboardBtnArr;
            if (v2_7 >= v3_65.length) {
                break;
            }
            v3_65[v2_7].setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda4(this, v2_7));
            v2_7++;
        }
        while(true) {
            android.widget.Button v2_8 = this.customControlButArr;
            if (v0_0 >= v2_8.length) {
                break;
            }
            v2_8[v0_0].setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda5(this, v0_0));
            v0_0++;
        }
        v11_24.setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$11(this));
        v1_2.setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda6(this));
        v12_8.setOnClickListener(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda7(this));
        this.initModeSelect();
        this.importLauncher = this.registerForActivityResult(new androidx.activity.result.contract.ActivityResultContracts$OpenMultipleDocuments(), new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda8(this));
        this.exportLauncher = this.registerForActivityResult(new androidx.activity.result.contract.ActivityResultContracts$OpenDocumentTree(), new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda9(this));
        return v10_1;
    }

    public void onDestroy()
    {
        super.onDestroy();
        return;
    }

    public void showCustomControlDialog(int p8)
    {
        com.cubeSuite.customControl.ListAlertDialog v0_0 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.MIDICC_STR;
        com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda1 v1_0 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.CUSTOM_COMMAND_STR;
        if (p8 == 4) {
            v0_0 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.MIDICC_STR_KNOB;
            v1_0 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.CUSTOM_COMMAND_STR_KNOB;
        }
        int v5 = 1;
        com.cubeSuite.entity.fc2.BluetoothPedalMIDICCSelectAdapter1 v3_0 = new com.cubeSuite.entity.fc2.BluetoothPedalMIDICCSelectAdapter1(this.fcEntry.usr[p8][1].getData(), java.util.Arrays.asList(v0_0), java.util.Arrays.asList(v1_0));
        v3_0.setHasStableIds(1);
        v3_0.setItemClick(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda10(this, p8, v1_0));
        com.cubeSuite.customControl.ListAlertDialog v0_5 = new com.cubeSuite.customControl.ListAlertDialog(this.getContext());
        v0_5.setTitle(this.FOOT_SWITCH_NAME[p8]);
        v0_5.setContent(v3_0);
        if (p8 != 4) {
            if (this.fcEntry.usr[p8][0].getData() != 1) {
                v5 = 0;
            }
            v0_5.setToggleChecked(v5);
            v0_5.setToggleClick(new com.cubeSuite.fragment.FootControl2.FC2Fragment$$ExternalSyntheticLambda1(this, p8));
        }
        v0_5.showDialog();
        return;
    }

    void showEditAdvMode1ListPopupWindow(int p8)
    {
        android.view.View v0_1 = this.advancedCustomMode1Spinner.getSelectedItemPosition();
        int v1_6 = this.editAdvMode1ListPopupWindow[v0_1];
        if (v1_6[p8] == 0) {
            v1_6[p8] = new com.cubeSuite.fragment.FootControl2.EditAdvMode1ListPopupWindow(this.getActivity(), this.getView(), this.getString(this.FOOT_SWITCH_NAME[p8]), com.cubeSuite.fragment.FootControl2.FC2Fragment.communicationUtil);
        }
        this.editAdvMode1ListPopupWindow[v0_1][p8].updateView(this.fcEntry.advCustom1[v0_1][p8]);
        this.editAdvMode1ListPopupWindow[v0_1][p8].showAtLocation(this.getView(), 80, 0, 0);
        return;
    }

    void showEditMidiWindow()
    {
        if (this.editInterfaceListPopupWindow == null) {
            this.editInterfaceListPopupWindow = new com.cubeSuite.fragment.FootControl2.EditInterfaceListPopupWindow(this.getActivity(), this.getView(), com.cubeSuite.fragment.FootControl2.FC2Fragment.communicationUtil);
        }
        this.editInterfaceListPopupWindow.updateView(this.fcEntry.midiCodeTap);
        this.editInterfaceListPopupWindow.showAtLocation(this.getView(), 80, 0, 0);
        return;
    }

    void showMixKeyListPopupWindow(int p8)
    {
        android.view.View v0_1 = this.mixKeyModeSpinner.getSelectedItemPosition();
        int v1_6 = this.mixKeyPopupWindow[v0_1];
        if (v1_6[p8] == 0) {
            v1_6[p8] = new com.cubeSuite.fragment.FootControl2.MixKeyListPopupWindow(this.getActivity(), this.getView(), this.getString(this.FOOT_SWITCH_NAME[p8]), com.cubeSuite.fragment.FootControl2.FC2Fragment.communicationUtil);
        }
        this.mixKeyPopupWindow[v0_1][p8].updateView(this.fcEntry.mixKey[v0_1][p8]);
        this.mixKeyPopupWindow[v0_1][p8].showAtLocation(this.getView(), 80, 0, 0);
        return;
    }

    void showStateDetailView(int p4)
    {
        if (p4 != 0) {
            this.pcdispContainer.setVisibility(8);
        } else {
            this.pcdispContainer.setVisibility(0);
        }
        if ((p4 != 0) && (p4 != 1)) {
            this.maxGroupCountContainer31.setVisibility(8);
        } else {
            this.maxGroupCountContainer31.setVisibility(0);
        }
        if (p4 != 2) {
            this.customControlView.setVisibility(8);
        } else {
            this.customControlView.setVisibility(0);
        }
        if (p4 != 3) {
            this.advancedCustomMode1View.setVisibility(8);
        } else {
            this.advancedCustomMode1View.setVisibility(0);
        }
        if (p4 != 11) {
            this.mixKeyView.setVisibility(8);
        } else {
            this.mixKeyView.setVisibility(0);
        }
        if (p4 != 10) {
            this.customKeyboardView.setVisibility(8);
        } else {
            this.customKeyboardView.setVisibility(0);
        }
        this.modeExplainTv.setText(this.modelsTextExplain[p4]);
        return;
    }

    void updateMaxGroupCount()
    {
        if (this.fcEntry.state.getData() != 0) {
            if (this.fcEntry.state.getData() != 1) {
                if (this.fcEntry.state.getData() == 3) {
                    this.maxGroupCountSpinner15.setSelection(this.fcEntry.bankMax[2].getData());
                }
                return;
            } else {
                this.maxGroupCountSpinner31.setSelection(this.fcEntry.bankMax[1].getData());
                return;
            }
        } else {
            this.maxGroupCountSpinner31.setSelection(this.fcEntry.bankMax[0].getData());
            return;
        }
    }
}
