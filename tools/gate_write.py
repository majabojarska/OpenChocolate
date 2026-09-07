#!/usr/bin/env python3
"""Gate write: send a crafted 23-page sequence (1 page with computed
checksum) directly via amidi, then read back chunk 000000 and decode.

The modified page (2,0,0,0) sets slot-6 d1 bits via bytes (144,145) =
(24,3) with X=44 from the LOOCV-validated joint table (base: grid g_00
page with (0,0), X=248). Expects device slot 6 d1 == 51 after ACKs.
"""

from __future__ import annotations

import pickle
import subprocess
import sys
import time

sys.path.insert(0, ".")
sys.path.insert(0, "tools")

RAW = "hw:1,0,0"  # SINCO (check `amidi -l`; direct_test.py's hw:3,0,0 is stale)
# NOTE: Wine holds the raw port exclusively while CubeSuite runs, so
# direct amidi is unusable then. Use the ALSA sequencer instead:
# aseqsend to 20:0 (SINCO) + aseqdump/midi.record to observe ACKs.
SEQ_PORT = "20:0"


def aseqsend(msg: bytes) -> None:
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".syx", delete=False) as t:
        t.write(msg)
        path = t.name
    try:
        subprocess.run(
            ["aseqsend", "-p", SEQ_PORT, "-s", path],
            capture_output=True,
            check=False,
        )
    finally:
        import os

        try:
            os.unlink(path)
        except OSError:
            pass


def amidi(args: list[str]) -> str:
    r = subprocess.run(
        ["amidi", "-p", RAW, *args], capture_output=True, text=True, check=False
    )
    return r.stdout


def hexstr(b: bytes) -> str:
    return " ".join(f"{x:02X}" for x in b)


def send_wait_ack(msg: bytes) -> bool:
    amidi(["-S", hexstr(msg)])
    time.sleep(0.25)
    resp = amidi(["-d", "-t", "1"]).split()
    try:
        body = bytes(int(t, 16) for t in resp)
    except ValueError:
        body = b""
    return len(body) >= 12 and body[3] == 0x01 and body[4] == 0x08


def main() -> int:
    import re

    from midi import record

    pages = pickle.load(open("/tmp/gatewrite.pkl", "rb"))
    print(f"sending {len(pages)} pages via aseqsend to {SEQ_PORT} ...")
    log_path = "/tmp/gatewrite_acks.log"
    with record("SINCO", log_file=log_path, tee=False, rescan_after=0):
        for i, p in enumerate(pages):
            aseqsend(p)
            print(f"  sent page {i} off0={p[10]} off1={p[11]}", flush=True)
            time.sleep(0.5)
        time.sleep(2)
    text = open(log_path).read()
    acks = len(re.findall(r"System exclusive.*01 08", text))
    # fallback: count 01 08 family messages via parser
    import sys as _sys

    _sys.path.insert(0, "tools")
    from analyze_captures import parse_capture

    msgs = parse_capture(log_path)
    acks = sum(1 for b in msgs if len(b) >= 8 and b[3] == 0x01 and b[4] == 0x08)
    print(f"acked {acks}/{len(pages)} (01 08 family in log)")
    if acks != len(pages):
        return 1
    print("ALL PAGES ACKED — reopen FootCtrlPlus and run read-bank-exact")
    print("to verify slot 6 d1 == 51 (gate-write proof)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
