#!/usr/bin/env python3
"""Random banks on feet B/C/D for stored-region solving + spot checks.

Per variant: select the foot (reopen resets to A, so every variant
re-selects), fill a deterministic random 10-slot bank, capture the init
read-back. The viewed area shows foot A after reopen; the foot's own data
lands in its stored home, mapped in /tmp/stored_map.json for the solver.
Usage: python3 rand_stored.py <foot> <bank> <seed> <count>."""

from __future__ import annotations

import glob
import json
import os
import sys

sys.path.insert(0, ".")
from anchor_feet import ensure_foot, run_one
from rand_verify import gen_bank


def prior_capture(name: str) -> str:
    """Existing capture file for a fill name (any date/prefix), or ""."""
    pat = f"captures/*/*_camp_{name}.log"
    hits = (p for p in glob.glob(pat) if os.path.getsize(p) > 0)
    return min(hits, default="")


MAP_PATH = "/tmp/stored_map.json"


def main() -> None:
    foot, bank = sys.argv[1], sys.argv[2]
    seed, count = int(sys.argv[3]), int(sys.argv[4])
    import random

    mapping: dict[str, list[list]] = {}
    if os.path.exists(MAP_PATH):
        mapping = json.load(open(MAP_PATH))
    rng = random.Random(seed)
    prefix = f"f{foot.upper()}st_{bank}_{seed}"
    for n in range(count):
        msgs = gen_bank(rng, bank)
        name = f"{prefix}_{n}"
        if prior_capture(name):
            mapping[f"camp_{name}.log"] = [list(m) for m in msgs]
            print(f"  SKIP {name} (already on disk)", flush=True)
            continue
        print(f"== {name} (foot {foot.upper()} bank {bank.upper()})", flush=True)
        if not ensure_foot(foot):
            print(f"  FAILED to select foot {foot.upper()}, skipping", flush=True)
            continue
        if run_one(name, bank, msgs):
            mapping[f"camp_{name}.log"] = [list(m) for m in msgs]
            print(f"  OK {name}", flush=True)
        else:
            print(f"  FAILED {name}", flush=True)
        with open(MAP_PATH, "w") as f:
            json.dump(mapping, f, indent=1)
    with open(MAP_PATH, "w") as f:
        json.dump(mapping, f, indent=1)
    print(f"saved {MAP_PATH} with {len(mapping)} entries", flush=True)


if __name__ == "__main__":
    main()
