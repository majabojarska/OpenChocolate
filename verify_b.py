#!/usr/bin/env python3
"""Verify decode_b_slots against every capture with a known bank B state."""

from __future__ import annotations

import sys

sys.path.insert(0, ".")
from analyze_captures import parse_capture
from trace import decode_b_slots

# capture -> expected 10-slot bank B messages (None = not a full-10 slot run)
EXPECT = {
    "camp_b_0": [],  # empty bank B
    "camp_b_1": [("cc", 3, 11, 33)],
    "camp_n3": [
        ("cc", 3, 11, 33),
        ("cc", 5, 22, 44),
        ("noteon", 7, 33, 55),
    ],
    "camp_n4": [
        ("cc", 3, 11, 33),
        ("cc", 5, 22, 44),
        ("noteon", 7, 33, 55),
        ("noteoff", 9, 44, 66),
    ],
    "camp_n5": [
        ("cc", 3, 11, 33),
        ("cc", 5, 22, 44),
        ("noteon", 7, 33, 55),
        ("noteoff", 9, 44, 66),
        ("cc", 11, 55, 77),
    ],
    "camp_n6": [
        ("cc", 3, 11, 33),
        ("cc", 5, 22, 44),
        ("noteon", 7, 33, 55),
        ("noteoff", 9, 44, 66),
        ("cc", 11, 55, 77),
        ("pc", 13, 66, 0),
    ],
    "camp_n8": [
        ("cc", 3, 11, 33),
        ("cc", 5, 22, 44),
        ("noteon", 7, 33, 55),
        ("noteoff", 9, 44, 66),
        ("cc", 11, 55, 77),
        ("pc", 13, 66, 0),
        ("noteon", 15, 77, 99),
        ("cc", 16, 88, 111),
    ],
    "camp_n10": [
        ("cc", 3, 11, 33),
        ("cc", 5, 22, 44),
        ("noteon", 7, 33, 55),
        ("noteoff", 9, 44, 66),
        ("cc", 11, 55, 77),
        ("pc", 13, 66, 0),
        ("noteon", 15, 77, 99),
        ("cc", 16, 88, 111),
        ("noteoff", 2, 99, 123),
        ("pc", 4, 111, 0),
    ],
}


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
    ok = 0
    bad = 0
    n_slots = 0
    for name, expected in EXPECT.items():
        chunk = chunk_of(f"captures/09_06/{name}.log")
        if not chunk:
            print(f"{name}: NO CHUNK")
            continue
        got = decode_b_slots(chunk)
        exp = [
            {"channel": ch, "type": t, "data1": d1, "data2": d2}
            for t, ch, d1, d2 in expected
        ]
        if got == exp:
            ok += 1
            n_slots += len(exp)
        else:
            bad += 1
            print(f"MISMATCH {name}:")
            print(f"   expected: {exp}")
            print(f"   got:      {got}")
    print(f"\n{ok}/{ok + bad} captures exact; {n_slots} slots decoded")


if __name__ == "__main__":
    main()
