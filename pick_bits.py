#!/usr/bin/env python3
"""Widen the d2/ch candidate search for slots 5, 6, 7 to the FULL record."""

from __future__ import annotations

import glob
import itertools
import sys

sys.path.insert(0, ".")
from analyze_captures import parse_capture

ORDER = ["pc", "cc", "noteon", "noteoff"]

_BASE = [
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


def expected_bank(name):
    n = name.replace("camp_", "")
    if n == "a_hi57":
        return [
            ("cc", 4, 17, 55),
            ("noteon", 6, 31, 99),
            ("noteoff", 8, 55, 77),
            ("pc", 3, 44, 0),
            ("cc", 5, 127, 127),
            ("noteon", 7, 127, 127),
            ("cc", 16, 127, 127),
            ("cc", 2, 66, 22),
            ("cc", 4, 77, 1),
            ("cc", 6, 100, 96),
        ]
    if n == "a_base":
        return _BASE
    if n.startswith("rand_a"):
        return None
    if n[0] == "a" and n[1] in "89":
        return _BASE
    if n[0] == "b" and n[1] in "234567":
        v = int(n[1]) - 1
        bank = _BASE.copy()
        vv = n[3:] if len(n) > 2 and n[2] == "_" else n[2:]
        t, ch, d1, d2 = _BASE[v]
        if vv.startswith("d2p3"):
            bank[v] = (t, ch, d1, d2 + 3)
        elif vv.startswith("d2p15"):
            bank[v] = (t, ch, d1, min(d2 + 15, 127))
        elif vv.startswith("d1p3"):
            bank[v] = (t, ch, min(d1 + 3, 127), d2)
        elif vv.startswith("d1hi"):
            bank[v] = (t, ch, (d1 + 33) & 0x7F, d2)
        elif vv.startswith("chp1"):
            bank[v] = (t, min(ch + 1, 16), d1, d2)
        elif vv.startswith("chd"):
            bank[v] = (t, max(ch - 1, 1), d1, d2)
        elif vv.startswith("ty2"):
            bank[v] = (ORDER[(ORDER.index(t) + 2) % 4], ch, d1, 0)
        elif vv.startswith("ty"):
            nt = ORDER[(ORDER.index(t) + 1) % 4]
            bank[v] = (nt, ch, d1, d2 if nt != "pc" else 0)
        else:
            return None
        return bank
    return None


SLOT = {5: (130, 5), 6: (136, 5), 7: (142, 5)}


def perbit_positions(samples, fi, nbits):
    """For each value bit, the set of record bit positions equal to it."""
    out = []
    for k in range(7):
        poss = []
        for pos in range(nbits):
            if all(
                (((rec >> pos) & 1) == ((vals[fi] >> k) & 1)) for rec, *vals in samples
            ):
                poss.append(pos)
        out.append(poss)
    return out


def main() -> None:
    chunks = {}
    for path in glob.glob("captures/09_06/camp_a*.log") + glob.glob(
        "captures/09_06/camp_b[234567]_*.log"
    ):
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
                chunks[path] = p
                break

    for sidx, (start, nb) in SLOT.items():
        samples = []
        for path, c in chunks.items():
            name = path.split("/")[-1].replace(".log", "")
            bank = expected_bank(name)
            if bank is None:
                continue
            m = bank[sidx - 1]
            rec = int.from_bytes(c[start : start + nb], "little")
            samples.append((rec, ORDER.index(m[0]), m[1] - 1, m[2], m[3]))
        nbits = nb * 8
        print(f"== slot {sidx}")
        for fname, fi in [("ch", 1), ("d2", 3)]:
            poss = perbit_positions(samples, fi, nbits)
            print(f"   {fname}: " + "; ".join(f"b{k}@{p}" for k, p in enumerate(poss)))
            # try combos: for each value-bit choose a position; find first
            opts = list(poss)
            if any(len(p) == 0 for p in opts):
                missing = [i for i, p in enumerate(opts) if not p]
                print(f"      (some bits have no position: {missing})")
                continue
            # cap product size
            total = 1
            for p in opts:
                total *= max(len(p), 1)
            if total > 2_000_000:
                # restrict each to first 4
                opts = [p[:4] for p in opts]
            for combo in itertools.product(*opts):
                ok = all(
                    sum(((rec >> pos) & 1) << vb for vb, pos in enumerate(combo))
                    == (t, ch, d1, d2)[fi]
                    for rec, t, ch, d1, d2 in samples
                )
                if ok:
                    print(f"      first-working: {combo}")
                    break


if __name__ == "__main__":
    main()
