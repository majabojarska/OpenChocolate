#!/usr/bin/env python3
"""Bank A slots 3-7 value-spread campaign (the TODO step-1 tool).

Fills each variant (one slot's field at extreme values), captures,
retries on fill failure, and writes /tmp/ba_map.json (capture-name ->
expected 10 messages) for pick_bits.py. Requires the GUI stack up
(start-cubesuite + start-foot-ctrl-plus) and the pedal connected.
"""

from __future__ import annotations

import json
import subprocess
import time

BASE = [
    ("cc", 4, 17, 55),
    ("noteon", 6, 31, 99),
    ("noteoff", 8, 55, 77),
    ("pc", 3, 44, 0),
    ("cc", 5, 13, 66),
    ("noteon", 7, 21, 100),
    ("cc", 9, 33, 96),
    ("cc", 2, 66, 22),
    ("cc", 4, 77, 1),
    ("cc", 6, 100, 96),
]

D2S = (1, 2, 4, 8, 16, 32, 64, 127)
D1S = (33, 66, 99, 127)


def spec(t: str, ch: int, d1: int, d2: int) -> str:
    return f"{t}:{ch}:{d1}:{d2}" if t != "pc" else f"{t}:{ch}:{d1}:0"


def run_one(name: str, msgs: list[tuple]) -> bool:
    for attempt in range(3):
        r = subprocess.run(
            ["python3", "camp2.py", "a", name, *(spec(*m) for m in msgs)],
            capture_output=True,
            text=True,
            check=False,
        )
        if "saved" in r.stdout:
            return True
        print(f"  retry {name} (attempt {attempt + 1}): {r.stdout.strip()[-60:]}")
        time.sleep(4)
    return False


def main() -> None:
    mapping: dict[str, list[list]] = {}
    variants: list[tuple[str, list[tuple]]] = []

    # slot 3 (idx 2): d2 sweep, d1 sweep, ch=16
    for d2 in D2S:
        m = BASE.copy()
        m[2] = ("noteoff", 8, 55, d2)
        variants.append((f"s3d2v{d2}", m))
    for d1 in D1S:
        m = BASE.copy()
        m[2] = ("noteoff", 8, d1, 77)
        variants.append((f"s3d1v{d1}", m))
    m = BASE.copy()
    m[2] = ("noteoff", 16, 55, 77)
    variants.append(("s3ch16", m))

    # slot 4 (idx 3): make non-pc for d2 visibility
    for d2 in D2S:
        m = BASE.copy()
        m[3] = ("cc", 3, 44, d2)
        variants.append((f"s4d2v{d2}", m))
    for ch in (9, 16):
        m = BASE.copy()
        m[3] = ("cc", ch, 44, 66)
        variants.append((f"s4ch{ch}", m))
    for d1 in D1S:
        m = BASE.copy()
        m[3] = ("cc", 3, d1, 66)
        variants.append((f"s4d1v{d1}", m))

    # slot 5 (idx 4)
    for d2 in D2S:
        m = BASE.copy()
        m[4] = ("cc", 5, 13, d2)
        variants.append((f"s5d2v{d2}", m))
    for d1 in D1S:
        m = BASE.copy()
        m[4] = ("cc", 5, d1, 66)
        variants.append((f"s5d1v{d1}", m))
    m = BASE.copy()
    m[4] = ("cc", 16, 13, 66)
    variants.append(("s5ch16", m))

    # slot 6 (idx 5)
    for d2 in D2S:
        m = BASE.copy()
        m[5] = ("noteon", 7, 21, d2)
        variants.append((f"s6d2v{d2}", m))
    for d1 in D1S:
        m = BASE.copy()
        m[5] = ("noteon", 7, d1, 100)
        variants.append((f"s6d1v{d1}", m))
    m = BASE.copy()
    m[5] = ("noteon", 16, 21, 100)
    variants.append(("s6ch16", m))

    # slot 7 (idx 6)
    for d2 in D2S:
        m = BASE.copy()
        m[6] = ("cc", 9, 33, d2)
        variants.append((f"s7d2v{d2}", m))
    for d1 in (66, 99, 127):
        m = BASE.copy()
        m[6] = ("cc", 9, d1, 96)
        variants.append((f"s7d1v{d1}", m))
    m = BASE.copy()
    m[6] = ("cc", 16, 33, 96)
    variants.append(("s7ch16", m))

    for name, msgs in variants:
        if run_one(name, msgs):
            mapping[f"camp_{name}.log"] = [list(m) for m in msgs]
            print(f"  OK {name}")
        else:
            print(f"  FAILED {name}")

    with open("/tmp/ba_map.json", "w") as f:
        json.dump(mapping, f, indent=1)
    print(f"saved /tmp/ba_map.json with {len(mapping)} entries")


if __name__ == "__main__":
    main()
