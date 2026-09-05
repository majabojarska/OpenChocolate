#!/usr/bin/env python3
"""Extract the 09 41 05 bank-clear messages from the remove-all pcaps and
print them, so we can compare with open-chocolate's buildBankClearWrite."""
import struct
import sys
import glob

CIN_LEN = {0x4: 3, 0x5: 2, 0x6: 2, 0x7: 3}


def extract(path):
    data = open(path, "rb").read()
    pos = 0
    cur = bytearray()
    out = []
    while pos + 12 <= len(data):
        btype = struct.unpack_from("<I", data, pos)[0]
        blen = struct.unpack_from("<I", data, pos + 4)[0]
        if blen < 12 or pos + blen > len(data):
            break
        if btype == 6:
            body = data[pos + 8 : pos + blen - 4]
            caplen = struct.unpack_from("<I", body, 12)[0]
            pkt = body[20 : 20 + caplen]
            try:
                if len(pkt) < 27:
                    pos += blen
                    continue
                hlen = struct.unpack_from("<H", pkt, 0)[0]
                ep = pkt[21]
                dlen = struct.unpack_from("<I", pkt, 23)[0]
                payload = pkt[hlen : hlen + dlen]
            except ValueError:
                pos += blen
                continue
            if not payload:
                pos += blen
                continue
            for off in range(0, len(payload) - 3, 4):
                cin = payload[off] & 0x0F
                n = CIN_LEN.get(cin)
                if n is None:
                    continue
                data_ = payload[off + 1 : off + 1 + n]
                if data_[:1] == b"\xf0":
                    cur = bytearray(data_)
                elif cur:
                    cur.extend(data_)
                    if data_[-1:] == b"\xf7":
                        out.append(bytes(cur))
                        cur = bytearray()
        pos += blen
    return out


files = sorted(glob.glob("usb-capture/*remove-all*.pcapng"))
for path in files:
    print("======", path)
    for m in extract(path):
        if len(m) >= 9 and m[3] == 0x09 and m[4] == 0x41 and m[5] == 0x05:
            print("09 41 05 clear:", m.hex(" "))
            print("  len", len(m), "addr", m[9] | (m[10] << 7) | (m[11] << 14), "ck", m[-3:-1].hex(" "))
    print()