package com.cubeSuite.entity.fc2;
public class FC2Struct {
    public final int DATA_SIZE;
    public com.cubeSuite.entity.fc2.AdvCustomStruct1[][] advCustom1;
    public com.cubeSuite.entity.addrData.AddrU8[] bankMax;
    public com.cubeSuite.entity.addrData.AddrU8 bankMidi;
    public com.cubeSuite.entity.addrData.AddrU8 ch;
    public com.cubeSuite.entity.addrData.AddrU8[][][] customKey;
    public com.cubeSuite.entity.addrData.AddrU8 hidpage;
    public com.cubeSuite.entity.fc2.MidiCodeStruct[] midiCodeTap;
    public com.cubeSuite.entity.fc2.MixKeyStruct[][] mixKey;
    public com.cubeSuite.entity.addrData.AddrU8 mixpage;
    public com.cubeSuite.entity.addrData.AddrU8 pcdisp;
    public com.cubeSuite.entity.addrData.AddrU8 polar;
    public com.cubeSuite.entity.addrData.AddrU8 state;
    public com.cubeSuite.entity.addrData.AddrU8 trs;
    public com.cubeSuite.entity.addrData.AddrU8[][] usr;
    public com.cubeSuite.entity.addrData.AddrU8 usrpage;

    public FC2Struct()
    {
        int v1_5 = new int[2];
        v1_5[1] = 2;
        v1_5[0] = 5;
        this.usr = ((com.cubeSuite.entity.addrData.AddrU8[][]) reflect.Array.newInstance(com.cubeSuite.entity.addrData.AddrU8, v1_5));
        int v1_3 = new com.cubeSuite.entity.fc2.MidiCodeStruct[16];
        this.midiCodeTap = v1_3;
        int v1_4 = new int[2];
        v1_4[1] = 4;
        v1_4[0] = 8;
        this.advCustom1 = ((com.cubeSuite.entity.fc2.AdvCustomStruct1[][]) reflect.Array.newInstance(com.cubeSuite.entity.fc2.AdvCustomStruct1, v1_4));
        com.cubeSuite.entity.addrData.AddrU8[][][] v5_2 = new int[3];
        v5_2[2] = 3;
        v5_2[1] = 4;
        v5_2[0] = 6;
        this.customKey = ((com.cubeSuite.entity.addrData.AddrU8[][][]) reflect.Array.newInstance(com.cubeSuite.entity.addrData.AddrU8, v5_2));
        int v0_1 = new int[2];
        v0_1[1] = 4;
        v0_1[0] = 6;
        this.mixKey = ((com.cubeSuite.entity.fc2.MixKeyStruct[][]) reflect.Array.newInstance(com.cubeSuite.entity.fc2.MixKeyStruct, v0_1));
        int v0_4 = new com.cubeSuite.entity.addrData.AddrU8[3];
        this.bankMax = v0_4;
        this.DATA_SIZE = 23646;
        int v0_6 = 0;
        while(true) {
            int v1_9 = this.midiCodeTap;
            if (v0_6 >= v1_9.length) {
                break;
            }
            v1_9[v0_6] = new com.cubeSuite.entity.fc2.MidiCodeStruct();
            v0_6++;
        }
        int v0_7 = 0;
        while (v0_7 < this.advCustom1.length) {
            int v1_15 = 0;
            while(true) {
                com.cubeSuite.entity.fc2.MixKeyStruct[] v2_6 = this.advCustom1[v0_7];
                if (v1_15 >= v2_6.length) {
                    break;
                }
                v2_6[v1_15] = new com.cubeSuite.entity.fc2.AdvCustomStruct1();
                v1_15++;
            }
            v0_7++;
        }
        int v0_8 = 0;
        while (v0_8 < this.mixKey.length) {
            int v1_14 = 0;
            while(true) {
                com.cubeSuite.entity.fc2.MixKeyStruct[] v2_4 = this.mixKey[v0_8];
                if (v1_14 >= v2_4.length) {
                    break;
                }
                v2_4[v1_14] = new com.cubeSuite.entity.fc2.MixKeyStruct();
                v1_14++;
            }
            v0_8++;
        }
        return;
    }

    public java.util.ArrayList getData()
    {
        java.util.ArrayList v0_1 = new java.util.ArrayList();
        v0_1.add(Byte.valueOf(this.state.getByteData()));
        v0_1.add(Byte.valueOf(this.trs.getByteData()));
        v0_1.add(Byte.valueOf(this.ch.getByteData()));
        Byte v1_6 = 0;
        int v2_0 = 0;
        while (v2_0 < this.usr.length) {
            int v3_37 = 0;
            while(true) {
                int v4_34 = this.usr[v2_0];
                if (v3_37 >= v4_34.length) {
                    break;
                }
                v0_1.add(Byte.valueOf(v4_34[v3_37].getByteData()));
                v3_37++;
            }
            v2_0++;
        }
        int v2_1 = 0;
        while(true) {
            int v3_3 = this.midiCodeTap;
            if (v2_1 >= v3_3.length) {
                break;
            }
            v0_1.add(Byte.valueOf(v3_3[v2_1].isEnable.getByteData()));
            v0_1.add(Byte.valueOf(this.midiCodeTap[v2_1].channel.getByteData()));
            v0_1.add(Byte.valueOf(this.midiCodeTap[v2_1].type.getByteData()));
            v0_1.add(Byte.valueOf(this.midiCodeTap[v2_1].data1.getByteData()));
            v0_1.add(Byte.valueOf(this.midiCodeTap[v2_1].data2.getByteData()));
            v2_1++;
        }
        int v2_2 = 0;
        while (v2_2 < this.advCustom1.length) {
            int v3_7 = 0;
            while(true) {
                int v4_24 = this.advCustom1[v2_2];
                if (v3_7 >= v4_24.length) {
                    break;
                }
                v0_1.add(Byte.valueOf(v4_24[v3_7].mode.getByteData()));
                int v4_29 = 0;
                while (v4_29 < this.advCustom1[v2_2][v3_7].midiCodeA.length) {
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeA[v4_29].isEnable.getByteData()));
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeA[v4_29].channel.getByteData()));
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeA[v4_29].type.getByteData()));
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeA[v4_29].data1.getByteData()));
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeA[v4_29].data2.getByteData()));
                    v4_29++;
                }
                int v4_30 = 0;
                while (v4_30 < this.advCustom1[v2_2][v3_7].midiCodeB.length) {
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeB[v4_30].isEnable.getByteData()));
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeB[v4_30].channel.getByteData()));
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeB[v4_30].type.getByteData()));
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeB[v4_30].data1.getByteData()));
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].midiCodeB[v4_30].data2.getByteData()));
                    v4_30++;
                }
                int v4_31 = 0;
                while (v4_31 < this.advCustom1[v2_2][v3_7].sysExA.length) {
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].sysExA[v4_31]));
                    v4_31++;
                }
                int v4_32 = 0;
                while (v4_32 < this.advCustom1[v2_2][v3_7].sysExB.length) {
                    v0_1.add(Byte.valueOf(this.advCustom1[v2_2][v3_7].sysExB[v4_32]));
                    v4_32++;
                }
                v3_7++;
            }
            v2_2++;
        }
        int v2_3 = 0;
        while (v2_3 < this.customKey.length) {
            int v3_6 = 0;
            while (v3_6 < this.customKey[v2_3].length) {
                int v4_22 = 0;
                while(true) {
                    Byte v5_142 = this.customKey[v2_3][v3_6];
                    if (v4_22 >= v5_142.length) {
                        break;
                    }
                    v0_1.add(Byte.valueOf(v5_142[v4_22].getByteData()));
                    v4_22++;
                }
                v3_6++;
            }
            v2_3++;
        }
        int v2_4 = 0;
        while (v2_4 < this.mixKey.length) {
            int v3_0 = 0;
            while(true) {
                int v4_39 = this.mixKey[v2_4];
                if (v3_0 >= v4_39.length) {
                    break;
                }
                v0_1.add(Byte.valueOf(v4_39[v3_0].type.getByteData()));
                v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].tunerdat.getByteData()));
                int v4_6 = 0;
                while (v4_6 < this.mixKey[v2_4][v3_0].hidkeydat.length) {
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].hidkeydat[v4_6].getByteData()));
                    v4_6++;
                }
                v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.mode.getByteData()));
                int v4_14 = 0;
                while (v4_14 < this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeA.length) {
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeA[v4_14].isEnable.getByteData()));
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeA[v4_14].channel.getByteData()));
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeA[v4_14].type.getByteData()));
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeA[v4_14].data1.getByteData()));
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeA[v4_14].data2.getByteData()));
                    v4_14++;
                }
                int v4_15 = 0;
                while (v4_15 < this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeB.length) {
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeB[v4_15].isEnable.getByteData()));
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeB[v4_15].channel.getByteData()));
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeB[v4_15].type.getByteData()));
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeB[v4_15].data1.getByteData()));
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.midiCodeB[v4_15].data2.getByteData()));
                    v4_15++;
                }
                int v4_16 = 0;
                while (v4_16 < this.mixKey[v2_4][v3_0].midiUsrPlus.sysExA.length) {
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.sysExA[v4_16]));
                    v4_16++;
                }
                int v4_17 = 0;
                while (v4_17 < this.mixKey[v2_4][v3_0].midiUsrPlus.sysExB.length) {
                    v0_1.add(Byte.valueOf(this.mixKey[v2_4][v3_0].midiUsrPlus.sysExB[v4_17]));
                    v4_17++;
                }
                v3_0++;
            }
            v2_4++;
        }
        while(true) {
            int v2_5 = this.bankMax;
            if (v1_6 >= v2_5.length) {
                break;
            }
            v0_1.add(Byte.valueOf(v2_5[v1_6].getByteData()));
            v1_6++;
        }
        v0_1.add(Byte.valueOf(this.usrpage.getByteData()));
        v0_1.add(Byte.valueOf(this.hidpage.getByteData()));
        v0_1.add(Byte.valueOf(this.polar.getByteData()));
        v0_1.add(Byte.valueOf(this.bankMidi.getByteData()));
        v0_1.add(Byte.valueOf(this.pcdisp.getByteData()));
        v0_1.add(Byte.valueOf(this.mixpage.getByteData()));
        return v0_1;
    }

    public boolean setData(byte[] p15)
    {
        com.cubeSuite.entity.addrData.AddrU8 v2_0 = 0;
        if (p15.length == 23646) {
            this.state = new com.cubeSuite.entity.addrData.AddrU8(p15[0], ((long) 0), 0, 12);
            int v0_1 = 1;
            this.trs = new com.cubeSuite.entity.addrData.AddrU8(p15[v0_1], ((long) v0_1), 0, 1);
            int v1_3 = 2;
            this.ch = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_3], ((long) v1_3), 0, 16);
            int v1_2 = 3;
            int v3_0 = 0;
            while (v3_0 < this.usr.length) {
                int v4_22 = 0;
                while(true) {
                    int v5_37 = this.usr[v3_0];
                    if (v4_22 >= v5_37.length) {
                        break;
                    }
                    v5_37[v4_22] = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2));
                    v1_2++;
                    v4_22++;
                }
                v3_0++;
            }
            int v3_1 = 0;
            while(true) {
                int v4_6 = this.midiCodeTap;
                if (v3_1 >= v4_6.length) {
                    break;
                }
                v4_6[v3_1].isEnable = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2), 0, 1);
                int v4_18 = (v1_2 + 1);
                this.midiCodeTap[v3_1].channel = new com.cubeSuite.entity.addrData.AddrU8(p15[v4_18], ((long) v4_18), 0, 15);
                int v4_19 = (v1_2 + 2);
                this.midiCodeTap[v3_1].type = new com.cubeSuite.entity.addrData.AddrU8(p15[v4_19], ((long) v4_19));
                int v4_20 = (v1_2 + 3);
                this.midiCodeTap[v3_1].data1 = new com.cubeSuite.entity.addrData.AddrU8(p15[v4_20], ((long) v4_20));
                int v4_21 = (v1_2 + 4);
                this.midiCodeTap[v3_1].data2 = new com.cubeSuite.entity.addrData.AddrU8(p15[v4_21], ((long) v4_21));
                v1_2 += 5;
                v3_1++;
            }
            int v3_3 = 0;
            while (v3_3 < this.advCustom1.length) {
                int v4_7 = 0;
                while(true) {
                    int v5_20 = this.advCustom1[v3_3];
                    if (v4_7 >= v5_20.length) {
                        break;
                    }
                    v5_20[v4_7].mode = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2));
                    v1_2++;
                    int v5_22 = 0;
                    while (v5_22 < this.advCustom1[v3_3][v4_7].midiCodeA.length) {
                        this.advCustom1[v3_3][v4_7].midiCodeA[v5_22].isEnable = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2), 0, 1);
                        byte[] v6_120 = (v1_2 + 1);
                        this.advCustom1[v3_3][v4_7].midiCodeA[v5_22].channel = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_120], ((long) v6_120), 0, 15);
                        byte[] v6_121 = (v1_2 + 2);
                        this.advCustom1[v3_3][v4_7].midiCodeA[v5_22].type = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_121], ((long) v6_121));
                        byte[] v6_122 = (v1_2 + 3);
                        this.advCustom1[v3_3][v4_7].midiCodeA[v5_22].data1 = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_122], ((long) v6_122));
                        byte[] v6_123 = (v1_2 + 4);
                        this.advCustom1[v3_3][v4_7].midiCodeA[v5_22].data2 = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_123], ((long) v6_123));
                        v1_2 += 5;
                        v5_22++;
                    }
                    int v5_23 = 0;
                    while (v5_23 < this.advCustom1[v3_3][v4_7].midiCodeB.length) {
                        this.advCustom1[v3_3][v4_7].midiCodeB[v5_23].isEnable = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2), 0, 1);
                        byte[] v6_111 = (v1_2 + 1);
                        this.advCustom1[v3_3][v4_7].midiCodeB[v5_23].channel = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_111], ((long) v6_111), 0, 15);
                        byte[] v6_112 = (v1_2 + 2);
                        this.advCustom1[v3_3][v4_7].midiCodeB[v5_23].type = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_112], ((long) v6_112));
                        byte[] v6_113 = (v1_2 + 3);
                        this.advCustom1[v3_3][v4_7].midiCodeB[v5_23].data1 = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_113], ((long) v6_113));
                        byte[] v6_114 = (v1_2 + 4);
                        this.advCustom1[v3_3][v4_7].midiCodeB[v5_23].data2 = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_114], ((long) v6_114));
                        v1_2 += 5;
                        v5_23++;
                    }
                    int v5_24 = 0;
                    while (v5_24 < this.advCustom1[v3_3][v4_7].sysExA.length) {
                        this.advCustom1[v3_3][v4_7].sysExA[v5_24] = p15[v1_2];
                        v1_2++;
                        v5_24++;
                    }
                    int v5_25 = 0;
                    while (v5_25 < this.advCustom1[v3_3][v4_7].sysExB.length) {
                        this.advCustom1[v3_3][v4_7].sysExB[v5_25] = p15[v1_2];
                        v1_2++;
                        v5_25++;
                    }
                    v4_7++;
                }
                v3_3++;
            }
            int v3_2 = 0;
            while (v3_2 < this.customKey.length) {
                int v4_5 = 0;
                while (v4_5 < this.customKey[v3_2].length) {
                    int v5_17 = 0;
                    while(true) {
                        byte[] v6_74 = this.customKey[v3_2][v4_5];
                        if (v5_17 >= v6_74.length) {
                            break;
                        }
                        v6_74[v5_17] = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2));
                        v1_2++;
                        v5_17++;
                    }
                    v4_5++;
                }
                v3_2++;
            }
            int v3_5 = 0;
            while (v3_5 < this.mixKey.length) {
                int v4_1 = 0;
                while(true) {
                    int v5_45 = this.mixKey[v3_5];
                    if (v4_1 >= v5_45.length) {
                        break;
                    }
                    v5_45[v4_1].type = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2));
                    int v5_1 = (v1_2 + 1);
                    this.mixKey[v3_5][v4_1].tunerdat = new com.cubeSuite.entity.addrData.AddrU8(p15[v5_1], ((long) v5_1));
                    int v1_1 = (v1_2 + 2);
                    int v5_2 = 0;
                    while (v5_2 < this.mixKey[v3_5][v4_1].hidkeydat.length) {
                        this.mixKey[v3_5][v4_1].hidkeydat[v5_2] = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_1], ((long) v1_1));
                        v1_1++;
                        v5_2++;
                    }
                    this.mixKey[v3_5][v4_1].midiUsrPlus.mode = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_1], ((long) v1_1), 0, 1);
                    v1_2 = (v1_1 + 1);
                    int v5_8 = 0;
                    while (v5_8 < this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeA.length) {
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeA[v5_8].isEnable = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2), 0, 1);
                        byte[] v6_64 = (v1_2 + 1);
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeA[v5_8].channel = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_64], ((long) v6_64), 0, 15);
                        byte[] v6_65 = (v1_2 + 2);
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeA[v5_8].type = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_65], ((long) v6_65));
                        byte[] v6_66 = (v1_2 + 3);
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeA[v5_8].data1 = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_66], ((long) v6_66));
                        byte[] v6_67 = (v1_2 + 4);
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeA[v5_8].data2 = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_67], ((long) v6_67));
                        v1_2 += 5;
                        v5_8++;
                    }
                    int v5_9 = 0;
                    while (v5_9 < this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeB.length) {
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeB[v5_9].isEnable = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2), 0, 1);
                        byte[] v6_53 = (v1_2 + 1);
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeB[v5_9].channel = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_53], ((long) v6_53), 0, 15);
                        byte[] v6_55 = (v1_2 + 2);
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeB[v5_9].type = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_55], ((long) v6_55));
                        byte[] v6_56 = (v1_2 + 3);
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeB[v5_9].data1 = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_56], ((long) v6_56));
                        byte[] v6_57 = (v1_2 + 4);
                        this.mixKey[v3_5][v4_1].midiUsrPlus.midiCodeB[v5_9].data2 = new com.cubeSuite.entity.addrData.AddrU8(p15[v6_57], ((long) v6_57));
                        v1_2 += 5;
                        v5_9++;
                    }
                    int v5_10 = 0;
                    while (v5_10 < this.mixKey[v3_5][v4_1].midiUsrPlus.sysExA.length) {
                        this.mixKey[v3_5][v4_1].midiUsrPlus.sysExA[v5_10] = p15[v1_2];
                        v1_2++;
                        v5_10++;
                    }
                    int v5_11 = 0;
                    while (v5_11 < this.mixKey[v3_5][v4_1].midiUsrPlus.sysExB.length) {
                        this.mixKey[v3_5][v4_1].midiUsrPlus.sysExB[v5_11] = p15[v1_2];
                        v1_2++;
                        v5_11++;
                    }
                    v4_1++;
                }
                v3_5++;
            }
            while(true) {
                int v3_6 = this.bankMax;
                if (v2_0 >= v3_6.length) {
                    break;
                }
                v3_6[v2_0] = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2));
                v1_2++;
                v2_0++;
            }
            this.usrpage = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_2], ((long) v1_2));
            com.cubeSuite.entity.addrData.AddrU8 v2_3 = (v1_2 + 1);
            this.hidpage = new com.cubeSuite.entity.addrData.AddrU8(p15[v2_3], ((long) v2_3));
            com.cubeSuite.entity.addrData.AddrU8 v2_4 = (v1_2 + 2);
            this.polar = new com.cubeSuite.entity.addrData.AddrU8(p15[v2_4], ((long) v2_4));
            com.cubeSuite.entity.addrData.AddrU8 v2_5 = (v1_2 + 3);
            this.bankMidi = new com.cubeSuite.entity.addrData.AddrU8(p15[v2_5], ((long) v2_5));
            com.cubeSuite.entity.addrData.AddrU8 v2_6 = (v1_2 + 4);
            this.pcdisp = new com.cubeSuite.entity.addrData.AddrU8(p15[v2_6], ((long) v2_6));
            int v1_4 = (v1_2 + 5);
            this.mixpage = new com.cubeSuite.entity.addrData.AddrU8(p15[v1_4], ((long) v1_4));
            return 1;
        } else {
            return 0;
        }
    }
}
