#!/usr/bin/env python3
"""Per-bit solver for bank A slots 2-7 (viewed records).

Fits each field (ch-1, d1, d2) as a scattered set of LSB-first record bits
using ALL samples: the b-sweeps (small deltas + type flips), a_base,
a_hi57, a6d2v1/2, and the /tmp/ba_map.json value-spread campaign
(d1/d2 across 1..127, ch=16) that constrains the HIGH bits the old sweeps
never varied. Prints working bit combos per slot/field; type codes are
NOT refit (kept from the decoder, verified against ty samples).

Usage: python3 pick_bits.py [slot ...]  (default: slots 2-7)
"""

from __future__ import annotations

import glob
import json
import os
import sys

sys.path.insert(0, ".")
from analyze_captures import find_capture, logical_name, parse_capture
from pick_bits import expected_bank as legacy_expected

ORDER = ["pc", "cc", "noteon", "noteoff"]

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

HI57 = [
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

LEGACY = {"camp_a_base.log": BASE, "camp_a_hi57.log": HI57}

# captures whose fill missed a slot (decoded != filled): drop per slot.
DROPPED: dict[str, set[int]] = {"camp_s6d2v2.log": {4}}

# core viewed-record bytes per slot (preferred when several positions fit:
# fields live in their own record; ambiguous out-of-record bits broke
# rand_verify before). Span must cover core.
SPANS = {2: (113, 7), 3: (119, 7), 4: (124, 8), 5: (130, 7), 6: (136, 7), 7: (141, 8)}
CORE = {
    2: (114, 118),
    3: (120, 124),
    4: (125, 130),
    5: (131, 135),
    6: (137, 141),
    7: (142, 147),
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


def collect() -> dict[str, list[tuple]]:
    """capture-name -> expected 10 messages (as tuples)."""
    out: dict[str, list[tuple]] = {}
    if os.path.exists("/tmp/ba_map.json"):
        for name, msgs in json.load(open("/tmp/ba_map.json")).items():
            out[name] = [tuple(m) for m in msgs]
    for name, msgs in LEGACY.items():
        out[name] = [tuple(m) for m in msgs]
    for v in (1, 2):
        msgs = [list(m) for m in BASE]
        msgs[5] = ["noteon", 7, 21, v]
        out[f"camp_a6d2v{v}.log"] = [tuple(m) for m in msgs]
    for path in sorted(glob.glob("captures/*/*_camp_b[234567]_*.log")):
        name = logical_name(path)
        bank = legacy_expected(name)
        if bank is not None:
            out[name] = bank
    # the device ignores d2 for pc (fills always write 0); the legacy
    # b-sweep table adds +3/+15 to it, which never took. Force 0.
    for name, bank in out.items():
        out[name] = [
            (t, ch, d1, 0) if t == "pc" else (t, ch, d1, d2) for t, ch, d1, d2 in bank
        ]
    return out


def solve_field(
    samples: list[tuple[int, int]],
    nbits: int,
    width: int,
    base: int,
    core: tuple[int, int],
    tol: int = 2,
) -> tuple[list[int] | None, list[tuple[int, int]]]:
    """Best-fit record-bit positions with mismatch tolerance.

    Returns (combo, dissenters): combo reproduces the field for all samples
    except `dissenters` (sample indices). Positions must match at least
    n-tol samples per value bit (stale fills would otherwise silently kill
    the true bits). Empty dissenters = exact fit.
    """
    nrec = nbits
    n = len(samples)
    cands: list[list[int]] = []
    for k in range(width):
        scored = []
        for p in range(nrec):
            bad = sum((((rec >> p) & 1) != ((v >> k) & 1)) for rec, v in samples)
            if bad <= tol:
                scored.append((bad, p))
        if not scored:
            return None, []
        scored.sort(
            key=lambda t: (
                t[0],
                0 if core[0] <= base + t[1] // 8 <= core[1] else 1,
                t[1],
            )
        )
        cands.append([p for _, p in scored])
    order = sorted(range(width), key=lambda k: len(cands[k]))
    combo: dict[int, int] = {}
    best: list[int] | None = None
    best_bad = n + 1

    def combo_bad() -> int:
        bad = 0
        for _i, (rec, v) in enumerate(samples):
            got = 0
            for kk, pp in combo.items():
                got |= ((rec >> pp) & 1) << kk
            # only compare bits decided so far
            mask = sum(1 << kk for kk in combo)
            if (got & mask) != (v & mask):
                bad += 1
        return bad

    def dfs(pos: int) -> None:
        nonlocal best, best_bad
        if combo_bad() >= best_bad:
            return
        if pos == width:
            best = [combo[k] for k in range(width)]
            best_bad = combo_bad()
            return
        k = order[pos]
        for p in cands[k][:12]:
            if p in combo.values():
                continue
            combo[k] = p
            dfs(pos + 1)
            del combo[k]

    dfs(0)
    dissenters: list[tuple[int, int]] = []
    if best is not None:
        for i, (rec, v) in enumerate(samples):
            got = sum((((rec >> best[k]) & 1) << k) for k in range(width))
            if got != v:
                dissenters.append((i, got))
    return best, dissenters


def main() -> None:
    want = [int(a) for a in sys.argv[1:]] or [2, 3, 4, 5, 6, 7]
    expected = collect()
    print(f"loaded {len(expected)} captures with known banks")
    chunks = {}
    for name in expected:
        p = chunk_of(find_capture(name))
        if p:
            chunks[name] = p
    print(f"parsed {len(chunks)} chunks")
    for sidx in want:
        start, nb = SPANS[sidx]
        nbits = nb * 8
        samples = []
        snames = []
        for name, bank in expected.items():
            if name not in chunks:
                continue
            if sidx in DROPPED.get(name, ()):
                continue
            m = bank[sidx - 1]
            rec = int.from_bytes(chunks[name][start : start + nb], "little")
            samples.append((rec, ORDER.index(m[0]), m[1] - 1, m[2], m[3]))
            snames.append(name)
        print(f"== slot {sidx} ({len(samples)} samples)")
        names = snames
        for fname, fi, width in (("ch-1", 1, 4), ("d1", 2, 7), ("d2", 3, 7)):
            vals = [(rec, v[fi]) for rec, *v in samples]
            combo, dissenters = solve_field(vals, nbits, width, start, CORE[sidx])
            if combo is None:
                print(f"   {fname}: NO FIT")
                continue
            byts = sorted({(p // 8) + start for p in combo})
            detail = ",".join(f"b{k}@+{p // 8}:{p % 8}" for k, p in enumerate(combo))
            dis = ""
            if dissenters:
                dis = " dissenters: " + ",".join(
                    f"{names[i]}(got{got})" for i, got in dissenters
                )
            print(f"   {fname}: [{detail}] (bytes {byts}){dis}")


if __name__ == "__main__":
    main()
