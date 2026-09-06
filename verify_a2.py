#!/usr/bin/env python3
"""Verify bank A slots 2-7 decoders against the b-sweep captures.
Baseline (10-slot): s1 cc4/17/55 s2 no6/31/99 s3 off8/55/77 s4 pc3/44/0
s5 cc5/13/66 s6 no7/21/100 s7 cc9/33/96 s8 cc2/66/22 s9 cc4/77/1
s10 cc6/100/96. Variants change ONE slot field."""

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


def expected(name: str) -> list[dict] | None:
    base = name[len("camp_b") :]  # e.g. "2_d2p3"
    if base == "":
        return None
    sidx = int(base[0]) - 1
    var = base[2:] if "_" in base else base
    if var in ("d2p3", "d2p15", "d1p3", "d1hi", "chp1", "ty", "ty2", "chd"):
        t, ch, d1, d2 = BASE[sidx]
        if var == "d2p3":
            v = (t, ch, d1, d2 + 3)
        elif var == "d2p15":
            v = (t, ch, d1, min(d2 + 15, 127))
        elif var == "d1p3":
            v = (t, ch, min(d1 + 3, 127), d2)
        elif var == "d1hi":
            v = (t, ch, (d1 + 33) & 0x7F, d2)
        elif var == "chp1":
            v = (t, min(ch + 1, 16), d1, d2)
        elif var == "ty":
            nt = NEXT_TYPE[t]
            v = (nt, ch, d1, d2 if nt != "pc" else 0)
        elif var == "ty2":
            nt = NEXT_TYPE[NEXT_TYPE[t]]
            v = (nt, ch, d1, 0)
        elif var == "chd":
            v = (t, max(ch - 1, 1), d1, d2)
        msgs = BASE[:sidx] + [v] + BASE[sidx + 1 :]
        return [
            {"channel": c, "type": ty, "data1": a, "data2": b} for ty, c, a, b in msgs
        ]
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
    per_slot: dict[int, list[tuple]] = {}
    for path in sorted(glob.glob("captures/09_06/camp_b[2-7]_*.log")):
        name = path.split("/")[-1].replace(".log", "")
        exp = expected(name)
        if exp is None:
            continue
        chunk = chunk_of(path)
        got = decode_bank_a_slots(chunk)
        if got == exp:
            ok += 1
        else:
            bad += 1
            for i, e in enumerate(exp):
                g = got[i] if i < len(got) else None
                if g != e:
                    per_slot.setdefault(i + 1, []).append((name, e, g))
    print(f"{ok}/{ok + bad} b-sweep captures exact")
    for sidx in sorted(per_slot):
        rows = per_slot[sidx]
        print(f"\nslot {sidx}: {len(rows)} mismatches")
        for name, e, g in rows[:6]:
            print(f"  {name}: exp={e} got={g}")


if __name__ == "__main__":
    main()
