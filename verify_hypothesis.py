#!/usr/bin/env python3
"""Verify the hypothesized checksum:

  D = message bytes after F0 .. byte before the two checksum bytes
  S = unsigned sum(D)
  Q = D[8]  (first address byte)
  V = D[-1] (value byte)
  X = K - S - Q - V          (09 49 config family)
  X = K - S                  (ACK / discovery / other families)
  checksum[0] = X & 0x7F ; checksum[1] = (X >> 7) & 0x7F   (mod 2^14)

K per address family:
  09 49: 0,1,4-12,93 -> 0x28A ; 510 -> 0x38B ; 927 -> 0x18B ;
         23637-23642 -> 0x20B ; fs D (1344) -> 0x38B
  01 08 ACK          -> 0x13A  (X = K - S)
  45 discovery       -> 0x136  (single byte 7F)
  other/unknown      -> 0x200  (X = K - S)

Runs over every captured message in captures/09_05 and captures/09_06,
plus the config-page writes (09 41 40) as a bonus test.
"""

from __future__ import annotations

import glob
import sys

sys.path.insert(0, ".")
from analyze_captures import parse_capture


def chk_val(msg: bytes) -> tuple[int, int] | None:
    """Return (X_from_checksum, (low_byte, high_byte)) if the last two
    bytes look like the designed checksum, else None.

    Transmission order is [low7, high7, F7]: the worked example
    `...00 74 03 F7` with X = 0x1F4 gives low = X&0x7F = 0x74,
    high = (X>>7)&0x7F = 0x03.
    """
    if len(msg) < 6 or msg[-1] != 0xF7:
        return None
    c_low, c_high = msg[-3], msg[-2]
    if c_low & 0x80 or c_high & 0x80:
        return None
    return (c_low | (c_high << 7)), (c_low, c_high)


def split14(v: int) -> tuple[int, int]:
    v %= 1 << 14
    return (v & 0x7F, (v >> 7) & 0x7F)


def main() -> None:
    paths = sorted(glob.glob("captures/09_05/*.log")) + sorted(
        glob.glob("captures/09_06/*.log")
    )
    msg_kinds = {
        "09 49": [],
        "01 08": [],
        "45": [],
        "09 41 40": [],
        "0D": [],
        "other": [],
    }
    examples = {}
    for path in paths:
        for b in parse_capture(path):
            if len(b) < 6:
                continue
            d = b[3]
            f = b[4] if len(b) > 4 else 0
            op = b[5] if len(b) > 5 else 0
            if d == 0x09 and f == 0x49:
                msg_kinds["09 49"].append(b)
            elif d == 0x01 and f == 0x08:
                msg_kinds["01 08"].append(b)
            elif d == 0x45:
                msg_kinds["45"].append(b)
            elif d == 0x09 and f == 0x41 and op == 0x40:
                msg_kinds["09 41 40"].append(b)
            elif d == 0x0D:
                msg_kinds["0D"].append(b)
            else:
                msg_kinds["other"].append(b)

    for kind, msgs in msg_kinds.items():
        print(f"{kind}: {len(msgs)} messages")
        examples[kind] = msgs[:3]

    print("\n=== 09 49 config (X = K - S - Q - V) ===")
    k_by_q: dict[int, set[int]] = {}
    for b in msg_kinds["09 49"]:
        cv = chk_val(b)
        if not cv:
            continue
        X_obs, (c_low, c_high) = cv
        D = b[1:-3]
        S = sum(D)
        Q = D[8] if len(D) > 8 else 0
        V = D[-1] if D else 0
        K_needed = (X_obs + S + Q + V) % (1 << 14)
        k_by_q.setdefault(Q, set()).add(K_needed)
    for q in sorted(k_by_q):
        ks = k_by_q[q]
        status = "OK" if len(ks) == 1 else "MULTI"
        print(f"  Q={q:#04x} ({q}): K = {[hex(k) for k in sorted(ks)]} [{status}]")
    # verify with claimed mapping
    claimed = {}
    for q, K in [
        (0, 0x28A),
        (1, 0x28A),
        (4, 0x28A),
        (5, 0x28A),
        (6, 0x28A),
        (7, 0x28A),
        (8, 0x28A),
        (9, 0x28A),
        (10, 0x28A),
        (11, 0x28A),
        (12, 0x28A),
        (0x5D, 0x28A),
        (0x7E, 0x38B),
        (0x1F, 0x18B),
        (0x40, 0x38B),
    ]:
        claimed[q] = K
    ok = 0
    total = 0
    for b in msg_kinds["09 49"]:
        cv = chk_val(b)
        if not cv:
            continue
        X_obs, (c_low, c_high) = cv
        D = b[1:-3]
        S, Q, V = sum(D), (D[8] if len(D) > 8 else 0), (D[-1] if D else 0)
        K = claimed.get(Q)
        if K is None:
            continue
        total += 1
        X = K - S - Q - V
        got = split14(X)
        if got == (c_low, c_high):
            ok += 1
        else:
            print(
                f"  FAIL {b[9]:02x}{b[10]:02x} {b[17] if len(b) > 17 else 0:02x}: "
                f"obs {c_low:02x}{c_high:02x} calc {got[0]:02x}{got[1]:02x}"
            )
    print(f"  claimed-mapping check: {ok}/{total} messages reproduce bit-perfect")

    print("\n=== 01 08 ACK (X = K - S, K=0x13A) ===")
    ok = total = 0
    fails = 0
    for b in msg_kinds["01 08"]:
        cv = chk_val(b)
        if not cv:
            continue
        X_obs, (c_low, c_high) = cv
        D = b[1:-3]
        S = sum(D)
        total += 1
        X = 0x13A - S
        if split14(X) == (c_low, c_high):
            ok += 1
        else:
            fails += 1
            if fails <= 3:
                calc_show = split14(X)
                print(
                    f"  FAIL {b.hex(' ')}: obs {c_low:02x} {c_high:02x} "
                    f"calc {calc_show}"
                )
    print(f"  {ok}/{total} ACKs reproduce")

    print(
        "\n=== 09 41 40 config pages "
        "(bonus: X = K - S, try K 0x28A/0x200/0x38B/0x18B/0x20B) ==="
    )
    for K in (0x28A, 0x200, 0x38B, 0x18B, 0x20B):
        ok = total = 0
        for b in msg_kinds["09 41 40"]:
            cv = chk_val(b)
            if not cv:
                continue
            X_obs, (c_low, c_high) = cv
            D = b[1:-3]
            total += 1
            if split14(K - sum(D)) == (c_low, c_high):
                ok += 1
        print(f"  K={K:#06x}: {ok}/{total} pages reproduce")

    print("\n=== 0D read req/resp (bonus: X = K - S, try K candidates) ===")
    for K in (0x200, 0x111, 0x280, 0x136, 0x13A, 0x28A):
        ok = total = 0
        for b in msg_kinds["0D"]:
            cv = chk_val(b)
            if not cv:
                continue
            X_obs, (c_low, c_high) = cv
            D = b[1:-3]
            total += 1
            if split14(K - sum(D)) == (c_low, c_high):
                ok += 1
        print(f"  K={K:#06x}: {ok}/{total} reproduce")


if __name__ == "__main__":
    main()
