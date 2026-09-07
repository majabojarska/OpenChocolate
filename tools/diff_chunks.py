#!/usr/bin/env python3
"""Diff the 000000 read chunks between two captures (and all read chunks)."""

from __future__ import annotations

import re
import sys

_EVENT_RE = re.compile(r"^\s*(\d+:\d+)\s+(.*)$")


def parse_capture(path: str) -> list[bytes]:
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


def read_chunks(path: str) -> dict[tuple[int, int, int], bytes]:
    out: dict[tuple[int, int, int], bytes] = {}
    for b in parse_capture(path):
        if len(b) >= 12 and b[3] == 0x0D and b[4] == 0x49:
            p = b[12:-1]
            if p[:5] == bytes([0, 0x10, 0x7E, 0, 0]):
                p = p[5:]
            out[(b[9], b[10], b[11])] = p
    return out


def main(a: str, b: str) -> None:
    ca = read_chunks(a)
    cb = read_chunks(b)
    for addr in sorted(set(ca) | set(cb)):
        pa = ca.get(addr, b"")
        pb = cb.get(addr, b"")
        if pa == pb:
            continue
        n = max(len(pa), len(pb))
        diffs = [
            (i, pa[i] if i < len(pa) else None, pb[i] if i < len(pb) else None)
            for i in range(n)
            if (pa[i] if i < len(pa) else 0) != (pb[i] if i < len(pb) else 0)
        ]
        print(f"addr={addr[0]:02X}{addr[1]:02X}{addr[2]:02X}: {len(diffs)} diffs")
        for i, va, vb in diffs[:40]:

            def _s(v: int | None) -> str:
                return f"{v:>3}" if v is not None else " --"

            print(f"    @{i:4d}: {_s(va)} -> {_s(vb)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
