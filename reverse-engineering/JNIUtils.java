package com.cubeSuite.communication;
public class JNIUtils {

    static JNIUtils()
    {
        System.loadLibrary("GetOffset");
        return;
    }

    public JNIUtils()
    {
        return;
    }

    public static native byte[] CustomDataToByteArr(com.cubeSuite.entity.footCtrl.CustomData p0);

    public static native com.cubeSuite.entity.footCtrl.FootCtrlEntry dataToFootCtrlEntry(byte[] p0);

    public static native int getCubeTurnerStructAddr(String p0);

    public static native int getCubeTurnerStructSize();

    public static native int getFootCtrlAddr(String p0);

    public static native int getFootCtrlSize();
}
