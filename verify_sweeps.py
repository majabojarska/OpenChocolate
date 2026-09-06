#!/usr/bin/env python3
"""Verify decode_b_slots against the full sweep corpus (camp_w/x/y/*)."""

from __future__ import annotations

import glob
import sys

sys.path.insert(0, ".")
from analyze_captures import parse_capture
from trace import decode_b_slots

BASE10 = [
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
]

NEXT_TYPE = {"cc": "noteon", "noteon": "noteoff", "noteoff": "pc", "pc": "cc"}


def expected_for(name: str) -> list[tuple] | None:
    """Return the expected bank B messages for a sweep capture name."""
    if name.startswith("camp_w"):
        # camp_w<idx>_<var>
        rest = name[len("camp_w") :]
        idx = int(rest[0]) - 1
        var = rest[2:]
        t, ch, d1, d2 = BASE10[idx]
        if var == "d2p3":
            return BASE10[:idx] + [(t, ch, d1, d2 + 3)] + BASE10[idx + 1 :]
        if var == "d2p15":
            return BASE10[:idx] + [(t, ch, d1, min(d2 + 15, 127))] + BASE10[idx + 1 :]
        if var == "d1p3":
            return BASE10[:idx] + [(t, ch, min(d1 + 3, 127), d2)] + BASE10[idx + 1 :]
        if var == "d1hi":
            return (
                BASE10[:idx]
                + [(t, ch, min((d1 + 33) & 0x7F, 127), d2)]
                + BASE10[idx + 1 :]
            )
        if var == "chp1":
            return BASE10[:idx] + [(t, min(ch + 1, 16), d1, d2)] + BASE10[idx + 1 :]
        if var == "ty":
            nt = NEXT_TYPE[t]
            return (
                BASE10[:idx]
                + [(nt, ch, d1, d2 if nt != "pc" else 0)]
                + BASE10[idx + 1 :]
            )
        return None
    if name.startswith("camp_x_s4ch"):
        ch = int(name.split("ch")[1])
        return BASE10[:3] + [("noteoff", ch, 44, 66)] + BASE10[4:]
    if name.startswith("camp_x_s5ty"):
        ty = name.split("ty")[1]
        return BASE10[:4] + [(ty, 11, 55, 0 if ty == "pc" else 77)] + BASE10[5:]
    if name == "camp_x_s5d2s":
        return BASE10[:4] + [("cc", 11, 55, 9)] + BASE10[5:]
    if name.startswith("camp_x_s6ch"):
        ch = int(name.split("ch")[1])
        return BASE10[:5] + [("pc", ch, 66, 0)] + BASE10[6:]
    if name == "camp_x_s7d2s":
        return BASE10[:6] + [("noteon", 15, 77, 3)] + BASE10[7:]
    if name.startswith("camp_x_s7d1"):
        d1 = int(name.split("d1")[1])
        return BASE10[:6] + [("noteon", 15, d1, 99)] + BASE10[7:]
    if name.startswith("camp_y_s6"):
        # y_s6noteon13 / y_s6cc14
        ty = "noteon" if "noteon" in name else "cc"
        ch = int(name[-2:])
        d2 = 77 if ty == "noteon" else 100
        return BASE10[:5] + [(ty, ch, 66, d2)] + BASE10[6:]
    if name.startswith("camp_y_s7d2"):
        d2 = int(name.split("d2")[1])
        return BASE10[:6] + [("noteon", 15, 77, d2)] + BASE10[7:]
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
    exp_slots = got_slots = 0
    for path in sorted(glob.glob("captures/09_06/camp_[wxy]_*.log")):
        name = path.split("/")[-1].replace(".log", "")
        exp = expected_for(name)
        if exp is None:
            continue
        chunk = chunk_of(path)
        exp_msgs = [
            {"channel": ch, "type": t, "data1": d1, "data2": d2}
            for t, ch, d1, d2 in exp
        ]
        got = decode_b_slots(chunk)
        exp_slots += len(exp_msgs)
        got_slots += len(got)
        if got == exp_msgs:
            ok += 1
        else:
            bad += 1
            # show only the slot(s) that differ
            for i, e in enumerate(exp_msgs):
                g = got[i] if i < len(got) else None
                if g != e:
                    print(f"  {name} slot{i + 1}: exp={e} got={g}")
    print(
        f"\n{ok}/{ok + bad} sweep captures exact; {got_slots}/{exp_slots} slots decoded"
    )


if __name__ == "__main__":
    main()
