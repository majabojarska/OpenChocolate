#!/usr/bin/env python3
"""Offline analysis of choco MIDI captures: extract `09 41 40` config
writes (ground truth) and `0D 49` read-back responses (encoded config)
from aseqdump logs, rebuild the 000000 chunk, and correlate.

Usage:
    python analyze_captures.py <capture.log> [<capture.log> ...]
"""

from __future__ import annotations

import re
import sys

_EVENT_RE = re.compile(r"^\s*(\d+:\d+)\s+(.*)$")
_SPLIT_RE = re.compile(r"\s{2,}")


def parse_capture(path: str) -> list[bytes]:
    """Parse an aseqdump log into a list of SysEx byte strings (per port)."""
    sysex: list[bytes] = []
    cur: list[int] = []
    for line in open(path):
        m = _EVENT_RE.match(line)
        if not m:
            continue
        _port, rest = m.group(1), m.group(2).strip()
        if "System exclusive" not in rest:
            continue
        toks = re.findall(r"\b[0-9A-Fa-f]{2}\b", rest)
        if not toks:
            continue
        vals = [int(t, 16) for t in toks]
        if cur and vals[0] == 0xF0:
            sysex.append(bytes(cur))
            cur = vals
        else:
            cur += vals
    if cur:
        sysex.append(bytes(cur))
    return sysex


def analyze(path: str) -> None:
    msgs = parse_capture(path)
    writes: list[bytes] = []
    reads: list[bytes] = []
    for b in msgs:
        if len(b) < 8:
            continue
        if b[3] == 0x09 and b[4] == 0x41 and b[5] == 0x40:
            writes.append(b)
        elif b[3] == 0x0D and b[4] == 0x49:
            reads.append(b)
    print(f"== {path}: {len(msgs)} sysex, {len(writes)} writes, {len(reads)} reads")
    # show distinct write selectors/offsets
    seen: dict[tuple[int, int, int], int] = {}
    for w in writes:
        if len(w) >= 12:
            key = (w[8], w[9], w[10])  # sub-hi, sub-lo, offset
            seen[key] = seen.get(key, 0) + 1
    for key, n in sorted(seen.items()):
        print(f"   write sub={key[0]:02X}{key[1]:02X} off={key[2]:02X} x{n}")
    # dump the last write per offset (payload after the 12-byte header)
    last: dict[tuple[int, int, int], bytes] = {}
    for w in writes:
        if len(w) >= 12:
            last[(w[8], w[9], w[10])] = w
    for key, w in sorted(last.items()):
        payload = w[12:-3]  # strip trailing checksum 2 + F7
        nz = [(i, v) for i, v in enumerate(payload) if v]
        print(
            f"   write sub={key[0]:02X}{key[1]:02X} off={key[2]:02X} "
            f"len={len(payload)} nz={len(nz)}: {nz[:24]}"
        )
    # the 000000 read chunk payload
    for r in reads:
        if len(r) >= 12 and (r[9], r[10], r[11]) == (0, 0, 0):
            p = r[12:-1]
            if p[:5] == bytes([0, 0x10, 0x7E, 0, 0]):
                p = p[5:]
            nz = [(i, v) for i, v in enumerate(p) if v]
            print(f"   read 000000 len={len(p)} nz={len(nz)}: {nz[:40]}")
    # show read addresses
    addrs: dict[tuple[int, int, int], int] = {}
    for r in reads:
        if len(r) >= 12:
            key = (r[9], r[10], r[11])
            addrs[key] = addrs.get(key, 0) + 1
    for key, n in sorted(addrs.items()):
        print(f"   read  addr={key[0]:02X}{key[1]:02X}{key[2]:02X} x{n}")


if __name__ == "__main__":
    for path in sys.argv[1:]:
        analyze(path)
