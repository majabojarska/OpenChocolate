package com.cubeSuite.entity.fc2;
public class AdvCustomStruct1 {
    public com.cubeSuite.entity.fc2.MidiCodeStruct[] midiCodeA;
    public com.cubeSuite.entity.fc2.MidiCodeStruct[] midiCodeB;
    public com.cubeSuite.entity.addrData.AddrU8 mode;
    public byte[] sysExA;
    public byte[] sysExB;

    public AdvCustomStruct1()
    {
        com.cubeSuite.entity.fc2.MidiCodeStruct[] v1_2 = new com.cubeSuite.entity.fc2.MidiCodeStruct[16];
        this.midiCodeA = v1_2;
        int v0_2 = new com.cubeSuite.entity.fc2.MidiCodeStruct[16];
        this.midiCodeB = v0_2;
        com.cubeSuite.entity.fc2.MidiCodeStruct[] v1_3 = new byte[128];
        this.sysExA = v1_3;
        int v0_4 = new byte[128];
        this.sysExB = v0_4;
        int v0_1 = 0;
        com.cubeSuite.entity.fc2.MidiCodeStruct[] v1_0 = 0;
        while(true) {
            com.cubeSuite.entity.fc2.MidiCodeStruct v2_0 = this.midiCodeA;
            if (v1_0 >= v2_0.length) {
                break;
            }
            v2_0[v1_0] = new com.cubeSuite.entity.fc2.MidiCodeStruct();
            v1_0++;
        }
        while(true) {
            com.cubeSuite.entity.fc2.MidiCodeStruct[] v1_1 = this.midiCodeB;
            if (v0_1 >= v1_1.length) {
                break;
            }
            v1_1[v0_1] = new com.cubeSuite.entity.fc2.MidiCodeStruct();
            v0_1++;
        }
        return;
    }
}
