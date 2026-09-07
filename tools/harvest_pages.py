#!/usr/bin/env python3
"""Harvest 09 41 40 page-write (payload, checksum) pairs from captures.

Rebuilds /tmp/pagepairs.pkl: [((subhi, sublo, off0, off1), payload, chk)].
Run tools from the repo root (uses analyze_captures.find_capture glob).
"""

from __future__ import annotations

import glob
import pickle
import sys

sys.path.insert(0, "tools")

from analyze_captures import parse_capture  # noqa: E402


def main() -> int:
    pairs = []
    nfiles = 0
    for path in sorted(glob.glob("captures/*/*.log")):
        try:
            msgs = parse_capture(path)
        except Exception:  # noqa: BLE001
            continue
        nfiles += 1
        for b in msgs:
            if len(b) >= 12 and b[3] == 0x09 and b[4] == 0x41 and b[5] == 0x40:
                addr = (b[8], b[9], b[10], b[11])
                pairs.append((addr, bytes(b[12:-3]), bytes(b[-3:-1])))
    pickle.dump(pairs, open("/tmp/pagepairs.pkl", "wb"))
    print(f"{len(pairs)} page pairs from {nfiles} captures -> /tmp/pagepairs.pkl")
    return 0


if __name__ == "__main__":
    sys.exit(main())
