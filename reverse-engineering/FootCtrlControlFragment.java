package com.cubeSuite.fragment;
public class FootCtrlControlFragment extends com.cubeSuite.fragment.ControlBaseFragment {
    public static final String[] MIDI_TYPE;
    private final int CHANNEL_NUM;
    private final int[] FOOT_SWITCH_NAME;
    private final int INTERFACE_TYPE;
    private final int SYS_MODE;
    com.cubeSuite.activitys.ControlAndPdfActivity activity;
    private android.view.View advancedCustomKeypadContainer;
    private com.cubeSuite.customControl.ButtonIconView btnDeleteList;
    private com.cubeSuite.customControl.ButtonIconView btnEditMidiBack;
    private android.widget.Button btnEditMidiCodeBack;
    private android.widget.Button btnMidiA;
    private android.widget.Button btnMidiB;
    private android.widget.Button btnModeSwitch;
    private com.cubeSuite.customControl.ButtonIconView btnPlus;
    private com.cubeSuite.customControl.ButtonIconView btnSelectModeBack;
    private android.widget.Button cancel;
    private android.widget.Button channel;
    private int currentEditInput;
    private int currentFootSwitch;
    private int currentMidiCode;
    private final android.widget.Button[] customKeypad;
    private android.view.View customKeypadContainer;
    private final android.widget.Button[] customKeypadKeyBtn;
    private final com.cubeSuite.customControl.ListAlertDialog[] customKeypadList;
    private android.view.View customKeypadModeView;
    private int[] customKeypadSelect;
    private android.widget.Button data1;
    private android.widget.Button data2;
    private byte[] dataToMode;
    private android.view.View editMidiCodeView;
    private android.widget.PopupWindow editMidiCodeWindow;
    private android.view.View editMidiContentView;
    private android.widget.PopupWindow editMidiWindow;
    private android.widget.EditText etCustomMidiCode;
    private android.widget.ImageView expressionPedalImage;
    private com.cubeSuite.communication.FootCtrlCommunication fcc;
    private com.cubeSuite.entity.footCtrl.FootCtrlEntry footCtrlEntry;
    private final android.widget.Button[] footSwitchBtn;
    private android.widget.TextView footSwitchText;
    private int groupIndex;
    private android.widget.PopupWindow mPopWindow;
    private com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem[] midiAList;
    private com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem[] midiBList;
    private com.cubeSuite.customControl.ButtonIconView midiChannelMinus;
    private com.cubeSuite.customControl.ButtonIconView midiChannelPlus;
    int midiChannelValue;
    private android.widget.LinearLayout midiInfoList;
    private android.widget.ScrollView midiInfoListScroll;
    private final java.util.List modeItems;
    private byte[] modeOrder;
    private com.contrarywind.view.WheelView modeSelect;
    private final int[] modelsTextExplain;
    private com.cubeSuite.customControl.NumKeyPadView numKeyPad;
    private android.widget.Button numType;
    private android.app.ProgressDialog progressDialog;
    private android.widget.Button save;
    private com.cubeSuite.customControl.SelectKeyDialog selectKeyDialog;
    private android.view.View selectModeContentView;
    private android.widget.PopupWindow selectModeWindow;
    private com.cubeSuite.customControl.SelectItem[] selectModelItem;
    private android.widget.TextView sendMidiChannel;
    private android.view.View thisView;
    private int[] toggleSelect;
    int trsMidi;
    private com.cubeSuite.customControl.ButtonIconView trsMidiBtn;
    private int trsMidiChannel;
    private android.view.View trsMidiContentView;
    private android.widget.ImageView trsMidiImage;
    private android.widget.PopupWindow trsMidiWindow;
    private android.widget.TextView tvChannel;
    private android.widget.TextView tvCustomMidiCode;
    private android.widget.TextView tvData1;
    private android.widget.TextView tvData2;
    private android.widget.TextView tvIData1;
    private android.widget.TextView tvIData2;
    private android.widget.TextView tvIType;
    private android.widget.TextView tvMidiInfo;
    private android.widget.TextView tvModelExplain;
    private android.widget.TextView tvType;
    private android.widget.RadioGroup type;

    static FootCtrlControlFragment()
    {
        String[] v0_1 = new String[5];
        v0_1[0] = "PC";
        v0_1[1] = "CC";
        v0_1[2] = "Note ON";
        v0_1[3] = "Note OFF";
        v0_1[4] = "SysEx";
        com.cubeSuite.fragment.FootCtrlControlFragment.MIDI_TYPE = v0_1;
        return;
    }

    public FootCtrlControlFragment()
    {
        this.SYS_MODE = 4;
        this.INTERFACE_TYPE = 4;
        int v2_6 = new android.widget.Button[5];
        this.footSwitchBtn = v2_6;
        int v2_7 = new android.widget.Button[4];
        this.customKeypadKeyBtn = v2_7;
        this.footCtrlEntry = new com.cubeSuite.entity.footCtrl.FootCtrlEntry();
        this.fcc = new com.cubeSuite.communication.FootCtrlCommunication();
        this.modeItems = new java.util.ArrayList();
        this.currentEditInput = 0;
        this.midiChannelValue = 0;
        this.trsMidi = 0;
        this.trsMidiChannel = 0;
        this.currentFootSwitch = 4;
        this.groupIndex = 0;
        this.CHANNEL_NUM = 16;
        int[] v3_0 = new com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem[16];
        this.midiAList = v3_0;
        byte[] v0_2 = new com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem[16];
        this.midiBList = v0_2;
        byte[] v0_3 = new com.cubeSuite.customControl.SelectItem[5];
        this.selectModelItem = v0_3;
        int[] v3_1 = new int[12];
        v3_1 = {2131952021, 2131952025, 2131952121, 2131951808, 2131951810, 2131951948, 2131951847, 2131951721, 2131952142, 2131951663, 2131951718, 2131952027};
        this.modelsTextExplain = v3_1;
        this.FOOT_SWITCH_NAME = new int[] {2131951773, 2131951774, 2131951775, 2131951776, 2131951986});
        int[] v3_4 = new android.widget.Button[5];
        this.customKeypad = v3_4;
        this.customKeypadSelect = new int[] {0, 0, 0, 0, 0});
        byte[] v1_1 = new com.cubeSuite.customControl.ListAlertDialog[5];
        this.customKeypadList = v1_1;
        this.toggleSelect = new int[] {0, 0, 0, 0});
        this.currentMidiCode = 0;
        byte[] v1_3 = new byte[12];
        v1_3 = {0, 1, 11, 2, 3, 4, 5, 6, 7, 8, 9, 10};
        this.modeOrder = v1_3;
        byte[] v0_5 = new byte[12];
        v0_5 = {0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 2};
        this.dataToMode = v0_5;
        return;
    }

    static synthetic com.cubeSuite.customControl.SelectKeyDialog access$000(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.selectKeyDialog;
    }

    static synthetic android.widget.Button[] access$100(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.customKeypadKeyBtn;
    }

    static synthetic int access$1000(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.currentFootSwitch;
    }

    static synthetic void access$1100(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        p0.updateMidiInfo();
        return;
    }

    static synthetic android.widget.TextView access$1200(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.tvMidiInfo;
    }

    static synthetic android.widget.Button access$1300(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.numType;
    }

    static synthetic android.widget.RadioGroup access$1400(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.type;
    }

    static synthetic void access$1500(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        p0.setMidiEditViewVisibility();
        return;
    }

    static synthetic android.widget.Button access$1600(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.channel;
    }

    static synthetic android.widget.Button access$1700(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.data1;
    }

    static synthetic android.widget.Button access$1800(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.data2;
    }

    static synthetic android.view.View access$1900(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.thisView;
    }

    static synthetic com.cubeSuite.communication.FootCtrlCommunication access$200(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.fcc;
    }

    static synthetic android.widget.PopupWindow access$2000(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.editMidiCodeWindow;
    }

    static synthetic void access$2100(com.cubeSuite.fragment.FootCtrlControlFragment p0, byte[] p1)
    {
        p0.setData(p1);
        return;
    }

    static synthetic byte[] access$2200(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.modeOrder;
    }

    static synthetic android.view.View access$2300(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.customKeypadContainer;
    }

    static synthetic android.view.View access$2400(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.advancedCustomKeypadContainer;
    }

    static synthetic android.view.View access$2500(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.customKeypadModeView;
    }

    static synthetic int[] access$2600(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.modelsTextExplain;
    }

    static synthetic android.widget.TextView access$2700(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.tvModelExplain;
    }

    static synthetic android.widget.LinearLayout access$300(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.midiInfoList;
    }

    static synthetic com.cubeSuite.entity.footCtrl.MidiCode access$400(com.cubeSuite.fragment.FootCtrlControlFragment p0, int p1)
    {
        return p0.getMidiCode(p1);
    }

    static synthetic boolean access$500(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.isInterface();
    }

    static synthetic int access$600(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.currentMidiCode;
    }

    static synthetic int access$602(com.cubeSuite.fragment.FootCtrlControlFragment p0, int p1)
    {
        p0.currentMidiCode = p1;
        return p1;
    }

    static synthetic byte[] access$700(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.getSysEx();
    }

    static synthetic String access$800(com.cubeSuite.fragment.FootCtrlControlFragment p0, byte[] p1)
    {
        return p0.byteToX16String(p1);
    }

    static synthetic com.cubeSuite.entity.footCtrl.FootCtrlEntry access$900(com.cubeSuite.fragment.FootCtrlControlFragment p0)
    {
        return p0.footCtrlEntry;
    }

    private String byteToX16String(byte[] p9)
    {
        StringBuilder v0_1 = new StringBuilder();
        byte v1_1 = p9[0];
        int v3 = 1;
        while (v3 < (v1_1 + 1)) {
            StringBuilder v4_0 = p9[v3];
            if ((v4_0 & 255) >= 16) {
                v0_1.append(Integer.toHexString((v4_0 & 255))).append(" ");
            } else {
                v0_1.append("0").append(Integer.toHexString((p9[v3] & 255))).append(" ");
            }
            v3++;
        }
        return v0_1.toString().toUpperCase();
    }

    private void editMidiCodeFocus(int p4)
    {
        this.currentEditInput = p4;
        this.channel.setTextColor(this.getResources().getColor(2131099749));
        this.numType.setTextColor(this.getResources().getColor(2131099749));
        this.data1.setTextColor(this.getResources().getColor(2131099749));
        this.data2.setTextColor(this.getResources().getColor(2131099749));
        this.numKeyPad.setScope(0, 127);
        this.numKeyPad.setOffset(0);
        if (p4 != null) {
            if (p4 != 1) {
                if (p4 != 2) {
                    if (p4 == 3) {
                        this.numKeyPad.setValue(String.valueOf(this.data2.getText()));
                        this.data2.setTextColor(this.getResources().getColor(2131099674));
                    }
                } else {
                    this.numKeyPad.setValue(String.valueOf(this.data1.getText()));
                    this.data1.setTextColor(this.getResources().getColor(2131099674));
                }
            } else {
                this.numKeyPad.setValue(String.valueOf(this.numType.getText()));
                this.numType.setTextColor(this.getResources().getColor(2131099674));
            }
        } else {
            this.numKeyPad.setScope(1, 16);
            this.numKeyPad.setValue(String.valueOf(this.channel.getText()));
            this.numKeyPad.setOffset(-1);
            this.channel.setTextColor(this.getResources().getColor(2131099674));
        }
        this.numKeyPad.show();
        return;
    }

    private com.cubeSuite.entity.footCtrl.MidiCode getMidiCode(int p3)
    {
        if (this.groupIndex != 0) {
            return this.footCtrlEntry.getCustomData()[this.currentFootSwitch].getMidiCodeB()[p3];
        } else {
            return this.footCtrlEntry.getCustomData()[this.currentFootSwitch].getMidiCodeA()[p3];
        }
    }

    private byte[] getSysEx()
    {
        if (this.groupIndex != 0) {
            return this.footCtrlEntry.getSysExB()[this.currentFootSwitch];
        } else {
            return this.footCtrlEntry.getSysExA()[this.currentFootSwitch];
        }
    }

    private void initMidiCode()
    {
        if (this.editMidiCodeView == null) {
            this.editMidiCodeView = android.view.LayoutInflater.from(this.activity).inflate(2131492918, 0);
            this.editMidiCodeWindow = new android.widget.PopupWindow(this.editMidiCodeView, -1, -1, 1);
            this.btnEditMidiCodeBack = ((android.widget.Button) this.editMidiCodeView.findViewById(2131296353));
            this.tvMidiInfo = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297060));
            this.channel = ((android.widget.Button) this.editMidiCodeView.findViewById(2131296384));
            this.type = ((android.widget.RadioGroup) this.editMidiCodeView.findViewById(2131297066));
            this.data1 = ((android.widget.Button) this.editMidiCodeView.findViewById(2131296443));
            this.data2 = ((android.widget.Button) this.editMidiCodeView.findViewById(2131296445));
            this.cancel = ((android.widget.Button) this.editMidiCodeView.findViewById(2131296375));
            this.save = ((android.widget.Button) this.editMidiCodeView.findViewById(2131296885));
            this.numType = ((android.widget.Button) this.editMidiCodeView.findViewById(2131296763));
            this.numKeyPad = ((com.cubeSuite.customControl.NumKeyPadView) this.editMidiCodeView.findViewById(2131296762));
            this.tvIType = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297057));
            this.tvType = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297063));
            this.tvIData1 = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297055));
            this.tvData1 = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297053));
            this.tvIData2 = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297056));
            this.tvData2 = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297054));
            this.etCustomMidiCode = ((android.widget.EditText) this.editMidiCodeView.findViewById(2131296511));
            this.tvCustomMidiCode = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297052));
            this.tvChannel = ((android.widget.TextView) this.editMidiCodeView.findViewById(2131297051));
            this.type.setOnCheckedChangeListener(new com.cubeSuite.fragment.FootCtrlControlFragment$5(this));
            this.numKeyPad.setKeyPadListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda0(this));
            this.btnEditMidiCodeBack.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda11(this));
            this.channel.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda22(this));
            this.numType.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda25(this));
            this.data1.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda26(this));
            this.data2.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda27(this));
            this.cancel.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda28(this));
            this.save.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda29(this));
        }
        return;
    }

    private void initMidiInfo()
    {
        if (this.editMidiWindow == null) {
            this.editMidiContentView = android.view.LayoutInflater.from(this.activity).inflate(2131493032, 0);
            this.editMidiWindow = new android.widget.PopupWindow(this.editMidiContentView, -1, -1, 1);
            this.btnEditMidiBack = ((com.cubeSuite.customControl.ButtonIconView) this.editMidiContentView.findViewById(2131296353));
            this.btnModeSwitch = ((android.widget.Button) this.editMidiContentView.findViewById(2131296700));
            this.btnMidiA = ((android.widget.Button) this.editMidiContentView.findViewById(2131296672));
            this.btnMidiB = ((android.widget.Button) this.editMidiContentView.findViewById(2131296673));
            this.btnPlus = ((com.cubeSuite.customControl.ButtonIconView) this.editMidiContentView.findViewById(2131296839));
            this.btnDeleteList = ((com.cubeSuite.customControl.ButtonIconView) this.editMidiContentView.findViewById(2131296460));
            this.midiInfoList = ((android.widget.LinearLayout) this.editMidiContentView.findViewById(2131296677));
            this.midiInfoListScroll = ((android.widget.ScrollView) this.editMidiContentView.findViewById(2131296680));
            this.footSwitchText = ((android.widget.TextView) this.editMidiContentView.findViewById(2131296535));
            this.btnEditMidiBack.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda12(this));
            this.btnModeSwitch.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda13(this));
            this.btnMidiA.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda14(this));
            this.btnMidiB.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda15(this));
            this.btnPlus.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda16(this));
            this.btnDeleteList.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda17(this));
        }
        return;
    }

    private void initMidiList()
    {
        int v0 = 0;
        com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem[] v1_0 = 0;
        while (v1_0 < 16) {
            com.cubeSuite.customControl.SlidingDeleteItem v6_1 = new com.cubeSuite.customControl.SlidingDeleteItem(this.activity);
            android.view.View v5_0 = android.view.LayoutInflater.from(this.activity).inflate(2131493035, 0);
            android.view.View v4_1 = android.view.LayoutInflater.from(this.activity).inflate(2131493036, 0);
            v6_1.setScrollView(this.midiInfoListScroll);
            v6_1.addContentView(v5_0);
            v6_1.addMenuView(v4_1);
            v6_1.setBtnDelete(((android.widget.Button) v4_1.findViewById(2131296367)));
            this.midiAList[v1_0] = new com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem(this, v1_0, v6_1, ((android.widget.TextView) v5_0.findViewById(2131297011)));
            v1_0++;
        }
        while (v0 < 16) {
            com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem[] v1_2 = new com.cubeSuite.customControl.SlidingDeleteItem(this.activity);
            android.widget.TextView v8_3 = android.view.LayoutInflater.from(this.activity).inflate(2131493035, 0);
            com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem v9_2 = android.view.LayoutInflater.from(this.activity).inflate(2131493036, 0);
            v1_2.setBtnDelete(((android.widget.Button) v9_2.findViewById(2131296367)));
            v1_2.setScrollView(this.midiInfoListScroll);
            v1_2.addContentView(v8_3);
            v1_2.addMenuView(v9_2);
            this.midiBList[v0] = new com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem(this, v0, v1_2, ((android.widget.TextView) v8_3.findViewById(2131297011)));
            v0++;
        }
        return;
    }

    private void initMidiMode()
    {
        if (this.selectModeWindow == null) {
            this.selectModeContentView = android.view.LayoutInflater.from(this.activity).inflate(2131493029, 0);
            this.selectModeWindow = new android.widget.PopupWindow(this.selectModeContentView, -1, -1, 1);
            this.btnSelectModeBack = ((com.cubeSuite.customControl.ButtonIconView) this.selectModeContentView.findViewById(2131296353));
            int v2_2 = 0;
            this.selectModelItem[0] = ((com.cubeSuite.customControl.SelectItem) this.selectModeContentView.findViewById(2131296925));
            this.selectModelItem[1] = ((com.cubeSuite.customControl.SelectItem) this.selectModeContentView.findViewById(2131296926));
            this.selectModelItem[2] = ((com.cubeSuite.customControl.SelectItem) this.selectModeContentView.findViewById(2131296770));
            this.selectModelItem[3] = ((com.cubeSuite.customControl.SelectItem) this.selectModeContentView.findViewById(2131296635));
            this.selectModelItem[4] = ((com.cubeSuite.customControl.SelectItem) this.selectModeContentView.findViewById(2131296924));
            this.btnSelectModeBack.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda30(this));
            while(true) {
                com.cubeSuite.customControl.SelectItem v0_14 = this.selectModelItem;
                if (v2_2 >= v0_14.length) {
                    break;
                }
                v0_14[v2_2].setItemClick(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda31(this, v2_2));
                v2_2++;
            }
        }
        return;
    }

    private void initScrollPicker()
    {
        this.modeItems.add(this.getString(2131952020));
        this.modeItems.add(this.getString(2131952023));
        this.modeItems.add(this.getString(2131952026));
        this.modeItems.add(this.getString(2131952120));
        this.modeItems.add(this.getString(2131951807));
        this.modeItems.add(this.getString(2131951809));
        this.modeItems.add(this.getString(2131951947));
        this.modeItems.add(this.getString(2131951846));
        this.modeItems.add(this.getString(2131951720));
        this.modeItems.add(this.getString(2131952141));
        this.modeItems.add(this.getString(2131951659));
        this.modeItems.add(this.getString(2131951716));
        this.modeSelect = ((com.contrarywind.view.WheelView) this.thisView.findViewById(2131296699));
        this.setWheelView();
        return;
    }

    private boolean isInterface()
    {
        if (this.currentFootSwitch != 4) {
            return 0;
        } else {
            return 1;
        }
    }

    private boolean isSys()
    {
        int v0 = 0;
        byte v1_0 = this.getMidiCode(0);
        if ((v1_0.getIsEnable() > 0) && (v1_0.getType() == 4)) {
            v0 = 1;
        }
        return v0;
    }

    private void loadView()
    {
        this.tvModelExplain = ((android.widget.TextView) this.thisView.findViewById(2131297061));
        this.customKeypadContainer = this.thisView.findViewById(2131296433);
        this.advancedCustomKeypadContainer = this.thisView.findViewById(2131296328);
        this.customKeypadModeView = this.thisView.findViewById(2131296438);
        this.footSwitchBtn[0] = ((android.widget.Button) this.thisView.findViewById(2131296531));
        this.footSwitchBtn[1] = ((android.widget.Button) this.thisView.findViewById(2131296532));
        this.footSwitchBtn[2] = ((android.widget.Button) this.thisView.findViewById(2131296533));
        this.footSwitchBtn[3] = ((android.widget.Button) this.thisView.findViewById(2131296534));
        this.footSwitchBtn[4] = ((android.widget.Button) this.thisView.findViewById(2131296800));
        this.customKeypadKeyBtn[0] = ((android.widget.Button) this.thisView.findViewById(2131296434));
        this.customKeypadKeyBtn[1] = ((android.widget.Button) this.thisView.findViewById(2131296435));
        this.customKeypadKeyBtn[2] = ((android.widget.Button) this.thisView.findViewById(2131296436));
        this.customKeypadKeyBtn[3] = ((android.widget.Button) this.thisView.findViewById(2131296437));
        this.customKeypad[0] = ((android.widget.Button) this.thisView.findViewById(2131296428));
        this.customKeypad[1] = ((android.widget.Button) this.thisView.findViewById(2131296429));
        this.customKeypad[2] = ((android.widget.Button) this.thisView.findViewById(2131296430));
        this.customKeypad[3] = ((android.widget.Button) this.thisView.findViewById(2131296431));
        this.customKeypad[4] = ((android.widget.Button) this.thisView.findViewById(2131296432));
        this.trsMidiBtn = ((com.cubeSuite.customControl.ButtonIconView) this.thisView.findViewById(2131297048));
        this.sendMidiChannel = ((android.widget.TextView) this.thisView.findViewById(2131296914));
        this.midiChannelMinus = ((com.cubeSuite.customControl.ButtonIconView) this.thisView.findViewById(2131296674));
        this.midiChannelPlus = ((com.cubeSuite.customControl.ButtonIconView) this.thisView.findViewById(2131296675));
        ((android.widget.ImageButton) this.thisView.findViewById(2131297073)).setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda10(this));
        return;
    }

    private void setBankView()
    {
        int v1_0 = 4;
        if (!this.isInterface()) {
            this.btnModeSwitch.setVisibility(0);
            byte v0_2 = this.footCtrlEntry.getCustomData()[this.currentFootSwitch].getMode();
            this.btnModeSwitch.setText(this.selectModelItem[v0_2].getModeText());
            this.btnMidiA.setVisibility(0);
            if ((v0_2 != 3) && (v0_2 != 0)) {
                v1_0 = 0;
            }
            this.btnMidiB.setVisibility(v1_0);
            return;
        } else {
            this.btnMidiA.setVisibility(4);
            this.btnMidiB.setVisibility(4);
            this.btnModeSwitch.setVisibility(8);
            return;
        }
    }

    private void setClick()
    {
        com.cubeSuite.customControl.ButtonIconView v0_0 = 0;
        com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda7 v1_0 = 0;
        while(true) {
            com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda6 v2_5 = this.customKeypad;
            if (v1_0 >= v2_5.length) {
                break;
            }
            v2_5[v1_0].setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda1(this, v1_0));
            v1_0++;
        }
        this.midiChannelPlus.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda2(this));
        this.midiChannelMinus.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda3(this));
        this.trsMidiBtn.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda4(this));
        com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda7 v1_2 = 0;
        while(true) {
            com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda6 v2_4 = this.footSwitchBtn;
            if (v1_2 >= v2_4.length) {
                break;
            }
            v2_4[v1_2].setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda5(this, v1_2));
            v1_2++;
        }
        while(true) {
            com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda7 v1_3 = this.customKeypadKeyBtn;
            if (v0_0 >= v1_3.length) {
                break;
            }
            v1_3[v0_0].setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda6(this, v0_0));
            v0_0++;
        }
        this.trsMidiBtn.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda7(this));
        return;
    }

    private void setData(byte[] p7)
    {
        int v7_2 = this.fcc.parseFootCtrlData(p7);
        android.widget.Button v0_3 = ((com.cubeSuite.entity.footCtrl.FootCtrlEntry) v7_2.get("footCtrlEntry"));
        this.midiChannelValue = v0_3.getUsrChan();
        int v1_0 = v0_3.getState();
        this.trsMidi = v0_3.getTrsMidi();
        this.modeSelect.setCurrentItem(this.dataToMode[v1_0]);
        this.footCtrlEntry = v0_3;
        this.tvModelExplain.setText(this.modelsTextExplain[v1_0]);
        if (v1_0 != 7) {
            this.customKeypadContainer.setVisibility(4);
        } else {
            this.customKeypadContainer.setVisibility(0);
        }
        if (v1_0 != 9) {
            this.advancedCustomKeypadContainer.setVisibility(8);
        } else {
            this.advancedCustomKeypadContainer.setVisibility(0);
        }
        if (v1_0 != 10) {
            this.customKeypadModeView.setVisibility(8);
        } else {
            this.customKeypadModeView.setVisibility(0);
        }
        this.sendMidiChannel.setText(String.valueOf((this.midiChannelValue + 1)));
        this.customKeypadSelect = ((int[]) v7_2.get("typeArr"));
        this.toggleSelect = ((int[]) v7_2.get("toggleArr"));
        int v7_1 = 0;
        while (v7_1 < this.customKeypadKeyBtn.length) {
            this.customKeypadKeyBtn[v7_1].setText(this.selectKeyDialog.aztab[Math.min(Math.max(v0_3.getCustomKeyboard()[(v7_1 * 4)], 0), (this.selectKeyDialog.aztab.length - 1))]);
            v7_1++;
        }
        int v7_5 = 0;
        while(true) {
            android.widget.Button v0_4 = this.customKeypad;
            if (v7_5 >= v0_4.length) {
                break;
            }
            if (v7_5 != (v0_4.length - 1)) {
                android.widget.Button v0_6 = this.customKeypadList[v7_5];
                if (v0_6 != null) {
                    int v1_17;
                    if (this.toggleSelect[v7_5] != 1) {
                        v1_17 = 0;
                    } else {
                        v1_17 = 1;
                    }
                    v0_6.setToggleChecked(v1_17);
                }
                this.customKeypad[v7_5].setText(com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.CUSTOM_COMMAND_STR[this.customKeypadSelect[v7_5]]);
            } else {
                v0_4[v7_5].setText(com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.CUSTOM_COMMAND_STR_KNOB[this.customKeypadSelect[v7_5]]);
            }
            v7_5++;
        }
        this.updateMidiInfo();
        return;
    }

    private void setMidiEditViewVisibility()
    {
        if (!this.isInterface()) {
            android.widget.TextView v0_1 = 0;
            while (v0_1 < this.type.getChildCount()) {
                if (!((android.widget.RadioButton) this.type.getChildAt(v0_1)).isChecked()) {
                    v0_1++;
                }
                this.tvType.setVisibility(0);
                this.type.setVisibility(0);
                this.numType.setVisibility(8);
                this.tvIData1.setVisibility(8);
                this.tvIData2.setVisibility(8);
                if (v0_1 != 4) {
                    if (v0_1 != null) {
                        this.data2.setVisibility(0);
                        this.tvData2.setVisibility(0);
                    } else {
                        this.data2.setVisibility(8);
                        this.tvData2.setVisibility(8);
                    }
                    this.data1.setVisibility(0);
                    this.tvData1.setVisibility(0);
                    this.channel.setVisibility(0);
                    this.tvChannel.setVisibility(0);
                    this.etCustomMidiCode.setVisibility(8);
                    this.tvCustomMidiCode.setVisibility(8);
                    return;
                } else {
                    this.etCustomMidiCode.setText(this.byteToX16String(this.getSysEx()));
                    this.data1.setVisibility(8);
                    this.tvData1.setVisibility(8);
                    this.data2.setVisibility(8);
                    this.tvData2.setVisibility(8);
                    this.channel.setVisibility(8);
                    this.tvChannel.setVisibility(8);
                    this.numKeyPad.setVisibility(4);
                    this.etCustomMidiCode.setVisibility(0);
                    this.tvCustomMidiCode.setVisibility(0);
                    return;
                }
            }
            v0_1 = 0;
        } else {
            this.tvIType.setVisibility(0);
            this.tvIData1.setVisibility(0);
            this.tvIData2.setVisibility(0);
            this.data1.setVisibility(0);
            this.data2.setVisibility(0);
            this.tvType.setVisibility(8);
            this.tvData1.setVisibility(8);
            this.tvData2.setVisibility(8);
            this.type.setVisibility(8);
            this.numType.setVisibility(0);
            return;
        }
    }

    private void setWheelView()
    {
        this.modeSelect.setItemsVisibleCount(6);
        this.modeSelect.setTextSize(1096810496);
        this.modeSelect.setCyclic(0);
        this.modeSelect.setTextColorCenter(android.graphics.Color.rgb(255, 255, 255));
        this.modeSelect.setTextColorOut(android.graphics.Color.rgb(51, 234, 184));
        this.modeSelect.setDividerColor(android.graphics.Color.rgb(51, 234, 184));
        this.modeSelect.setAdapter(new com.cubeSuite.adapter.other.ArrayWheelAdapter(this.modeItems));
        this.modeSelect.setOnItemSelectedListener(new com.cubeSuite.fragment.FootCtrlControlFragment$3(this));
        return;
    }

    private void showKyeCustomDialog(int p4)
    {
        this.selectKeyDialog.setTitle(new StringBuilder("FootSwitch[").append((p4 + 1)).append("]").toString()).showDialog().setListening(new com.cubeSuite.fragment.FootCtrlControlFragment$1(this, p4));
        return;
    }

    private void showPopupWindow()
    {
        int v5_2;
        android.view.View v0_6 = android.view.LayoutInflater.from(this.activity).inflate(2131493056, 0);
        this.mPopWindow = new android.widget.PopupWindow(v0_6, -1, -1, 1);
        android.widget.PopupWindow v1_3 = ((android.widget.ImageView) v0_6.findViewById(2131296515));
        int v3_2 = ((android.widget.ImageView) v0_6.findViewById(2131297048));
        android.view.View v0_2 = v0_6.findViewById(2131296638);
        int v6 = 2131230847;
        if (this.trsMidi != 0) {
            v5_2 = 2131230849;
        } else {
            v5_2 = 2131230847;
        }
        v1_3.setBackgroundResource(v5_2);
        if (this.trsMidi != 1) {
            v6 = 2131230849;
        }
        v3_2.setBackgroundResource(v6);
        v1_3.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda18(this, v1_3, v3_2));
        v3_2.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda19(this, v3_2, v1_3));
        v0_2.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda20(this));
        this.mPopWindow.showAtLocation(android.view.LayoutInflater.from(this.activity).inflate(2131492895, 0), 80, 0, 0);
        return;
    }

    private void showTrsMidiSlect()
    {
        if (this.trsMidiWindow == null) {
            int v2_2;
            this.trsMidiContentView = android.view.LayoutInflater.from(this.activity).inflate(2131493056, 0);
            this.trsMidiWindow = new android.widget.PopupWindow(this.trsMidiContentView, -1, -1, 1);
            this.expressionPedalImage = ((android.widget.ImageView) this.trsMidiContentView.findViewById(2131296515));
            this.trsMidiImage = ((android.widget.ImageView) this.trsMidiContentView.findViewById(2131297048));
            android.widget.ImageView v0_12 = ((android.widget.Button) this.trsMidiContentView.findViewById(2131296353));
            int v4 = 2131230847;
            if (this.trsMidi != 0) {
                v2_2 = 2131230849;
            } else {
                v2_2 = 2131230847;
            }
            this.expressionPedalImage.setBackgroundResource(v2_2);
            if (this.trsMidi != 1) {
                v4 = 2131230849;
            }
            this.trsMidiImage.setBackgroundResource(v4);
            v0_12.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda21(this));
            this.expressionPedalImage.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda23(this));
            this.trsMidiImage.setOnClickListener(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda24(this));
        }
        this.trsMidiWindow.showAtLocation(this.thisView, 80, 0, 0);
        return;
    }

    private void updateMidiInfo()
    {
        int v0 = 0;
        while (v0 < 16) {
            com.cubeSuite.customControl.SlidingDeleteItem v1_19 = this.getMidiCode(v0);
            if (this.groupIndex != 0) {
                if (v1_19.getIsEnable() != 1) {
                    com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem.access$2800(this.midiBList[v0]).setVisibility(8);
                } else {
                    this.midiBList[v0].updateText();
                }
                com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem.access$2800(this.midiAList[v0]).setVisibility(8);
            } else {
                if (v1_19.getIsEnable() != 1) {
                    com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem.access$2800(this.midiAList[v0]).setVisibility(8);
                } else {
                    this.midiAList[v0].updateText();
                }
                com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem.access$2800(this.midiBList[v0]).setVisibility(8);
            }
            v0++;
        }
        this.setBankView();
        return;
    }

    private byte[] x16StringToByte(String p14)
    {
        char[] v1 = new char[16];
        v1 = {48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 65, 66, 67, 68, 69, 70};
        byte v14_1 = p14.toUpperCase().replace("\\s", "").replace("\\n", "");
        byte v14_3 = v14_1.substring(0, Math.min(128, v14_1.length())).toCharArray();
        byte[] v2_2 = new byte[128];
        int v3_1 = v14_3.length;
        int v6 = 0;
        int v8_0 = 0;
        int v9 = 0;
        byte v7_0 = 1;
        while (v6 < v3_1) {
            int v11_0 = 0;
            while (v11_0 < 16) {
                if (v1[v11_0] != v14_3[v6]) {
                    v11_0 = ((byte) (v11_0 + 1));
                } else {
                    if (v8_0 == 0) {
                        v9 = (v11_0 * 16);
                        v8_0 = 1;
                    } else {
                        v2_2[v7_0] = ((byte) (v11_0 + v9));
                        v7_0 = ((byte) (v7_0 + 1));
                        v8_0 = 0;
                    }
                    int v10_1 = v8_0;
                }
                if ((v10_1 == 0) && (v8_0 != 0)) {
                    v8_0 = 0;
                    v9 = 0;
                }
                v6++;
            }
            v10_1 = 0;
        }
        byte v14_4 = (v7_0 + 1);
        byte[] v0_1 = new byte[v14_4];
        System.arraycopy(v2_2, 0, v0_1, 0, v14_4);
        v0_1[0] = ((byte) (v7_0 - 1));
        return v0_1;
    }

    public com.cubeSuite.activitys.BaseDeviceActivity getBaseActivity()
    {
        return this.activity;
    }

    public void initData()
    {
        com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.splitReadData(4, 0, com.cubeSuite.communication.JNIUtils.getFootCtrlSize(), new com.cubeSuite.fragment.FootCtrlControlFragment$2(this));
        return;
    }

    synthetic void lambda$initMidiCode$23$com-cubeSuite-fragment-FootCtrlControlFragment(int p3)
    {
        android.widget.Button v0_0 = this.currentEditInput;
        if (v0_0 != null) {
            if (v0_0 != 1) {
                if (v0_0 != 2) {
                    if (v0_0 == 3) {
                        this.data2.setText(String.valueOf(p3));
                    }
                } else {
                    this.data1.setText(String.valueOf(p3));
                }
            } else {
                this.numType.setText(String.valueOf(p3));
            }
        } else {
            this.channel.setText(String.valueOf((p3 + 1)));
        }
        this.updateCurrentMidiCodeText();
        return;
    }

    synthetic void lambda$initMidiCode$24$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.editMidiCodeFocus(-1);
        this.editMidiCodeWindow.dismiss();
        return;
    }

    synthetic void lambda$initMidiCode$25$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.editMidiCodeFocus(0);
        return;
    }

    synthetic void lambda$initMidiCode$26$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.editMidiCodeFocus(1);
        return;
    }

    synthetic void lambda$initMidiCode$27$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.editMidiCodeFocus(2);
        return;
    }

    synthetic void lambda$initMidiCode$28$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.editMidiCodeFocus(3);
        return;
    }

    synthetic void lambda$initMidiCode$29$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.editMidiCodeFocus(-1);
        this.editMidiCodeWindow.dismiss();
        return;
    }

    synthetic void lambda$initMidiCode$30$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p5)
    {
        com.cubeSuite.entity.footCtrl.MidiCode v5_9 = this.getMidiCode(this.currentMidiCode);
        if (!this.isInterface()) {
            byte[] v0_5 = 0;
            while (v0_5 < this.type.getChildCount()) {
                if (!((android.widget.RadioButton) this.type.getChildAt(v0_5)).isChecked()) {
                    v0_5++;
                } else {
                    v5_9.setType(v0_5);
                    break;
                }
            }
        } else {
            v5_9.setType(Integer.parseInt(String.valueOf(this.numType.getText())));
        }
        int v3_1 = 1;
        if ((v5_9.getType() != 4) || (this.isInterface())) {
            byte[] v0_16 = Integer.parseInt(String.valueOf(this.data1.getText()));
            byte[] v1_13 = Integer.parseInt(String.valueOf(this.data2.getText()));
            v5_9.setChannel((Integer.parseInt(String.valueOf(this.channel.getText())) - 1));
            v5_9.setData1(v0_16);
            v5_9.setData2(v1_13);
            this.editMidiCodeFocus(-1);
            int v2_20 = this.currentFootSwitch;
            com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.footCtrlWriteCustomData(this.footCtrlEntry.getCustomData()[v2_20], v2_20));
            this.updateMidiInfo();
            this.editMidiCodeWindow.dismiss();
            return;
        } else {
            if (v5_9.getType() == 4) {
                if (this.currentMidiCode != 0) {
                    this.currentMidiCode = 0;
                    this.getMidiCode(0).copy(v5_9);
                    v5_9.setIsEnable(0);
                }
                if (this.groupIndex != 0) {
                    this.footCtrlEntry.getSysExB()[this.currentFootSwitch] = this.x16StringToByte(this.etCustomMidiCode.getText().toString());
                } else {
                    this.footCtrlEntry.getSysExA()[this.currentFootSwitch] = this.x16StringToByte(this.etCustomMidiCode.getText().toString());
                }
                while (v3_1 < 16) {
                    this.getMidiCode(v3_1).setIsEnable(0);
                    v3_1++;
                }
            }
            byte[] v1_6;
            int v2_7 = this.currentFootSwitch;
            com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.footCtrlWriteCustomData(this.footCtrlEntry.getCustomData()[v2_7], v2_7));
            if (this.groupIndex != 0) {
                v1_6 = this.footCtrlEntry.getSysExB()[this.currentFootSwitch];
            } else {
                v1_6 = this.footCtrlEntry.getSysExA()[this.currentFootSwitch];
            }
            com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.footCtrlWriteCustomMidi(v1_6, this.currentFootSwitch, this.groupIndex));
            this.updateMidiInfo();
            com.cubeSuite.utils.AppUtil.closeKeybord(this.activity);
            this.editMidiCodeWindow.dismiss();
            return;
        }
    }

    synthetic void lambda$initMidiInfo$15$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.editMidiWindow.dismiss();
        return;
    }

    synthetic void lambda$initMidiInfo$16$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p4)
    {
        this.selectModeWindow.showAtLocation(this.thisView, 80, 0, 0);
        return;
    }

    synthetic void lambda$initMidiInfo$17$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        if (this.groupIndex != 0) {
            this.groupIndex = 0;
            this.updateMidiInfo();
            return;
        } else {
            return;
        }
    }

    synthetic void lambda$initMidiInfo$18$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p2)
    {
        if (this.groupIndex != 1) {
            this.groupIndex = 1;
            this.updateMidiInfo();
            return;
        } else {
            return;
        }
    }

    synthetic void lambda$initMidiInfo$19$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p4)
    {
        if ((!this.isSys()) && (this.getMidiCode(15).getIsEnable() != 1)) {
            int v4_1 = 0;
            while (v4_1 < 16) {
                if (this.getMidiCode(v4_1).getIsEnable() != 0) {
                    v4_1++;
                } else {
                    this.getMidiCode(v4_1).clear();
                    this.getMidiCode(v4_1).setIsEnable(1);
                    com.cubeSuite.fragment.FootCtrlControlFragment$MidiItem.access$2800(this.midiBList[v4_1]).deleteAnimator();
                    break;
                }
            }
            int v2 = this.currentFootSwitch;
            com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.footCtrlWriteCustomData(this.footCtrlEntry.getCustomData()[v2], v2));
            this.updateMidiInfo();
            return;
        } else {
            return;
        }
    }

    synthetic void lambda$initMidiInfo$20$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p2)
    {
        if (!this.isSys()) {
            com.cubeSuite.customControl.AlertDialogUtil.getInstance(this.activity).showDialog().setBtnClick(new com.cubeSuite.fragment.FootCtrlControlFragment$4(this)).setTitle(2131951786).setContent(2131952031).setBtnVisible(com.cubeSuite.customControl.AlertDialogUtil$SelectBtn.ALL_VISIBLE);
            return;
        } else {
            return;
        }
    }

    synthetic void lambda$initMidiMode$21$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.selectModeWindow.dismiss();
        return;
    }

    synthetic void lambda$initMidiMode$22$com-cubeSuite-fragment-FootCtrlControlFragment(int p3, android.view.View p4)
    {
        this.footCtrlEntry.getCustomData()[this.currentFootSwitch].setMode(p3);
        this.setBankView();
        this.btnModeSwitch.setText(this.selectModelItem[p3].getModeText());
        int v1 = this.currentFootSwitch;
        com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.footCtrlWriteCustomData(this.footCtrlEntry.getCustomData()[v1], v1));
        this.setBankView();
        this.selectModeWindow.dismiss();
        return;
    }

    synthetic void lambda$loadView$31$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p4)
    {
        this.currentFootSwitch = 4;
        this.footSwitchText.setText(this.FOOT_SWITCH_NAME[4]);
        this.editMidiWindow.showAtLocation(this.thisView, 80, 0, 0);
        this.updateMidiInfo();
        return;
    }

    synthetic void lambda$setClick$2$com-cubeSuite-fragment-FootCtrlControlFragment(int p1, android.view.View p2)
    {
        this.showButtonCustomFunction(p1);
        return;
    }

    synthetic void lambda$setClick$3$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p3)
    {
        android.widget.TextView v3_0 = this.midiChannelValue;
        if (v3_0 < 15) {
            this.midiChannelValue = (v3_0 + 1);
            com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.bluetoothPedalWriteChannelValue(((byte) this.midiChannelValue)));
            this.sendMidiChannel.setText(String.valueOf((this.midiChannelValue + 1)));
        }
        return;
    }

    synthetic void lambda$setClick$4$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p3)
    {
        android.widget.TextView v3_0 = this.midiChannelValue;
        if (v3_0 > null) {
            this.midiChannelValue = (v3_0 - 1);
            com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.bluetoothPedalWriteChannelValue(((byte) this.midiChannelValue)));
            this.sendMidiChannel.setText(String.valueOf((this.midiChannelValue + 1)));
        }
        return;
    }

    synthetic void lambda$setClick$5$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.showPopupWindow();
        return;
    }

    synthetic void lambda$setClick$6$com-cubeSuite-fragment-FootCtrlControlFragment(int p3, android.view.View p4)
    {
        this.currentFootSwitch = p3;
        this.footSwitchText.setText(this.FOOT_SWITCH_NAME[p3]);
        this.editMidiWindow.showAtLocation(this.thisView, 80, 0, 0);
        this.updateMidiInfo();
        return;
    }

    synthetic void lambda$setClick$7$com-cubeSuite-fragment-FootCtrlControlFragment(int p1, android.view.View p2)
    {
        this.showKyeCustomDialog(p1);
        return;
    }

    synthetic void lambda$setClick$8$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.showTrsMidiSlect();
        return;
    }

    synthetic void lambda$showButtonCustomFunction$0$com-cubeSuite-fragment-FootCtrlControlFragment(int p3, String[] p4, int p5)
    {
        this.customKeypadSelect[p3] = p5;
        com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.bluetoothPedalWriteCustomData(p5, p3));
        this.customKeypad[p3].setText(p4[p5]);
        return;
    }

    synthetic void lambda$showButtonCustomFunction$1$com-cubeSuite-fragment-FootCtrlControlFragment(int p2, android.widget.CompoundButton p3, boolean p4)
    {
        com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.bluetoothPedalWriteToggleData(p4, p2));
        return;
    }

    synthetic void lambda$showPopupWindow$10$com-cubeSuite-fragment-FootCtrlControlFragment(android.widget.ImageView p1, android.widget.ImageView p2, android.view.View p3)
    {
        this.trsMidi = 1;
        p1.setBackgroundResource(2131230847);
        p2.setBackgroundResource(2131230849);
        com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.bluetoothPedalWriteTrsMidi(((byte) this.trsMidi)));
        return;
    }

    synthetic void lambda$showPopupWindow$11$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.mPopWindow.dismiss();
        return;
    }

    synthetic void lambda$showPopupWindow$9$com-cubeSuite-fragment-FootCtrlControlFragment(android.widget.ImageView p1, android.widget.ImageView p2, android.view.View p3)
    {
        this.trsMidi = 0;
        p1.setBackgroundResource(2131230847);
        p2.setBackgroundResource(2131230849);
        com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.bluetoothPedalWriteTrsMidi(((byte) this.trsMidi)));
        return;
    }

    synthetic void lambda$showTrsMidiSlect$12$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p1)
    {
        this.trsMidiWindow.dismiss();
        return;
    }

    synthetic void lambda$showTrsMidiSlect$13$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p3)
    {
        this.trsMidi = 0;
        this.expressionPedalImage.setBackgroundResource(2131230847);
        this.trsMidiImage.setBackgroundResource(2131230849);
        com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.bluetoothPedalWriteTrsMidi(((byte) this.trsMidi)));
        return;
    }

    synthetic void lambda$showTrsMidiSlect$14$com-cubeSuite-fragment-FootCtrlControlFragment(android.view.View p3)
    {
        this.trsMidi = 1;
        this.trsMidiImage.setBackgroundResource(2131230847);
        this.expressionPedalImage.setBackgroundResource(2131230849);
        com.cubeSuite.fragment.FootCtrlControlFragment.communicationUtil.writeDataToBle(this.fcc.bluetoothPedalWriteTrsMidi(((byte) this.trsMidi)));
        return;
    }

    public android.view.View onCreateView(android.view.LayoutInflater p2, android.view.ViewGroup p3, android.os.Bundle p4)
    {
        super.onCreate(p4);
        this.thisView = p2.inflate(2131492932, p3, 0);
        this.activity = ((com.cubeSuite.activitys.ControlAndPdfActivity) this.getActivity());
        this.selectKeyDialog = new com.cubeSuite.customControl.SelectKeyDialog(this.thisView.getContext());
        this.loadView();
        this.initScrollPicker();
        this.setClick();
        this.initMidiInfo();
        this.initMidiList();
        this.initMidiMode();
        this.initMidiCode();
        this.updateMidiInfo();
        if (this.progressDialog == null) {
            android.view.View v2_5 = new android.app.ProgressDialog(this.thisView.getContext());
            this.progressDialog = v2_5;
            v2_5.setMessage(this.getString(2131951683));
        }
        return this.thisView;
    }

    public void onDestroy()
    {
        this.progressDialog.dismiss();
        super.onDestroy();
        return;
    }

    public void showButtonCustomFunction(int p7)
    {
        com.cubeSuite.customControl.ListAlertDialog v0_0 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.MIDICC_STR;
        com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda9 v1_0 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.CUSTOM_COMMAND_STR;
        if (p7 == 4) {
            v0_0 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.MIDICC_STR_KNOB;
            v1_0 = com.cubeSuite.Global.Global$BluetoothPedalCustomCommand.CUSTOM_COMMAND_STR_KNOB;
        }
        com.cubeSuite.adapter.other.BluetoothPedalMIDICCSelectAdapter v3_2 = v0_0.length;
        com.cubeSuite.customControl.ListAlertDialog[] v4_9 = this.customKeypadList[p7];
        if (v4_9 != null) {
            v4_9.showDialog();
            return;
        } else {
            com.cubeSuite.customControl.ListAlertDialog[] v4_0 = this.customKeypadSelect;
            if (v4_0[p7] > v3_2) {
                v4_0[p7] = v3_2;
            }
            com.cubeSuite.adapter.other.BluetoothPedalMIDICCSelectAdapter v3_1 = new com.cubeSuite.adapter.other.BluetoothPedalMIDICCSelectAdapter(this.customKeypadSelect[p7], java.util.Arrays.asList(v0_0), java.util.Arrays.asList(v1_0));
            com.cubeSuite.customControl.ListAlertDialog v0_2 = 1;
            v3_1.setHasStableIds(1);
            v3_1.setItemClick(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda8(this, p7, v1_0));
            this.customKeypadList[p7] = new com.cubeSuite.customControl.ListAlertDialog(this.thisView.getContext()).setTitle(String.valueOf(((char) (p7 + 65)))).setContent(v3_1).showDialog();
            if (p7 != 4) {
                if (this.toggleSelect[p7] != 1) {
                    v0_2 = 0;
                }
                this.customKeypadList[p7].setToggleChecked(v0_2);
                this.customKeypadList[p7].setToggleClick(new com.cubeSuite.fragment.FootCtrlControlFragment$$ExternalSyntheticLambda9(this, p7));
            }
            return;
        }
    }

    public void updateCurrentMidiCodeText()
    {
        String v0_8 = ((String) this.channel.getText());
        String v2_1 = 0;
        while (v2_1 < this.type.getChildCount()) {
            if (!((android.widget.RadioButton) this.type.getChildAt(v2_1)).isChecked()) {
                v2_1++;
            } else {
                String v2_0 = com.cubeSuite.fragment.FootCtrlControlFragment.MIDI_TYPE[v2_1];
            }
            String v3_8 = ((String) this.data1.getText());
            String v4_2 = ((String) this.data2.getText());
            if (!this.isInterface()) {
                if (this.getMidiCode(this.currentMidiCode).getType() != 4) {
                    this.tvMidiInfo.setText(new StringBuilder("[").append((this.currentMidiCode + 1)).append("]   ").append(v0_8).append("   ").append(v2_0).append("   ").append(v3_8).append("   ").append(v4_2).toString());
                    return;
                } else {
                    this.tvMidiInfo.setText(new StringBuilder("send:").append(this.byteToX16String(this.getSysEx())).toString());
                    return;
                }
            } else {
                this.tvMidiInfo.setText(new StringBuilder("[").append((this.currentMidiCode + 1)).append("]   ").append(v0_8).append("   CC   ").append(((String) this.numType.getText())).append("   ").append(v3_8).append("~").append(v4_2).toString());
                return;
            }
        }
        v2_0 = "";
    }
}
