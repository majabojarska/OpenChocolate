#!/usr/bin/env python3
"""Direct-SysEx: replay writes one-by-one waiting for ACK; then read back."""

from __future__ import annotations

import subprocess
import sys
import time

sys.path.insert(0, ".")
from analyze_captures import parse_capture

RAW = "hw:3,0,0"


def amidi(args: list[str]) -> str:
    r = subprocess.run(
        ["amidi", "-p", RAW, *args], capture_output=True, text=True, check=False
    )
    return r.stdout


def hexstr(b: bytes) -> str:
    return " ".join(f"{x:02X}" for x in b)


def send_wait_ack(msg: bytes) -> bool:
    amidi(["-S", hexstr(msg)])
    time.sleep(0.15)
    resp = amidi(["-d", "-t", "1"]).split()
    body = b""
    try:
        body = bytes(int(t, 16) for t in resp)
    except ValueError:
        pass
    if len(body) >= 12 and body[3] == 0x01 and body[4] == 0x08:
        return True
    print(f"  no ACK; got: {body[:16].hex(' ') if body else '(empty)'}")
    return False


def read_chunk(addr_lo_hi_mid: tuple[int, int, int]) -> bytes:
    a, b_, c = addr_lo_hi_mid
    req = bytes(
        [
            0xF0,
            0x00,
            0x32,
            0x0D,
            0x41,
            0x00,
            0x00,
            0x00,
            0x02,
            a,
            b_,
            c,
            0x00,
            0x00,
            0x10,
            0x7E,
            0x00,
            0x00,
            0x07,
            0x00,
            0xF7,
        ]
    )
    amidi(["-S", hexstr(req)])
    time.sleep(0.15)
    resp = amidi(["-d", "-t", "1"]).split()
    try:
        body = bytes(int(t, 16) for t in resp)
    except ValueError:
        return b""
    if len(body) >= 12 and body[3] == 0x0D and body[4] == 0x49:
        p = body[12:-1]
        if p[:5] == bytes([0, 0x10, 0x7E, 0, 0]):
            p = p[5:]
        return p
    return b""


def main() -> None:
    writes = [
        b
        for b in parse_capture("/tmp/full_b22.log")
        if len(b) > 20 and b[3] == 0x09 and b[4] == 0x41 and b[5] == 0x40
    ]
    print(f"{len(writes)} writes; sending with ACK sync ...")
    acked = 0
    for i, w in enumerate(writes):
        if send_wait_ack(w):
            acked += 1
        else:
            print(f"  write {i} (off={w[10]:02X}) not acked")
    print(f"acked {acked}/{len(writes)}")

    chunk = read_chunk((0, 0, 0))
    print(f"000000 chunk len {len(chunk)}")
    if chunk:
        from trace import decode_b_slots

        print("bank B decode:", decode_b_slots(chunk))
        print("chunk @195-215:", chunk[195:215].hex(" "))


if __name__ == "__main__":
    main()
