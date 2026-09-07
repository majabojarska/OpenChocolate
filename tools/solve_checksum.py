#!/usr/bin/env python3
"""Solve the 09 41 40 page-write checksum: X = K_off - sum(bit weights).

Model (proven on single-byte pairs 2026-09-07): the 14-bit checksum X
is an AFFINE BIT-WEIGHTED sum: X = (K - sum_{pos,bit} w[pos][bit] * b)
mod 2^14, with position-dependent bit weights. CRC/sum/hash families
fail because the weights are arbitrary per (pos, bit), not 0/1.

Method: collect page pairs (same off0), build DeltaX = -sum w*Deltabits
equations, least-squares solve over sparse (varying) positions, round to
integers, then verify EXACT prediction on every page.
"""

from __future__ import annotations

import itertools
import pickle
from collections import defaultdict

import numpy as np

MOD = 1 << 14


def load() -> dict:
    pairs = pickle.load(open("/tmp/pagepairs.pkl", "rb"))
    by_off: dict = defaultdict(list)
    for addr, p, c in pairs:
        by_off[addr].append((p, c[0] | (c[1] << 7)))
    return by_off


def main() -> None:
    by_off = load()
    # varying positions per off-group (only these get weights)
    varpos: dict = {}
    for addr, lst in by_off.items():
        seen: dict = {}
        for p, x in lst:
            seen.setdefault(p, x)
        uniq = list(seen.items())
        var = set()
        for (pa, _), (pb, _) in itertools.combinations(uniq, 2):
            for i, (a, b) in enumerate(zip(pa, pb)):
                if a != b:
                    var.add(i)
        varpos[addr] = (uniq, sorted(var))
        print(f"{addr}: {len(uniq)} uniq payloads, {len(var)} varying positions")
    # solve per off-group (K may differ by group)
    for addr, (uniq, var) in sorted(varpos.items()):
        if len(uniq) < 2:
            print(f"{addr}: single payload, skipping (validate-only)")
            continue
        pos_index = {p: k for k, p in enumerate(var)}
        rows = []
        rhs = []
        for (pa, xa), (pb, xb) in itertools.combinations(uniq, 2):
            dx = (xb - xa) % MOD
            if dx > MOD // 2:
                dx -= MOD
            if abs(dx) > 8000:
                continue  # possible wraparound, skip for the fit
            row = np.zeros(len(var) * 7)
            for i, (a, b) in enumerate(zip(pa, pb)):
                if a == b or i not in pos_index:
                    continue
                k = pos_index[i]
                for bit in range(7):
                    row[k * 7 + bit] = ((b >> bit) & 1) - ((a >> bit) & 1)
            if row.any():
                rows.append(row)
                rhs.append(-dx)
        A = np.array(rows)
        y = np.array(rhs)
        print(f"{addr}: {len(y)} equations, {A.shape[1]} unknowns")
        w, res, rank, _ = np.linalg.lstsq(A, y, rcond=None)
        wr = np.rint(w).astype(int)
        err = np.abs(A @ wr - y)
        print(
            f"  rank {rank}, max|err| {err.max():.3f}, n_bad {int((err > 0.5).sum())}"
        )
        nz = [
            (var[k], bit, int(wr[k * 7 + bit]))
            for k in range(len(var))
            for bit in range(7)
            if wr[k * 7 + bit] != 0
        ]
        print(f"  nonzero weights: {len(nz)}")
        for p, b, v in nz[:20]:
            print(f"    pos {p} bit {b}: {v}")


if __name__ == "__main__":
    main()
