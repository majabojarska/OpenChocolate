package com.cubeSuite.communication;
public class CommunicationUtil {
    private static final int DATA_CALLBACK = 10000;
    private static final int MSG_ERASE_CALLBACK = 10004;
    private static final int MSG_QUERY_CALLBACK = 10003;
    private static final int MSG_READ_CALLBACK = 10001;
    private static final int MSG_WRITE_CALLBACK = 10002;
    private static java.util.concurrent.locks.ReentrantLock m_lock;
    private final long ERASE_FLASE_BLOCK_SIZE;
    private final int WAIT_TIME;
    private com.fastble.callback.BleNotifyCallback bleNotifyCallback;
    private final android.os.Handler handler;
    private volatile boolean isReadData;
    private volatile boolean m_isRead;
    private volatile boolean m_isWrite;
    private com.cubeSuite.callback.Callback$OpenNotify notifyCallback;
    java.util.ArrayList notifyData;
    public com.cubeSuite.callback.Callback$BleCommunicationCallback sendLongDataMsg;
    private String write;
    private final com.fastble.callback.BleWriteCallback writeCallback;
    private String writeService;

    static CommunicationUtil()
    {
        com.cubeSuite.communication.CommunicationUtil.m_lock = new java.util.concurrent.locks.ReentrantLock();
        return;
    }

    public CommunicationUtil()
    {
        this.writeService = "0000ae40-0000-1000-8000-00805F9B34FB";
        this.write = "0000ae41-0000-1000-8000-00805F9B34FB";
        this.WAIT_TIME = 3000;
        this.isReadData = 0;
        this.ERASE_FLASE_BLOCK_SIZE = 4096;
        this.handler = new android.os.Handler(android.os.Looper.getMainLooper(), new com.cubeSuite.communication.CommunicationUtil$1(this));
        this.sendLongDataMsg = new com.cubeSuite.communication.CommunicationUtil$2(this);
        this.m_isRead = 0;
        this.m_isWrite = 0;
        this.writeCallback = new com.cubeSuite.communication.CommunicationUtil$6(this);
        this.notifyData = new java.util.ArrayList(4096);
        this.bleNotifyCallback = new com.cubeSuite.communication.CommunicationUtil$7(this);
        return;
    }

    static synthetic com.cubeSuite.callback.Callback$OpenNotify access$000(com.cubeSuite.communication.CommunicationUtil p0)
    {
        return p0.notifyCallback;
    }

    private com.cubeSuite.communication.CommunicationUtil$ResData getQueryResData(byte p19, int p20)
    {
        com.cubeSuite.communication.CommunicationUtil.m_lock.lock();
        com.cubeSuite.communication.CommunicationUtil$QueryResDataParsing v1_5 = com.cubeSuite.communication.CommunicationUtil$QueryResDataParsing.dataHead;
        java.util.ArrayList v2_1 = new java.util.ArrayList();
        java.util.List v4_2 = 3000;
        int v5_0 = 0;
        int v7_0 = 0;
        byte v8_0 = 0;
        while (v4_2 > null) {
            try {
                if ((p20 <= this.notifyData.size()) && (!this.isReadData)) {
                    int v9_11 = 1;
                    this.isReadData = 1;
                    while (v7_0 < this.notifyData.size()) {
                        long v13_4 = v1_5.ordinal();
                        if (v13_4 == 0) {
                            long v16 = 1;
                            if ((((Byte) this.notifyData.get(v7_0)).byteValue() != 0) || (((Byte) this.notifyData.get((v7_0 + 1))).byteValue() != 89)) {
                                v7_0++;
                            } else {
                                v7_0 += 2;
                                v1_5 = com.cubeSuite.communication.CommunicationUtil$QueryResDataParsing.cmdType;
                            }
                        } else {
                            if (v13_4 == v9_11) {
                                if (((Byte) this.notifyData.get(v7_0)).byteValue() != p19) {
                                    v1_5 = com.cubeSuite.communication.CommunicationUtil$QueryResDataParsing.dataHead;
                                } else {
                                    v1_5 = com.cubeSuite.communication.CommunicationUtil$QueryResDataParsing.dataLen;
                                }
                            } else {
                                if (v13_4 == 2) {
                                    v5_0 = (((((long) (((Byte) this.notifyData.get((v7_0 + 2))).byteValue() & 255)) << 16) | (((long) (((Byte) this.notifyData.get((v7_0 + 1))).byteValue() & 255)) << 8)) | ((long) (((Byte) this.notifyData.get(v7_0)).byteValue() & 255)));
                                    v1_5 = com.cubeSuite.communication.CommunicationUtil$QueryResDataParsing.data;
                                    v7_0 += 3;
                                } else {
                                    if (v13_4 == 3) {
                                        com.cubeSuite.communication.CommunicationUtil$QueryResDataParsing v1_6 = v7_0;
                                        while (((long) v1_6) < (((long) v7_0) + v5_0)) {
                                            v2_1.add(((Byte) this.notifyData.get(v1_6)));
                                            v8_0 = ((byte) (v8_0 + ((Byte) this.notifyData.get(v1_6)).byteValue()));
                                            v1_6++;
                                        }
                                        v7_0 += ((int) v5_0);
                                        v1_5 = com.cubeSuite.communication.CommunicationUtil$QueryResDataParsing.checkSum;
                                    } else {
                                        if (v13_4 == 4) {
                                            long v13_1 = (v7_0 + 1);
                                            if ((~ v8_0) != ((Byte) this.notifyData.get(v7_0)).byteValue()) {
                                                v7_0 = v13_1;
                                            } else {
                                                java.util.List v4_0 = this.notifyData;
                                                this.notifyData = new java.util.ArrayList(v4_0.subList(v13_1, v4_0.size()));
                                                this.isReadData = 0;
                                                com.cubeSuite.communication.CommunicationUtil.m_lock.unlock();
                                                return new com.cubeSuite.communication.CommunicationUtil$ResData(v9_11, v2_1);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        v9_11 = 1;
                    }
                    Thread.sleep(1);
                } else {
                    Thread.sleep(1);
                }
                v4_2--;
            } catch (InterruptedException) {
            }
        }
        this.notifyData.clear();
        this.isReadData = 0;
        com.cubeSuite.communication.CommunicationUtil.m_lock.unlock();
        return new com.cubeSuite.communication.CommunicationUtil$ResData(0, v2_1);
    }

    private com.cubeSuite.communication.CommunicationUtil$ResData getReadResData(long p19, long p21, byte p23)
    {
        com.cubeSuite.communication.CommunicationUtil.m_lock.lock();
        com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataHead;
        java.util.ArrayList v2_1 = new java.util.ArrayList();
        java.util.List v4_0 = 3000;
        byte v5_0 = 0;
        byte v6_1 = 0;
        while (v4_0 > null) {
            try {
                if ((((long) this.notifyData.size()) >= (p21 + 15)) && (!this.isReadData)) {
                    byte v7_16 = 1;
                    this.isReadData = 1;
                    while (v5_0 < this.notifyData.size()) {
                        byte v10_4;
                        switch (v1_13.ordinal()) {
                            case 0:
                                long v15 = 1;
                                if ((((Byte) this.notifyData.get(v5_0)).byteValue() != 0) || (((Byte) this.notifyData.get((v5_0 + 1))).byteValue() != 89)) {
                                    v5_0++;
                                } else {
                                    v5_0 += 2;
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.cmdType;
                                }
                                break;
                            case 1:
                                v15 = 1;
                                if (((Byte) this.notifyData.get(v5_0)).byteValue() != 35) {
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataHead;
                                } else {
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataAllLen;
                                }
                                break;
                            case 2:
                                v15 = 1;
                                if ((((((long) (((Byte) this.notifyData.get((v5_0 + 2))).byteValue() & 255)) << 16) | (((long) (((Byte) this.notifyData.get((v5_0 + 1))).byteValue() & 255)) << 8)) | ((long) (((Byte) this.notifyData.get(v5_0)).byteValue() & 255))) != (p21 + 8)) {
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataHead;
                                } else {
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.flashType;
                                    v5_0 += 3;
                                }
                                break;
                            case 3:
                                if (((Byte) this.notifyData.get(v5_0)).byteValue() != p23) {
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataHead;
                                } else {
                                    com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing v1_47 = ((Byte) this.notifyData.get(v5_0));
                                    v5_0++;
                                    v6_1 = ((byte) (v6_1 + v1_47.byteValue()));
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataAddr;
                                }
                                break;
                            case 4:
                                if (((((((long) (((Byte) this.notifyData.get((v5_0 + 2))).byteValue() & 255)) << 16) | (((long) (((Byte) this.notifyData.get((v5_0 + 3))).byteValue() & 255)) << 24)) | (((long) (((Byte) this.notifyData.get((v5_0 + 1))).byteValue() & 255)) << 8)) | ((long) (((Byte) this.notifyData.get(v5_0)).byteValue() & 255))) != p19) {
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataHead;
                                } else {
                                    com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing v1_40 = v5_0;
                                    while(true) {
                                        byte v7_5 = (v5_0 + 4);
                                        if (v1_40 >= v7_5) {
                                            break;
                                        }
                                        v6_1 = ((byte) (v6_1 + ((Byte) this.notifyData.get(v1_40)).byteValue()));
                                        v1_40++;
                                    }
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataLen;
                                    v5_0 = v7_5;
                                }
                                break;
                            case 5:
                                if ((((((long) (((Byte) this.notifyData.get((v5_0 + 1))).byteValue() & 255)) << 8) | (((long) (((Byte) this.notifyData.get((v5_0 + 2))).byteValue() & 255)) << 16)) | ((long) (((Byte) this.notifyData.get(v5_0)).byteValue() & 255))) != p21) {
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.dataHead;
                                } else {
                                    com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing v1_14 = v5_0;
                                    while(true) {
                                        v10_4 = (v5_0 + 3);
                                        if (v1_14 >= v10_4) {
                                            break;
                                        }
                                        v6_1 = ((byte) (v6_1 + ((Byte) this.notifyData.get(v1_14)).byteValue()));
                                        v1_14++;
                                    }
                                    v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.data;
                                    v5_0 = v10_4;
                                }
                                break;
                            case 6:
                                com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing v1_75 = v5_0;
                                while(true) {
                                    long v12_8 = (((long) v5_0) + p21);
                                    if (((long) v1_75) >= v12_8) {
                                        break;
                                    }
                                    v2_1.add(((Byte) this.notifyData.get(v1_75)));
                                    v6_1 = ((byte) (v6_1 + ((Byte) this.notifyData.get(v1_75)).byteValue()));
                                    v1_75++;
                                }
                                v5_0 = ((int) v12_8);
                                v1_13 = com.cubeSuite.communication.CommunicationUtil$ReadResDataParsing.checkSum;
                                break;
                            case 7:
                                v10_4 = (v5_0 + 1);
                                if ((~ v6_1) != ((Byte) this.notifyData.get(v5_0)).byteValue()) {
                                } else {
                                    java.util.List v4_1 = this.notifyData;
                                    this.notifyData = new java.util.ArrayList(v4_1.subList(v10_4, v4_1.size()));
                                    this.isReadData = 0;
                                    com.cubeSuite.communication.CommunicationUtil.m_lock.unlock();
                                    return new com.cubeSuite.communication.CommunicationUtil$ResData(v7_16, v2_1);
                                }
                            default:
                        }
                        v7_16 = 1;
                    }
                    Thread.sleep(1);
                } else {
                    Thread.sleep(1);
                }
                v4_0--;
            } catch (InterruptedException) {
            }
        }
        this.notifyData.clear();
        this.isReadData = 0;
        com.cubeSuite.communication.CommunicationUtil.m_lock.unlock();
        return new com.cubeSuite.communication.CommunicationUtil$ResData(0, v2_1);
    }

    private boolean getWriteResData()
    {
        com.cubeSuite.communication.CommunicationUtil.m_lock.lock();
        java.util.concurrent.locks.ReentrantLock v0_1 = com.cubeSuite.communication.CommunicationUtil$WriteResDataParsing.dataHead;
        java.util.List v2_0 = 3000;
        int v3_0 = 0;
        while (v2_0 > null) {
            while (v3_0 < this.notifyData.size()) {
                int v4_3 = v0_1.ordinal();
                if (v4_3 == 0) {
                    if ((((Byte) this.notifyData.get(v3_0)).byteValue() != 0) || (((Byte) this.notifyData.get((v3_0 + 1))).byteValue() != 89)) {
                        v3_0++;
                    } else {
                        v3_0 += 2;
                        v0_1 = com.cubeSuite.communication.CommunicationUtil$WriteResDataParsing.cmdType;
                    }
                } else {
                    if (v4_3 == 1) {
                        if (((Byte) this.notifyData.get(v3_0)).byteValue() != 0) {
                            v0_1 = com.cubeSuite.communication.CommunicationUtil$WriteResDataParsing.dataHead;
                        } else {
                            v0_1 = com.cubeSuite.communication.CommunicationUtil$WriteResDataParsing.Res;
                            v3_0 += 4;
                        }
                    } else {
                        if (v4_3 == 2) {
                            if (((Byte) this.notifyData.get(v3_0)).byteValue() != 0) {
                                this.notifyData.clear();
                                this.isReadData = 0;
                                com.cubeSuite.communication.CommunicationUtil.m_lock.unlock();
                                return 0;
                            } else {
                                java.util.List v2_1 = this.notifyData;
                                this.notifyData = new java.util.ArrayList(v2_1.subList((v3_0 + 2), v2_1.size()));
                                this.isReadData = 0;
                                com.cubeSuite.communication.CommunicationUtil.m_lock.unlock();
                                return 1;
                            }
                        } else {
                        }
                    }
                }
            }
            Thread.sleep(1);
            v2_0--;
        }
        this.notifyData.clear();
        com.cubeSuite.communication.CommunicationUtil.m_lock.unlock();
        this.isReadData = 0;
        return 0;
    }

    private void sendMsg(int p3, com.cubeSuite.communication.CommunicationUtil$ResData p4, com.cubeSuite.callback.Callback$BleCommunicationCallback p5)
    {
        android.os.Message v0_1 = new android.os.Message();
        v0_1.what = 10000;
        v0_1.obj = new com.cubeSuite.communication.CommunicationUtil$SendMSG(p3, p4, p5);
        this.handler.sendMessage(v0_1);
        return;
    }

    public void clearBuf()
    {
        this.notifyData.clear();
        return;
    }

    public void connect(com.cubeSuite.callback.Callback$OpenNotify p7)
    {
        this.notifyCallback = p7;
        com.fastble.BleManager.getInstance().notify(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), "0000ae40-0000-1000-8000-00805F9B34FB", "0000ae42-0000-1000-8000-00805F9B34FB", 0, this.bleNotifyCallback);
        return;
    }

    public void eraseFlash(byte p9, long p10, int p12, com.cubeSuite.callback.Callback$BleCommunicationCallback p13)
    {
        new Thread(new com.cubeSuite.communication.CommunicationUtil$$ExternalSyntheticLambda3(this, p12, p9, p10, p13));
        return;
    }

    synthetic void lambda$eraseFlash$3$com-cubeSuite-communication-CommunicationUtil(int p13, byte p14, long p15, com.cubeSuite.callback.Callback$BleCommunicationCallback p17)
    {
        int v2 = 0;
        while (v2 < p13) {
            com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, com.cubeSuite.communication.Communication.makeCustomErasePacket(p14, ((((long) v2) * 4096) + p15)), this.writeCallback);
            if (this.getWriteResData()) {
                v2++;
            } else {
                this.sendMsg(10004, new com.cubeSuite.communication.CommunicationUtil$ResData(0), p17);
                return;
            }
        }
        this.sendMsg(10004, new com.cubeSuite.communication.CommunicationUtil$ResData(1), p17);
        return;
    }

    synthetic void lambda$queryData$2$com-cubeSuite-communication-CommunicationUtil(byte p7, com.cubeSuite.callback.Callback$BleCommunicationCallback p8)
    {
        com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, com.cubeSuite.communication.Communication.makeQueryPacket(p7), this.writeCallback);
        this.sendMsg(10003, this.getQueryResData(p7, 34), p8);
        return;
    }

    synthetic void lambda$readData$4$com-cubeSuite-communication-CommunicationUtil(byte[] p13, com.cubeSuite.callback.Callback$BleCommunicationCallback p14)
    {
        long v9 = (((((long) p13[13]) << 16) | (((long) p13[12]) << 8)) | ((long) p13[11]));
        long v7 = ((((((long) p13[10]) << 24) | (((long) p13[9]) << 16)) | (((long) p13[8]) << 8)) | ((long) p13[7]));
        byte v11 = p13[6];
        com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, p13, this.writeCallback);
        this.sendMsg(10001, this.getReadResData(v7, v9, v11), p14);
        return;
    }

    synthetic void lambda$splitReadData$0$com-cubeSuite-communication-CommunicationUtil(long p19, int p21, byte p22, com.cubeSuite.callback.Callback$BleCommunicationCallback p23)
    {
        byte v6_0 = p22;
        while (this.m_isRead) {
            try {
                Thread.sleep(1);
            } catch (InterruptedException v0_2) {
                v0_2.printStackTrace();
            }
        }
        this.m_isRead = 1;
        java.util.ArrayList v8_1 = new java.util.ArrayList(p21);
        int v9 = p21;
        long v2_0 = p19;
        while (v9 > 0) {
            if (v9 >= 1000) {
                com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, com.cubeSuite.communication.Communication.makeReadPacketByType(v6_0, v2_0, 1000), this.writeCallback);
                com.cubeSuite.communication.CommunicationUtil$ResData v12_1 = this.getReadResData(v2_0, ((long) 1000), v6_0);
                v8_1.addAll(v12_1.data);
                if (v12_1.isSuccess) {
                    v9 += -1000;
                    v2_0 += ((long) 1000);
                    v6_0 = p22;
                } else {
                    this.sendMsg(10001, v12_1, p23).m_isRead = 0;
                    return;
                }
            } else {
                void v1_2;
                com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, com.cubeSuite.communication.Communication.makeReadPacketByType(v6_0, v2_0, v9), this.writeCallback);
                long v2_1 = this.getReadResData(v2_0, ((long) v9), v6_0);
                v8_1.addAll(v2_1.data);
                if (v2_1.isSuccess) {
                    v1_2 = this.sendMsg(10001, new com.cubeSuite.communication.CommunicationUtil$ResData(1, v8_1), p23);
                } else {
                    v1_2 = this.sendMsg(10001, v2_1, p23);
                }
                v1_2.m_isRead = 0;
                return;
            }
        }
        return;
    }

    synthetic void lambda$splitWriteData$1$com-cubeSuite-communication-CommunicationUtil(byte[] p25, byte p26, long p27, com.cubeSuite.callback.Callback$BleCommunicationCallback p29)
    {
        while (this.m_isWrite) {
            try {
                Thread.sleep(1);
            } catch (com.cubeSuite.communication.CommunicationUtil$ResData v0_7) {
                v0_7.printStackTrace();
            }
        }
        this.m_isWrite = 1;
        int v7_0 = (p25.length / 173);
        int v10_0 = 0;
        if (v7_0 != 0) {
            if ((p25.length % 173) != 0) {
                v7_0++;
            }
            int v11_2 = 0;
            while (v11_2 < v7_0) {
                com.fastble.callback.BleWriteCallback v13_2;
                int v12_0 = (v7_0 - 1);
                if ((v11_2 != v12_0) || ((p25.length % 173) == 0)) {
                    v13_2 = new byte[173];
                    System.arraycopy(p25, (v11_2 * 173), v13_2, v10_0, 173);
                } else {
                    v13_2 = new byte[(p25.length % 173)];
                    System.arraycopy(p25, (v11_2 * 173), v13_2, v10_0, (p25.length % 173));
                }
                com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, com.cubeSuite.communication.Communication.makeWritePacketByType(p26, v13_2, (p27 + (((long) v11_2) * ((long) 173)))), this.writeCallback);
                if (this.getWriteResData()) {
                    if (v11_2 != v12_0) {
                        v11_2++;
                        v10_0 = 0;
                    } else {
                        this.sendMsg(10002, new com.cubeSuite.communication.CommunicationUtil$ResData(1), p29).m_isWrite = 0;
                        return;
                    }
                } else {
                    this.sendMsg(10002, new com.cubeSuite.communication.CommunicationUtil$ResData(0), p29).m_isWrite = 0;
                    return;
                }
            }
            return;
        } else {
            com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, com.cubeSuite.communication.Communication.makeWritePacketByType(p26, p25, p27), this.writeCallback);
            this.sendMsg(10002, new com.cubeSuite.communication.CommunicationUtil$ResData(this.getWriteResData()), p29).m_isWrite = 0;
            return;
        }
    }

    synthetic void lambda$writeDataToBle$5$com-cubeSuite-communication-CommunicationUtil(byte[] p7, com.cubeSuite.callback.Callback$BleCommunicationCallback p8)
    {
        com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, p7, this.writeCallback);
        this.sendMsg(10002, new com.cubeSuite.communication.CommunicationUtil$ResData(this.getWriteResData()), p8);
        return;
    }

    public void queryData(byte p3, com.cubeSuite.callback.Callback$BleCommunicationCallback p4)
    {
        new Thread(new com.cubeSuite.communication.CommunicationUtil$$ExternalSyntheticLambda4(this, p3, p4)).start();
        return;
    }

    public void readData(byte[] p3, com.cubeSuite.callback.Callback$BleCommunicationCallback p4)
    {
        new Thread(new com.cubeSuite.communication.CommunicationUtil$$ExternalSyntheticLambda2(this, p3, p4)).start();
        return;
    }

    public void sendI8Data(byte p5, com.cubeSuite.entity.addrData.AddrI8 p6)
    {
        byte[] v1_1 = new byte[1];
        v1_1[0] = p6.getData();
        this.splitWriteData(p5, v1_1, p6.getAddr());
        return;
    }

    public void sendLongData(byte p8, byte[] p9, long p10)
    {
        com.cubeSuite.customControl.AlertDialogUtil.getInstance(com.cubeSuite.activitys.ActivityStackUtil.getInstance().getActivity()).setTitle(2131951786).setContent(2131952067).setBtnVisible(com.cubeSuite.customControl.AlertDialogUtil$SelectBtn.ALL_INVISIBLE).showDialog();
        this.splitWriteData(p8, p9, p10, this.sendLongDataMsg);
        return;
    }

    public void sendU16Data(byte p4, com.cubeSuite.entity.addrData.AddrU16 p5)
    {
        this.splitWriteData(p4, com.cubeSuite.communication.Communication.u16AddU8Arr(p5.getData()), p5.getAddr());
        return;
    }

    public void sendU8Data(byte p5, com.cubeSuite.entity.addrData.AddrU8 p6)
    {
        byte[] v1_1 = new byte[1];
        v1_1[0] = ((byte) p6.getData());
        this.splitWriteData(p5, v1_1, p6.getAddr());
        return;
    }

    public void splitReadData(byte p9, long p10, int p12, com.cubeSuite.callback.Callback$BleCommunicationCallback p13)
    {
        new Thread(new com.cubeSuite.communication.CommunicationUtil$$ExternalSyntheticLambda0(this, p10, p12, p9, p13)).start();
        return;
    }

    public void splitWriteData(byte p8, java.util.List p9, long p10)
    {
        int v0 = p9.size();
        byte[] v3 = new byte[v0];
        com.cubeSuite.communication.CommunicationUtil v1_0 = 0;
        while (v1_0 < v0) {
            v3[v1_0] = ((Byte) p9.get(v1_0)).byteValue();
            v1_0++;
        }
        this.splitWriteData(p8, v3, p10, new com.cubeSuite.communication.CommunicationUtil$4(this));
        return;
    }

    public void splitWriteData(byte p7, byte[] p8, long p9)
    {
        this.splitWriteData(p7, p8, p9, new com.cubeSuite.communication.CommunicationUtil$3(this));
        return;
    }

    public void splitWriteData(byte p9, byte[] p10, long p11, com.cubeSuite.callback.Callback$BleCommunicationCallback p13)
    {
        new Thread(new com.cubeSuite.communication.CommunicationUtil$$ExternalSyntheticLambda5(this, p10, p9, p11, p13)).start();
        return;
    }

    public void writeDataToBle(byte[] p2)
    {
        this.writeDataToBle(p2, new com.cubeSuite.communication.CommunicationUtil$5(this));
        return;
    }

    public void writeDataToBle(byte[] p3, com.cubeSuite.callback.Callback$BleCommunicationCallback p4)
    {
        new Thread(new com.cubeSuite.communication.CommunicationUtil$$ExternalSyntheticLambda1(this, p3, p4)).start();
        return;
    }

    public void writeDataToBleNotRes(byte[] p7)
    {
        com.fastble.BleManager.getInstance().write(com.cubeSuite.bluetooth.BleHandle.connectDeviceInfo.getBleDevice(), this.writeService, this.write, p7, this.writeCallback);
        this.notifyData.clear();
        return;
    }
}
