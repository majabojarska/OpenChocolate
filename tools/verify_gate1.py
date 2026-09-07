#!/usr/bin/env python3
"""Gate verifier for generated FCP files.

Compares a close/reopen capture against the gate spec JSON:
- foot A bank A (viewed @108+, decode_bank_a_slots, 16 slots)
- foot A bank B (viewed @199+, decode_b_slots, 10 slots)
- feet B/C/D banks A/B (stored homes, decode_home)
- device/TRS/polarity + per-foot footswitch modes (via choco get detectors)

Usage: python3 tools/verify_gate1.py <spec.json> <capture.log>
"""

from __future__ import annotations

import json
import subprocess
import sys

sys.path.insert(0, "tools")
sys.path.insert(0, ".")

import trace  # noqa: E402
from analyze_captures import find_capture  # noqa: E402
from decode_stored import decode_home  # noqa: E402
from fmt_search import payloads  # noqa: E402

TYPES = {"pc": "pc", "cc": "cc", "noteon": "noteon", "noteoff": "noteoff"}


def cli(*args: str) -> str:
    r = subprocess.run(
        ["python3", "choco.py", *args], capture_output=True, text=True, check=False
    )
    return (r.stdout + r.stderr).strip()


def norm(msg: dict) -> tuple:
    d2 = msg.get("data2", 0) or 0
    if msg.get("type") == "pc":
        d2 = 0
    return (msg["channel"], msg["type"], msg["data1"], d2)


def main() -> int:
    spec = json.load(open(sys.argv[1]))
    chunks = payloads(find_capture(sys.argv[2]))
    chunk = chunks[(0, 0, 0)]
    fails = 0

    def check(label: str, got: list[dict] | list, want: list[list]) -> None:
        nonlocal fails
        want_n = [(m[0], TYPES[m[1]], m[2], m[3] if len(m) > 3 else 0) for m in want]
        # pc d2 normalizes to 0 on both sides
        want_n = [(c, t, d1, 0 if t == "pc" else d2) for c, t, d1, d2 in want_n]
        got_n = (
            [norm(m) for m in got] if got and isinstance(got[0], dict) else list(got)
        )
        # stored homes always decode 10 positions (trailing = defaults);
        # compare only the imported prefix
        got_n = got_n[: len(want_n)]
        if got_n != want_n:
            fails += 1
            print(f"FAIL {label}:")
            for i, (g, w) in enumerate(zip(got_n, want_n)):
                mark = "" if g == w else "   <-- MISMATCH"
                print(f"  slot {i + 1}: got {g} want {w}{mark}")
            if len(got_n) != len(want_n):
                print(f"  COUNT got {len(got_n)} want {len(want_n)}")
        else:
            print(f"OK {label} ({len(want_n)} slots)")

    fa = spec["feet"]["A"]
    check("footA bankA", trace.decode_bank_a_slots(chunk), fa["bank_a"])
    check("footA bankB", trace.decode_b_slots(chunk), fa["bank_b"])
    for foot in "BCD":
        f = spec["feet"][foot]
        check(f"foot{foot} bankA", decode_home(chunks, foot, "a"), f["bank_a"])
        check(f"foot{foot} bankB", decode_home(chunks, foot, "b"), f["bank_b"])

    # modes via detectors
    dev = cli("device-mode", "get")
    exp_dev = spec["device_mode"].replace("_", "-")
    print(
        ("OK " if exp_dev in dev.replace("_", "-") else "FAIL ") + f"device-mode: {dev}"
    )
    if exp_dev not in dev.replace("_", "-"):
        fails += 1
    trs = cli("trs-jack-mode", "get")
    exp_trs = spec["trs_mode"].replace("_", "-")
    print(("OK " if exp_trs in trs.replace("_", "-") else "FAIL ") + f"trs: {trs}")
    if exp_trs not in trs.replace("_", "-"):
        fails += 1
    for foot in "ABCD":
        cli("switch", foot.lower())
        import time

        time.sleep(0.5)
        got = cli("mode", "get")
        exp = spec["feet"][foot]["mode"].replace("_", "-")
        ok = exp in got.replace("_", "-")
        print(("OK " if ok else "FAIL ") + f"foot{foot} mode: {got} (want {exp})")
        if not ok:
            fails += 1
    print("GATE " + ("PASS" if fails == 0 else f"FAIL ({fails})"))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
