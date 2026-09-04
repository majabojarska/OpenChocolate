#!/usr/bin/env python3
"""Extract SysEx messages from USBPcap MIDI captures.

Parses pcapng, takes USB bulk packets, reassembles USB-MIDI event packets
(CIN 0x4 = start/continue, 0x5/0x6/0x7 = end variants) into full SysEx
messages and prints them with direction (TX = host->device, RX = device->host).
"""
import struct
import sys


def parse_pcapng(path):
    data = open(path, "rb").read()
    pos = 0
    packets = []
    while pos + 12 <= len(data):
        btype = struct.unpack_from("<I", data, pos)[0]
        blen = struct.unpack_from("<I", data, pos + 4)[0]
        if blen < 12 or pos + blen > len(data):
            break
        if btype == 6:  # Enhanced Packet Block
            body = data[pos + 8 : pos + blen - 4]
            caplen = struct.unpack_from("<I", body, 12)[0]
            pkt = body[20 : 20 + caplen]
            packets.append(pkt)
        pos += blen
    return packets


def usb_payload(pkt):
    """Standard USBPcap pseudo-header (27 bytes) + payload."""
    if len(pkt) < 27:
        return b"", None, 0
    hlen = struct.unpack_from("<H", pkt, 0)[0]
    info = pkt[16]
    ep = pkt[21]
    transfer = pkt[22]
    dlen = struct.unpack_from("<I", pkt, 23)[0]
    data = pkt[hlen : hlen + dlen]
    return data, info, ep, transfer


# MIDI bytes carried per CIN for SysEx framing
CIN_LEN = {0x4: 3, 0x5: 2, 0x6: 2, 0x7: 3}


def reassemble(payload):
    """Yield (direction, sysex_bytes) from a USBPcap bulk payload."""
    dir_in = None
    msgs = []
    cur = None
    cur_dir = None
    for off in range(0, len(payload) - 3, 4):
        b0 = payload[off]
        cin = b0 & 0x0F
        midi = payload[off + 1 : off + 4]
        n = CIN_LEN.get(cin)
        if n is None:
            continue
        data = midi[:n]
        if data[:1] == b"\xf0":
            cur = bytearray(data)
            cur_dir = dir_in
        elif cur is not None:
            cur.extend(data)
            if data[-1:] == b"\xf7":
                msgs.append((cur_dir, bytes(cur)))
                cur = None
    return msgs


def main(path):
    packets = parse_pcapng(path)
    cin_hist = {}
    # carry partial SysEx across USB frames
    cur = bytearray()
    cur_dir = None
    for pkt in packets:
        try:
            payload, info, ep, transfer = usb_payload(pkt)
        except ValueError:
            continue
        if transfer != 3 or not payload:  # bulk with data only
            continue
        dir_in = bool(ep & 0x80)
        for off in range(0, len(payload) - 3, 4):
            cin = payload[off] & 0x0F
            cin_hist[cin] = cin_hist.get(cin, 0) + 1
            midi = payload[off + 1 : off + 4]
            n = CIN_LEN.get(cin)
            if n is None:
                continue
            data = midi[:n]
            if data[:1] == b"\xf0":
                cur = bytearray(data)
                cur_dir = dir_in
            elif cur:
                cur.extend(data)
                if data[-1:] == b"\xf7":
                    arrow = "RX" if cur_dir else "TX"
                    print(f"{arrow} len={len(cur):5d}  {bytes(cur).hex(' ')}")
                    cur = bytearray()
    print("CIN histogram:", {hex(k): v for k, v in sorted(cin_hist.items())})





if __name__ == "__main__":
    main(sys.argv[1])