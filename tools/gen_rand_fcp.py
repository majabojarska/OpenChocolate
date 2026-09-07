#!/usr/bin/env python3
"""Generate randomized FCP files for checksum-spread campaigns.

Each file: random slot counts + random ch/type/d1/d2 across all feet and
banks A/B, random device/footswitch modes, TRS, polarity. Consecutive
files differ everywhere (rank-building); use --chain for single-field
deltas (propagation-friendly).

Usage: python3 tools/gen_rand_fcp.py <n> <outdir> [--seed N] [--chain]
Writes outdir/rand_<i>.fcp + outdir/manifest.json. Template fcp_anchor.
"""

from __future__ import annotations

import json
import os
import random
import sys

sys.path.insert(0, "tools")
sys.path.insert(0, ".")

from gen_fcp import (  # noqa: E402
    DEVICE_MODES,
    FOOT_MODES,
    FOOT_ORDER,
    MAX_SLOTS,
    TRS_MODES,
)

TYPES = ["pc", "cc", "noteon", "noteoff"]


def rand_slot(rng: random.Random) -> list:
    ty = rng.choice(TYPES)
    d2 = 0 if ty == "pc" else rng.randint(0, 127)
    return [rng.randint(1, 16), ty, rng.randint(0, 127), d2]


def rand_spec(rng: random.Random) -> dict:
    feet = {}
    for foot in FOOT_ORDER:
        feet[foot] = {
            "mode": rng.choice(list(FOOT_MODES)),
            "bank_a": [rand_slot(rng) for _ in range(rng.randint(0, MAX_SLOTS))],
            "bank_b": [rand_slot(rng) for _ in range(rng.randint(0, 10))],
        }
    return {
        "device_mode": rng.choice(list(DEVICE_MODES)),
        "trs_mode": rng.choice(list(TRS_MODES)),
        "polarity": rng.choice([True, False]),
        "feet": feet,
    }


def main() -> int:
    n = int(sys.argv[1])
    outdir = sys.argv[2]
    seed = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[3] == "--seed" else 42
    chain = "--chain" in sys.argv
    os.makedirs(outdir, exist_ok=True)
    rng = random.Random(seed)
    manifest = []
    prev = None
    for i in range(n):
        if chain and prev is not None:
            import copy

            spec = copy.deepcopy(prev)
            # single-field delta: pick a random existing slot, change one field
            foot = rng.choice(FOOT_ORDER)
            bank = rng.choice(["bank_a", "bank_b"])
            recs = spec["feet"][foot][bank]
            if not recs:
                recs.append(rand_slot(rng))
            r = rng.randrange(len(recs))
            f = rng.randrange(4)
            if f == 0:
                recs[r][0] = rng.randint(1, 16)
            elif f == 1:
                recs[r][1] = rng.choice(TYPES)
            elif f == 2:
                recs[r][2] = rng.randint(0, 127)
            else:
                recs[r][3] = 0 if recs[r][1] == "pc" else rng.randint(0, 127)
        else:
            spec = rand_spec(rng)
        prev = spec
        path = os.path.join(outdir, f"rand_{i:02d}.fcp")
        # reuse gen_fcp.main machinery via argv
        spath = os.path.join(outdir, f"rand_{i:02d}.json")
        json.dump(spec, open(spath, "w"))
        sys.argv = ["gen_fcp.py", spath, path]
        import gen_fcp

        rc = gen_fcp.main()
        if rc:
            return rc
        manifest.append(spath)
    json.dump(manifest, open(os.path.join(outdir, "manifest.json"), "w"))
    print(f"wrote {n} FCPs to {outdir} (seed {seed}, chain={chain})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
