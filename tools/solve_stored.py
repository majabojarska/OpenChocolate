#!/usr/bin/env python3
"""Per-bit solver for foot B/C/D *stored* slot-homes lacking a known-format
6-point match (see fmt_search6.py). Reuses solve_bits.solve_field with
mismatch tolerance; samples = BASE + HI anchors + 4 stored randoms (6
points per slot-home). Types are fit as empirical code tables (type ->
observed code bits), since stored type codes may differ from viewed ones.

Usage: python3 solve_stored.py (solves all missing slot-homes).
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, ".")
from analyze_captures import find_capture, parse_capture
from solve_bits import collect as collect_viewed  # noqa: F401 (reference)
from solve_bits import solve_field

ORDER = ["pc", "cc", "noteon", "noteoff"]

# (foot, bank, slot) -> (chunk addr, span start, span nbytes). Spans are
# TIGHT (bounded by CONFIRMED neighbor records): wide spans let the solver
# correlate with neighboring varying records over only 6 samples.
MISSING = {
    ("B", "a", 6): ((0, 0, 0), 613, 6),
    ("B", "b", 4): ((0, 0, 0), 693, 6),
    ("B", "b", 10): ((0, 0, 0), 727, 7),
    ("C", "a", 1): ((0, 0, 0), 1055, 12),
    ("C", "a", 8): ((0, 0, 0), 1101, 6),
    ("C", "a", 10): ((0, 0, 0), 1110, 12),
    ("C", "b", 2): ((113, 7, 0), 5, 6),
    ("C", "b", 9): ((113, 7, 0), 45, 6),
    ("D", "a", 6): ((113, 7, 0), 413, 6),
    ("D", "b", 4): ((113, 7, 0), 493, 6),
    ("D", "b", 10): ((113, 7, 0), 527, 7),
}


def payloads(path):
    out = {}
    for b in parse_capture(path):
        if len(b) >= 12 and b[3] == 0x0D and b[4] == 0x49:
            p = b[12:-1]
            if p[:5] == bytes([0, 0x10, 0x7E, 0, 0]):
                p = p[5:]
            out[(b[9], b[10], b[11])] = p
    return out


def load_groups() -> dict[tuple[str, str], list[tuple[str, list]]]:
    anchor = json.load(open("/tmp/anchor_map.json"))
    stored = {}
    if os.path.exists("/tmp/stored_map.json"):
        stored = json.load(open("/tmp/stored_map.json"))
    out: dict[tuple[str, str], list[tuple[str, list]]] = {}
    for foot in "BCD":
        for bank in "ab":
            grp = []
            for suffix in ("base", "hi"):
                name = f"camp_f{foot}_{bank}_{suffix}.log"
                grp.append((name, anchor[name]))
            for name, msgs in sorted(stored.items()):
                if name.startswith(f"camp_f{foot}st_{bank}_"):
                    grp.append((name, msgs))
            out[(foot, bank)] = grp
    return out


def main() -> None:
    groups = load_groups()
    for (foot, bank, slot), (addr, start, nb) in MISSING.items():
        grp = groups[(foot, bank)]
        hdr0 = f"== foot {foot} bank {bank.upper()} slot {slot}: "
        chunks = []
        for name, _ in grp:
            p = payloads(find_capture(name)).get(addr, b"")
            if p:
                chunks.append(p)
        if len(chunks) != len(grp):
            print(hdr0 + f"short {len(chunks)}/{len(grp)}, skip")
            continue
        nbits = nb * 8
        samples = []
        for (name, msgs), chunk in zip(grp, chunks):
            m = msgs[slot - 1]
            rec = int.from_bytes(chunk[start : start + nb], "little")
            samples.append((name, rec, ORDER.index(m[0]), m[1] - 1, m[2], m[3]))
        hdr = f"== foot {foot} bank {bank.upper()} slot {slot} "
        print(hdr + f"({len(samples)} samples)")
        for fname, fi, width in (("ch-1", 1, 4), ("d1", 2, 7), ("d2", 3, 7)):
            vals = [(rec, v[fi]) for _, rec, *v in samples]
            combo, dissenters = solve_field(
                vals, nbits, width, start, (start, start + nb - 1), tol=1
            )
            if combo is None:
                print(f"   {fname}: NO FIT")
                continue
            detail = ",".join(f"b{k}@+{p // 8}:{p % 8}" for k, p in enumerate(combo))
            dis = ""
            if dissenters:
                dis = " dissenters: " + ",".join(
                    f"{samples[i][0]}(got{got})" for i, got in dissenters
                )
            print(f"   {fname}: [{detail}]{dis}")
        # empirical type codes: bits constant within each type group
        by_type: dict[int, list[int]] = {}
        for _, rec, t, _, _, _ in samples:
            by_type.setdefault(t, []).append(rec)
        code_bits = []
        for p in range(nbits):
            firsts = {recs[0] for recs in by_type.values()}
            if len({(r >> p) & 1 for r in firsts}) > 1 and all(
                len({(rec >> p) & 1 for rec in recs}) == 1 for recs in by_type.values()
            ):
                code_bits.append(p)
        print(f"   type-code bits: {[(p // 8 + start, p % 8) for p in code_bits]}")
        for t in sorted(by_type):
            code = [
                (p // 8 + start, p % 8, (by_type[t][0] >> p) & 1) for p in code_bits
            ]
            print(f"     {ORDER[t]}: {code}")


if __name__ == "__main__":
    main()
