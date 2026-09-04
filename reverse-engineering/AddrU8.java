package com.cubeSuite.entity.addrData;
public class AddrU8 extends com.cubeSuite.entity.addrData.BaseDataAddr {
    private int data;
    private int max;
    private int min;

    public AddrU8(int p2, long p3)
    {
        this.min = 0;
        this.max = 255;
        this.setData(p2);
        this.addr = p3;
        return;
    }

    public AddrU8(int p1, long p2, int p4, int p5)
    {
        this.min = p4;
        this.max = p5;
        this.setData(p1);
        this.addr = p2;
        return;
    }

    public byte getByteData()
    {
        return ((byte) this.data);
    }

    public int getData()
    {
        return this.data;
    }

    public boolean setData(int p2)
    {
        int v2_5 = Math.min(Math.max((p2 & 255), this.min), this.max);
        if (this.data != v2_5) {
            this.data = v2_5;
            this.notifyChange();
            return 1;
        } else {
            return 0;
        }
    }
}
