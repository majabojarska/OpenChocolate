#!/usr/bin/env python3
"""Scan every pcap for 09 41 05 (and any 09 41) messages; list addr + checksum."""
import struct
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
                    cur_dir = bool(ep & 0x80)
                elif cur:
                    cur.extend(data_)
                    if data_[-1:] == b"\xf7":
                        out.append((bool(ep & 0x80) if not cur_dir else cur_dir, bytes(cur)))
                        cur = bytearray()
        pos += blen
    return out


seen = set()
for path in sorted(glob.glob("usb-capture/*.pcapng")):
    try:
        msgs = extract(path)
    except Exception:
        continue
    for d, m in msgs:
        if len(m) >= 9 and m[3] == 0x09 and m[4] == 0x41:
            addr = m[9] | (m[10] << 7) | (m[11] << 14)
            if addr in seen:
                continue
            seen.add(addr)
            print(f"{path.split('/')[-1][:60]:60s} 09.41 sub={m[5]:02x} addr={addr:5d} len={len(m)} ck={m[-3:-1].hex(' ')}")