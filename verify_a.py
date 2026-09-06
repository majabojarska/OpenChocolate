#!/usr/bin/env python3
"""Verify decode_bank_a_slots against every bank-A campaign capture."""

from __future__ import annotations

import glob
import sys

sys.path.insert(0, ".")
from analyze_captures import parse_capture
from trace import decode_bank_a_slots

BASE = [
    ("cc", 4, 17, 55),
    ("noteon", 6, 31, 99),
    ("noteoff", 8, 55, 77),
    ("pc", 3, 44, 0),
    ("cc", 5, 13, 66),
    ("noteon", 7, 21, 100),
    ("cc", 9, 33, 96),
    ("cc", 2, 66, 22),
    ("cc", 4, 77, 1),
    ("cc", 6, 100, 96),
]

NEXT_TYPE = {"cc": "noteon", "noteon": "noteoff", "noteoff": "pc", "pc": "cc"}


def expected_for(name: str) -> list[tuple] | None:
    base = name[len("camp_a") :]  # e.g. "8_d2p3" or "10_d215" or "base"
    if base == "base":
        return BASE
    # a10_d2<NNN> = slot-10 d2-value sweep (digits after "d2")
    if base.startswith("10_d2") and base[5:6].isdigit():
        d2 = int(base.split("d2")[1])
        return BASE[:9] + [("cc", 6, 100, d2)]
    if "_" not in base or base[0] not in "89":
        return None
    sidx = int(base[0]) - 1
    var = base[2:]
    t, ch, d1, d2 = BASE[sidx]
    if var == "d2p3":
        return BASE[:sidx] + [(t, ch, d1, d2 + 3)] + BASE[sidx + 1 :]
    if var == "d2p15":
        return BASE[:sidx] + [(t, ch, d1, min(d2 + 15, 127))] + BASE[sidx + 1 :]
    if var == "d1p3":
        return BASE[:sidx] + [(t, ch, min(d1 + 3, 127), d2)] + BASE[sidx + 1 :]
    if var == "d1hi":
        return (
            BASE[:sidx] + [(t, ch, min((d1 + 33) & 0x7F, 127), d2)] + BASE[sidx + 1 :]
        )
    if var == "chp1":
        return BASE[:sidx] + [(t, min(ch + 1, 16), d1, d2)] + BASE[sidx + 1 :]
    if var == "ty":
        nt = NEXT_TYPE[t]
        return BASE[:sidx] + [(nt, ch, d1, d2 if nt != "pc" else 0)] + BASE[sidx + 1 :]
    return None


def chunk_of(path: str) -> bytes:
    for b in parse_capture(path):
        if (
            len(b) >= 12
            and b[3] == 0x0D
            and b[4] == 0x49
            and (b[9], b[10], b[11]) == (0, 0, 0)
        ):
            p = b[12:-1]
            if p[:5] == bytes([0, 0x10, 0x7E, 0, 0]):
                p = p[5:]
            return p
    return b""


def main() -> None:
    ok = bad = 0
    slots_bad = 0
    for path in sorted(glob.glob("captures/09_06/camp_a*.log")):
        name = path.split("/")[-1].replace(".log", "")
        exp = expected_for(name)
        if exp is None:
            continue
        chunk = chunk_of(path)
        exp_msgs = [
            {"channel": ch, "type": t, "data1": d1, "data2": d2}
            for t, ch, d1, d2 in exp
        ]
        got = decode_bank_a_slots(chunk)
        if got == exp_msgs:
            ok += 1
        else:
            bad += 1
            for i, e in enumerate(exp_msgs):
                g = got[i] if i < len(got) else None
                if g != e:
                    slots_bad += 1
                    print(f"  {name} slot{i + 1}: exp={e} got={g}")
    print(f"\n{ok}/{ok + bad} captures exact; {slots_bad} slot mismatches")


if __name__ == "__main__":
    main()
