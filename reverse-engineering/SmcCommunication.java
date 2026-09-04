package com.cubeSuite.communication;
public class SmcCommunication {
    private com.cubeSuite.communication.CommunicationUtil cu;

    public SmcCommunication(com.cubeSuite.communication.CommunicationUtil p1)
    {
        this.cu = p1;
        return;
    }

    public void resetFactory(byte[] p7, com.cubeSuite.callback.Callback$BleCommunicationCallback p8)
    {
        this.cu.splitWriteData(5, p7, 0, p8);
        return;
    }

    public void saveConfig(com.cubeSuite.callback.Callback$BleCommunicationCallback p7)
    {
        byte[] v2 = new byte[0];
        this.cu.splitWriteData(5, v2, 0, p7);
        return;
    }

    public void sendDataToDevice(byte p2, long p3, byte[] p5)
    {
        this.cu.splitWriteData(p2, p5, p3);
        return;
    }

    public void sendSysEx(com.cubeSuite.entity.SmcMixerEntry.SmcSys p6)
    {
        int v1_1 = 1;
        long v0_4 = (p6.len.getData() + 1);
        byte[] v2 = new byte[v0_4];
        while (v1_1 < v0_4) {
            v2[v1_1] = ((byte) p6.val[(v1_1 - 1)].getData());
            v1_1++;
        }
        v2[0] = ((byte) p6.len.getData());
        this.sendDataToDevice(5, p6.len.getAddr(), v2);
        return;
    }

    public void sendUsrU8(com.cubeSuite.entity.addrData.AddrU8 p5)
    {
        long v0 = p5.getAddr();
        byte[] v2_1 = new byte[1];
        v2_1[0] = ((byte) p5.getData());
        this.sendDataToDevice(5, v0, v2_1);
        return;
    }
}
