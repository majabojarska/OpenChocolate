#!/usr/bin/env python3
"""Six-point format matcher for foot B/C/D stored regions.

For each stored home, slot and known packing: encode the slot's message in
all 6 captures sharing the home (BASE + HI anchors + 4 stored randoms) and
require the encoded bytes at the SAME offset in all 6. A 6-point match
(30 bytes) is essentially certain. Prints (slot, format, offset) hits.
Usage: python3 fmt_search6.py."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, ".")
from analyze_captures import parse_capture
from fmt_search import BASE_A, BASE_B, FMTS

# stored homes: (foot, bank) -> (chunk addr, search lo, search hi)
HOMES = {
    ("B", "a"): ((0, 0, 0), 580, 700),
    ("B", "b"): ((0, 0, 0), 665, 785),
    ("C", "a"): ((0, 0, 0), 1050, 1155),
    ("C", "b"): ((113, 7, 0), 0, 110),
    ("D", "a"): ((113, 7, 0), 380, 500),
    ("D", "b"): ((113, 7, 0), 465, 575),
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


def load_msgs() -> dict[tuple[str, str], list[tuple[str, list]]]:
    """(foot, bank) -> [(capture name, 10 msgs)] x6 (BASE + HI + 4 randoms)."""
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
            base = BASE_A if bank == "a" else BASE_B
            _ = base
            for name, msgs in sorted(stored.items()):
                if name.startswith(f"camp_f{foot}st_{bank}_"):
                    grp.append((name, msgs))
            out[(foot, bank)] = grp
    return out


def main() -> None:
    groups = load_msgs()
    for (foot, bank), grp in groups.items():
        print(f"== foot {foot} bank {bank.upper()} ({len(grp)} captures)")
        addr, lo, hi_off = HOMES[(foot, bank)]
        chunks = []
        for name, _ in grp:
            for d in ("captures/09_06", "captures/09_05"):
                p = payloads(f"{d}/{name}").get(addr, b"")
                if p:
                    chunks.append(p)
                    break
        if len(chunks) != len(grp):
            print(f"   only {len(chunks)}/{len(grp)} chunks parsed, skipping")
            continue
        base_msgs = BASE_A if bank == "a" else BASE_B
        _ = base_msgs
        for i in range(10):
            for fname, enc in FMTS.items():
                pats = []
                ok = True
                for (_, msgs), _chunk in zip(grp, chunks):
                    m = msgs[i]
                    try:
                        pats.append(enc(*m))
                    except KeyError:
                        ok = False
                        break
                if not ok:
                    continue
                n = len(pats[0])
                for off in range(lo, hi_off - n):
                    if all(c[off : off + n] == pat for c, pat in zip(chunks, pats)):
                        print(f"  slot{i + 1} {fname} @{off} ({len(grp)}pt)")
                        break


if __name__ == "__main__":
    main()
