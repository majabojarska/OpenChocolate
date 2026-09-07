#!/usr/bin/env python3
"""Solve checksum bit-exponents e(i,bit) via constraint propagation.

Model: X = K - 4*S, S = sum 2^e(i,bit) * bit(i,bit). Each page pair gives
S_diff = sum_{clears} 2^e - sum_{sets} 2^e (known integer). Single-bit
pairs assign e directly; multi-byte pairs propagate: substitute knowns,
and if the remainder is a signed power of two attributable to one
unknown bit, assign it. Iterate to fixpoint.
"""

from __future__ import annotations

import itertools
import pickle
from collections import defaultdict


def load_pairs() -> list:
    pairs = pickle.load(open("/tmp/pagepairs.pkl", "rb"))
    by_key = defaultdict(list)
    for addr, p, c in pairs:
        by_key[addr].append((p, c[0] | (c[1] << 7)))
    out = []
    for addr, lst in by_key.items():
        seen = {}
        for p, x in lst:
            seen.setdefault(p, x)
        uniq = list(seen.items())
        if len(uniq) < 2:
            continue
        for (pa, xa), (pb, xb) in itertools.combinations(uniq, 2):
            if pa == pb:
                continue
            dx = (xb - xa) % 16384
            if dx > 8192:
                dx -= 16384
            assert dx % 4 == 0, f"dX={dx} not mult of 4"
            s = -dx // 4
            clears, sets = [], []
            for i, (a, b) in enumerate(zip(pa, pb)):
                d = a ^ b
                bit = 0
                while d:
                    if d & 1:
                        if (b >> bit) & 1:
                            sets.append((addr, i, bit))
                        else:
                            clears.append((addr, i, bit))
                    d >>= 1
                    bit += 1
            out.append((clears, sets, s))
    return out


def main() -> None:
    pairs = load_pairs()
    print(f"{len(pairs)} pair equations")
    e: dict[tuple[int, int], int] = {}
    # round 0: single-bit pairs
    for clears, sets, s in pairs:
        if len(clears) + len(sets) == 1:
            if s == 0:
                continue  # invisible bit (e>=12 or weight 0); don't-care
            if abs(s) not in (
                1,
                2,
                4,
                8,
                16,
                32,
                64,
                128,
                256,
                512,
                1024,
                2048,
                4096,
            ):
                print(f"non-power single-bit S={s}, skipping")
                continue
            key = (clears or sets)[0]
            v = s.bit_length() - 1
            if key in e:
                assert e[key] == v, f"conflict {key}: {e[key]} vs {v}"
            else:
                e[key] = v
    print(f"seeded {len(e)} exponents from single-bit pairs")
    parent: dict[tuple, tuple] = {}

    def find(k):
        while parent.get(k, k) != k:
            parent[k] = parent.get(parent[k], parent[k])
            k = parent[k]
        return k

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra == rb:
            return False
        # attach higher exponent guess? just union; values resolved later
        parent[ra] = rb
        return True

    # round A: union 1-set/1-clear pairs with zero remainder (same e)
    # round B: single-unknown power-of-2 assignment; iterate both
    order = sorted(pairs, key=lambda t: len(t[0]) + len(t[1]))
    skipped = 0
    changed = True
    rounds = 0
    import itertools as _it

    def _decomp(net, rem):
        """Unique assignment for small nets, or None.

        net: {class: +1/-1}; equation sum(net*2^e) = -rem, e in 0..11.
        Enumerates all combos (k<=3 classes); returns {class: e} iff the
        solution is unique (up to identical-class symmetry, pre-merged).
        """
        keys = list(net)
        signs = [net[k] for k in keys]
        target = -rem
        sols = []
        for combo in _it.product(range(12), repeat=len(keys)):
            if sum(s * (1 << v) for s, v in zip(signs, combo)) == target:
                sols.append(combo)
                if len(sols) > 1:
                    return None
        if len(sols) != 1:
            return None
        return dict(zip(keys, sols[0]))

    changed = True
    rounds = 0
    while changed:
        changed = False
        rounds += 1
        for clears, sets, s in order:
            # net coefficient per union class (+1 set / -1 clear)
            rem = s
            net: dict[tuple, int] = {}
            for key in clears:
                r = find(key)
                if r in e:
                    rem += 1 << e[r]
                else:
                    net[r] = net.get(r, 0) - 1
            for key in sets:
                r = find(key)
                if r in e:
                    rem -= 1 << e[r]
                else:
                    net[r] = net.get(r, 0) + 1
            net = {k: v for k, v in net.items() if v != 0}
            if not net:
                if rem != 0:
                    skipped += 1
                continue
            if len(net) == 2:
                (a, sa), (b, sb) = list(net.items())
                if rem == 0 and sa == 1 and sb == -1 and union(a, b):
                    changed = True
                elif rem == 0 and sa == -1 and sb == 1 and union(a, b):
                    changed = True
                continue
            if 1 <= len(net) <= 3:
                sol = _decomp(net, rem)
                if sol is None:
                    continue
                for k, v in sol.items():
                    if k in e:
                        if e[k] != v:
                            skipped += 1
                            break
                    else:
                        e[k] = v
                        changed = True
    print(f"fixpoint after {rounds} rounds: {len(e)} known, {skipped} skipped")
    # flatten union classes with known values
    resolved = 0
    for k in list(parent):
        r = find(k)
        if r in e and k not in e:
            e[k] = e[r]
            resolved += 1
    print(f"union-resolved: {resolved}, total known: {len(e)}")
    # report coverage + verify all pairs
    bad = 0
    for clears, sets, s in pairs:
        try:
            pred = sum(1 << e[k] for k in sets) - sum(1 << e[k] for k in clears)
        except KeyError:
            continue
        if pred != s:
            bad += 1
    n_chk = sum(1 for c, t, s in pairs if all(k in e for k in c + t))
    print(f"pairs fully checkable: {n_chk}, mismatches: {bad}")
    import pickle as pk

    pk.dump(e, open("/tmp/chexp.pkl", "wb"))
    print("saved /tmp/chexp.pkl")


if __name__ == "__main__":
    main()
