package com.cubeSuite.communication;
public class Communication {
    private static final byte CMD_ERASE = 0x21;
    private static final byte CMD_MIDI_WRITE = 0x15;
    public static final byte CMD_QUERY_NAME_VER = 0x11;
    private static final Byte CMD_Q_CODEC_VAL = None;
    private static final Byte CMD_Q_DEV_TYPE = None;
    private static final Byte CMD_Q_FIRMWARE_VER = None;
    private static final Byte CMD_Q_NAME_AND_VER = None;
    private static final Byte CMD_Q_OTHER_INFO = None;
    private static final Byte CMD_Q_SHORTE_MSG = None;
    private static final Byte CMD_Q_SOUND_DATA_ADDR = None;
    public static final byte CMD_READ = 0x23;
    private static final byte CMD_WRITE = 0x22;
    public static final byte DEV_EXT = 0x4;
    public static final byte EFF_EXT = 0x3;
    public static final byte EXT_CNT = 0x8;
    public static final byte HEAD_ONE = 0x0;
    public static final byte HEAD_TWO = 0x59;
    public static final byte NAND_EXT = 0x1;
    public static final byte NOR_EXT = 0x0;
    private static final int REQ_HEAD_START = 6;
    public static final byte RSV1_EXT = 0x6;
    public static final byte RSV2_EXT = 0x7;
    public static final byte SD_EXT = 0x2;
    public static final byte USR_EXT = 0x5;

    static Communication()
    {
        com.cubeSuite.communication.Communication.CMD_Q_NAME_AND_VER = Byte.valueOf(17);
        Byte v0_10 = Byte.valueOf(18);
        com.cubeSuite.communication.Communication.CMD_Q_SHORTE_MSG = v0_10;
        com.cubeSuite.communication.Communication.CMD_Q_OTHER_INFO = v0_10;
        com.cubeSuite.communication.Communication.CMD_Q_FIRMWARE_VER = Byte.valueOf(19);
        com.cubeSuite.communication.Communication.CMD_Q_DEV_TYPE = Byte.valueOf(23);
        com.cubeSuite.communication.Communication.CMD_Q_SOUND_DATA_ADDR = Byte.valueOf(27);
        com.cubeSuite.communication.Communication.CMD_Q_CODEC_VAL = Byte.valueOf(32);
        return;
    }

    public Communication()
    {
        return;
    }

    static void addAddr(java.util.List p6, long p7)
    {
        byte v3_4 = ((byte) ((int) ((p7 >> 8) & 255)));
        byte v4_3 = ((byte) ((int) ((p7 >> 16) & 255)));
        Byte v7_4 = ((byte) ((int) ((p7 >> 24) & 255)));
        p6.add(Byte.valueOf(((byte) ((int) (p7 & 255)))));
        p6.add(Byte.valueOf(v3_4));
        p6.add(Byte.valueOf(v4_3));
        p6.add(Byte.valueOf(v7_4));
        return;
    }

    static void addChecksum(java.util.List p3)
    {
        Byte v0_5 = p3.subList(6, p3.size()).iterator();
        byte v1_2 = 0;
        while (v0_5.hasNext()) {
            v1_2 = ((byte) (v1_2 + ((Byte) v0_5.next()).byteValue()));
        }
        p3.add(Byte.valueOf(((byte) (~ v1_2))));
        return;
    }

    private static void addHead(java.util.List p1)
    {
        p1.add(Byte.valueOf(0));
        p1.add(Byte.valueOf(89));
        return;
    }

    private static void addLen(java.util.List p2, int p3)
    {
        byte v1_2 = ((byte) ((p3 >> 8) & 255));
        Byte v3_4 = ((byte) ((p3 >> 16) & 255));
        p2.add(Byte.valueOf(((byte) (p3 & 255))));
        p2.add(Byte.valueOf(v1_2));
        p2.add(Byte.valueOf(v3_4));
        return;
    }

    public static byte[] byteListToByteArr(java.util.List p4)
    {
        int v0 = p4.size();
        byte[] v1 = new byte[v0];
        int v2 = 0;
        while (v2 < v0) {
            v1[v2] = ((Byte) p4.get(v2)).byteValue();
            v2++;
        }
        return v1;
    }

    public static int getAddr(byte[] p4)
    {
        return (((p4[10] & 255) << 24) | (((p4[7] & 255) | ((p4[8] & 255) << 8)) | ((p4[9] & 255) << 16)));
    }

    public static long getAllLen(byte[] p8)
    {
        return (((((long) p8[3]) & 255) | ((((long) p8[4]) & 255) << 8)) | ((255 & ((long) p8[5])) << 16));
    }

    public static long getLen(byte[] p6)
    {
        return ((((long) (p6[11] & 255)) | ((long) ((p6[12] & 255) << 8))) | ((long) ((p6[13] & 255) << 16)));
    }

    public static byte[] makeCustomErasePacket(byte p2, long p3)
    {
        java.util.ArrayList v0_1 = new java.util.ArrayList(10);
        com.cubeSuite.communication.Communication.addHead(v0_1);
        v0_1.add(Byte.valueOf(33));
        com.cubeSuite.communication.Communication.addLen(v0_1, 5);
        v0_1.add(Byte.valueOf(p2));
        com.cubeSuite.communication.Communication.addAddr(v0_1, p3);
        com.cubeSuite.communication.Communication.addChecksum(v0_1);
        return com.cubeSuite.communication.Communication.byteListToByteArr(v0_1);
    }

    public static byte[] makeQueryNameAndVerPacket()
    {
        byte[] v0_1 = new java.util.ArrayList();
        com.cubeSuite.communication.Communication.addHead(v0_1);
        v0_1.add(Byte.valueOf(17));
        com.cubeSuite.communication.Communication.addLen(v0_1, 0);
        com.cubeSuite.communication.Communication.addChecksum(v0_1);
        return com.cubeSuite.communication.Communication.byteListToByteArr(v0_1);
    }

    public static byte[] makeQueryPacket(byte p1)
    {
        java.util.ArrayList v0_1 = new java.util.ArrayList();
        com.cubeSuite.communication.Communication.addHead(v0_1);
        v0_1.add(Byte.valueOf(p1));
        com.cubeSuite.communication.Communication.addLen(v0_1, 0);
        com.cubeSuite.communication.Communication.addChecksum(v0_1);
        return com.cubeSuite.communication.Communication.byteListToByteArr(v0_1);
    }

    public static byte[] makeReadPacket(long p1, int p3)
    {
        return com.cubeSuite.communication.Communication.makeReadPacketByType(4, p1, p3);
    }

    public static byte[] makeReadPacketByType(byte p2, long p3, int p5)
    {
        java.util.ArrayList v0_1 = new java.util.ArrayList();
        com.cubeSuite.communication.Communication.addHead(v0_1);
        v0_1.add(Byte.valueOf(35));
        com.cubeSuite.communication.Communication.addLen(v0_1, 8);
        v0_1.add(Byte.valueOf(p2));
        com.cubeSuite.communication.Communication.addAddr(v0_1, p3);
        com.cubeSuite.communication.Communication.addLen(v0_1, p5);
        com.cubeSuite.communication.Communication.addChecksum(v0_1);
        return com.cubeSuite.communication.Communication.byteListToByteArr(v0_1);
    }

    public static byte[] makeReadPacketToRAM(long p1, int p3)
    {
        return com.cubeSuite.communication.Communication.makeReadPacketByType(6, p1, p3);
    }

    public static byte[] makeWriteMidiPacket(byte[] p3, int p4)
    {
        java.util.ArrayList v0_1 = new java.util.ArrayList();
        com.cubeSuite.communication.Communication.addHead(v0_1);
        v0_1.add(Byte.valueOf(21));
        com.cubeSuite.communication.Communication.addLen(v0_1, p4);
        int v4_1 = p3.length;
        int v1_0 = 0;
        while (v1_0 < v4_1) {
            v0_1.add(Byte.valueOf(p3[v1_0]));
            v1_0++;
        }
        com.cubeSuite.communication.Communication.addChecksum(v0_1);
        return com.cubeSuite.communication.Communication.byteListToByteArr(v0_1);
    }

    public static byte[] makeWritePacket(java.util.List p2, long p3)
    {
        java.util.ArrayList v0_1 = new java.util.ArrayList();
        com.cubeSuite.communication.Communication.addHead(v0_1);
        v0_1.add(Byte.valueOf(34));
        com.cubeSuite.communication.Communication.addLen(v0_1, (p2.size() + 8));
        v0_1.add(Byte.valueOf(4));
        com.cubeSuite.communication.Communication.addAddr(v0_1, p3);
        com.cubeSuite.communication.Communication.addLen(v0_1, p2.size());
        byte[] v2_1 = p2.iterator();
        while (v2_1.hasNext()) {
            v0_1.add(Byte.valueOf(((Byte) v2_1.next()).byteValue()));
        }
        com.cubeSuite.communication.Communication.addChecksum(v0_1);
        v0_1.size();
        return com.cubeSuite.communication.Communication.byteListToByteArr(v0_1);
    }

    public static byte[] makeWritePacketByType(byte p2, byte[] p3, long p4)
    {
        java.util.ArrayList v0_1 = new java.util.ArrayList();
        com.cubeSuite.communication.Communication.addHead(v0_1);
        v0_1.add(Byte.valueOf(34));
        com.cubeSuite.communication.Communication.addLen(v0_1, (p3.length + 8));
        v0_1.add(Byte.valueOf(p2));
        com.cubeSuite.communication.Communication.addAddr(v0_1, p4);
        com.cubeSuite.communication.Communication.addLen(v0_1, p3.length);
        byte[] v2_3 = p3.length;
        int v4_1 = 0;
        while (v4_1 < v2_3) {
            v0_1.add(Byte.valueOf(p3[v4_1]));
            v4_1++;
        }
        com.cubeSuite.communication.Communication.addChecksum(v0_1);
        return com.cubeSuite.communication.Communication.byteListToByteArr(v0_1);
    }

    public static byte[] makeWritePacketToByte(byte[] p1, long p2)
    {
        return com.cubeSuite.communication.Communication.makeWritePacketByType(4, p1, p2);
    }

    public static byte[] makeWritePacketToRAM(byte[] p1, long p2)
    {
        return com.cubeSuite.communication.Communication.makeWritePacketByType(6, p1, p2);
    }

    public static byte[] parsingResData(byte[] p0)
    {
        return p0;
    }

    public static java.util.Map parsingResNameAndVer(byte[] p8)
    {
        java.util.HashMap v0_1 = new java.util.HashMap();
        v0_1.put("name", "");
        v0_1.put("version", "");
        String v2_4 = new char[p8.length];
        int v5 = 0;
        while (v5 < (p8.length - 1)) {
            v2_4[v5] = ((char) p8[v5]);
            v5++;
        }
        String v8_2 = String.valueOf(v2_4).split("_");
        v0_1.put("name", v8_2[0]);
        v0_1.put("version", v8_2[1].substring(0, 3));
        return v0_1;
    }

    public static void strAddU8Arr(java.util.List p3, String p4)
    {
        byte[] v4_1 = p4.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        int v0_1 = v4_1.length;
        int v1 = 0;
        while (v1 < v0_1) {
            p3.add(Byte.valueOf(v4_1[v1]));
            v1++;
        }
        return;
    }

    public static int threeByteToInt(byte p0, byte p1, byte p2)
    {
        return (((p0 & 255) | ((p1 & 255) << 8)) | ((p2 & 255) << 16));
    }

    public static void u16AddU8Arr(java.util.List p1, int p2)
    {
        p1.add(Byte.valueOf(((byte) (p2 & 255))));
        p1.add(Byte.valueOf(((byte) ((p2 >> 8) & 255))));
        return;
    }

    public static byte[] u16AddU8Arr(int p3)
    {
        byte v3_2 = ((byte) (p3 >> 8));
        byte[] v1_1 = new byte[2];
        v1_1[0] = ((byte) (p3 & 255));
        v1_1[1] = v3_2;
        return v1_1;
    }

    static int[] u16ToTwoInt(int p2)
    {
        return new int[] {(p2 & 255), (p2 & 65280)});
    }

    public static void u24AddU8Arr(java.util.List p4, long p5)
    {
        p4.add(Byte.valueOf(((byte) ((int) (p5 & 255)))));
        p4.add(Byte.valueOf(((byte) ((int) ((p5 >> 8) & 255)))));
        p4.add(Byte.valueOf(((byte) ((int) ((p5 >> 16) & 255)))));
        return;
    }

    public static void u32AddU8Arr(java.util.List p4, long p5)
    {
        p4.add(Byte.valueOf(((byte) ((int) (p5 & 255)))));
        p4.add(Byte.valueOf(((byte) ((int) ((p5 >> 8) & 255)))));
        p4.add(Byte.valueOf(((byte) ((int) ((p5 >> 16) & 255)))));
        p4.add(Byte.valueOf(((byte) ((int) ((p5 >> 24) & 255)))));
        return;
    }

    public static String u8ArrToString(java.util.List p4)
    {
        int v0 = p4.size();
        byte[] v1 = new byte[v0];
        int v2 = 0;
        while (v2 < v0) {
            v1[v2] = ((Byte) p4.get(v2)).byteValue();
            v2++;
        }
        return new String(v1);
    }

    public static int u8ArrToU16(byte p0, byte p1)
    {
        return ((p0 & 255) | ((p1 & 255) << 8));
    }

    public static long u8ArrToU32(java.util.List p4)
    {
        return ((long) (((((Byte) p4.get(3)).byteValue() & 255) << 24) | (((((Byte) p4.get(0)).byteValue() & 255) | ((((Byte) p4.get(1)).byteValue() & 255) << 8)) | ((((Byte) p4.get(2)).byteValue() & 255) << 16))));
    }
}
