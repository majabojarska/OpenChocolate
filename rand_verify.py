#!/usr/bin/env python3
"""Random bank verification (task requirement): fill bank B with 10 random
messages (double-bank mode active), capture the 0D read-back, decode, and
compare byte-exact. Saves captures/09_06/rand_<n>.log and prints per-slot
results."""

from __future__ import annotations

import random
import subprocess
import sys

TYPE_POOL = ["pc", "cc", "noteon", "noteoff"]


def spec(t: str, ch: int, d1: int, d2: int) -> str:
    return f"{t}:{ch}:{d1}:{d2}" if t != "pc" else f"{t}:{ch}:{d1}:0"


def gen_bank(rng: random.Random) -> list[tuple]:
    """Random 10-message bank: avoid the all-zeros ambiguity edge case and
    keep pc data1 >= 1 (data1 0 would be indistinguishable from empty)."""
    bank = []
    for _ in range(10):
        t = rng.choice(TYPE_POOL)
        ch = rng.randint(1, 16)
        d1 = rng.randint(1, 127)
        d2 = rng.randint(1, 127) if t != "pc" else 0
        bank.append((t, ch, d1, d2))
    return bank


def main() -> None:
    bank = "b"
    if len(sys.argv) > 1 and sys.argv[1] in ("a", "b"):
        bank = sys.argv[1]
        del sys.argv[1]
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    rng = random.Random(seed)
    ok = 0
    for n in range(10):
        bank_msgs = gen_bank(rng)
        name = f"rand_{bank}_{seed}_{n}"
        args = [spec(*m) for m in bank_msgs]
        r = subprocess.run(
            ["python3", "camp2.py", bank, name, *args],
            capture_output=True,
            text=True,
            check=False,
        )
        if "saved" not in r.stdout:
            print(
                f"rand {n}: FILL FAILED "
                f"{r.stdout.strip()[-80:]} {r.stderr.strip()[-80:]}"
            )
            continue
        path = f"captures/09_06/camp_{name}.log"

        sys.path.insert(0, ".")
        from analyze_captures import parse_capture
        from trace import decode_b_slots

        chunk = b""
        for b in parse_capture(path):
            if (
                len(b) >= 12
                and b[3] == 0x0D
                and b[4] == 0x49
                and (b[9], b[10], b[11]) == (0, 0, 0)
            ):
                q = b[12:-1]
                if q[:5] == bytes([0, 0x10, 0x7E, 0, 0]):
                    q = q[5:]
                chunk = q
        exp = [
            {"channel": ch, "type": t, "data1": d1, "data2": d2}
            for t, ch, d1, d2 in bank_msgs
        ]
        if bank == "b":
            got = decode_b_slots(chunk)
        else:
            from trace import decode_bank_a_slots

            got = decode_bank_a_slots(chunk)
        if got == exp:
            ok += 1
            print(f"rand {n}: EXACT ({len(got)} slots)")
        else:
            for i, e in enumerate(exp):
                g = got[i] if i < len(got) else None
                if g != e:
                    print(f"   slot{i + 1}: exp={e} got={g}")
    print(f"\n{ok}/10 random {bank.upper()} banks byte-exact")


if __name__ == "__main__":
    main()
