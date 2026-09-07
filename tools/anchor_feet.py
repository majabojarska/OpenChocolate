#!/usr/bin/env python3
"""Anchor captures for feet B/C/D, banks A/B (same-layout-or-not hint).

Each (foot, bank) gets 2 captures: BASE (identical message lists to the
foot-A references, enabling byte-level diff) and HI (1-3 slots forced to
extreme values, forcing high bits to disambiguate layouts). Writes
/tmp/anchor_map.json (capture-name -> expected 10 messages) incrementally.
Requires the GUI stack up; run once per foot in the foreground.
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import time


def prior_capture(name: str) -> str:
    """Existing capture file for a fill name (any date/prefix), or ""."""
    pat = f"captures/*/*_camp_{name}.log"
    hits = (p for p in glob.glob(pat) if os.path.getsize(p) > 0)
    return min(hits, default="")


MAP_PATH = "/tmp/anchor_map.json"

BASE_A = [
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

# Same as camp_a_hi57: slots 5-7 at extremes, byte-comparable with it.
HI_A = [
    ("cc", 4, 17, 55),
    ("noteon", 6, 31, 99),
    ("noteoff", 8, 55, 77),
    ("pc", 3, 44, 0),
    ("cc", 5, 127, 127),
    ("noteon", 7, 127, 127),
    ("cc", 16, 127, 127),
    ("cc", 2, 66, 22),
    ("cc", 4, 77, 1),
    ("cc", 6, 100, 96),
]

# Full 10-slot bank-B reference (same list as camp_n10).
BASE_B = [
    ("cc", 3, 11, 33),
    ("cc", 5, 22, 44),
    ("noteon", 7, 33, 55),
    ("noteoff", 9, 44, 66),
    ("cc", 11, 55, 77),
    ("pc", 13, 66, 0),
    ("noteon", 15, 77, 99),
    ("cc", 16, 88, 111),
    ("noteoff", 2, 99, 123),
    ("pc", 4, 111, 0),
]

# BASE_B with slots 2 and 7 (same types) forced to extremes.
HI_B = [
    ("cc", 3, 11, 33),
    ("cc", 16, 127, 127),
    ("noteon", 7, 33, 55),
    ("noteoff", 9, 44, 66),
    ("cc", 11, 55, 77),
    ("pc", 13, 66, 0),
    ("noteon", 16, 127, 127),
    ("cc", 16, 88, 111),
    ("noteoff", 2, 99, 123),
    ("pc", 4, 111, 0),
]

DOUBLE_BANK_MODES = {
    "single_step_double_bank",
    "press_down_release_double_bank",
    "step_short_or_long_double_bank",
}


def cli(*args: str) -> tuple[int, str]:
    r = subprocess.run(
        ["python3", "choco.py", *args], capture_output=True, text=True, check=False
    )
    return r.returncode, (r.stdout + r.stderr).strip()


def spec(t: str, ch: int, d1: int, d2: int) -> str:
    return f"{t}:{ch}:{d1}:{d2}" if t != "pc" else f"{t}:{ch}:{d1}:0"


def ensure_foot(foot: str) -> bool:
    """Select foot + normalize to a double-bank mode (bank B needs it)."""
    for _attempt in range(3):
        rc, out = cli("switch", foot)
        if rc != 0:
            print(f"  switch {foot} failed: {out[-80:]}")
            time.sleep(4)
            continue
        rc, out = cli("switch", "get")
        if rc == 0 and f"footswitch {foot.upper()}" in out:
            break
        print(f"  switch {foot} unverified ({out[-80:]}), retry")
        time.sleep(4)
    else:
        return False
    rc, out = cli("footswitch-mode", "get")
    current = out.split("footswitch-mode: ")[-1].split()[0] if rc == 0 else ""
    if current not in DOUBLE_BANK_MODES:
        print(f"  foot {foot.upper()} mode={current or '?'} -> single-step-double-bank")
        rc, out = cli("footswitch-mode", "single_step_double_bank")
        if rc != 0:
            print(f"  mode set failed: {out[-80:]}")
            return False
        time.sleep(2)
    else:
        print(f"  foot {foot.upper()} mode={current} (double-bank ok)")
    return True


def run_one(name: str, bank: str, msgs: list[tuple]) -> bool:
    for attempt in range(3):
        r = subprocess.run(
            ["python3", "tools/camp2.py", bank, name, *(spec(*m) for m in msgs)],
            capture_output=True,
            text=True,
            check=False,
        )
        if "saved" in r.stdout:
            return True
        tail = (r.stdout + r.stderr).strip().splitlines()
        last = tail[-1][-80:] if tail else "?"
        print(f"  retry {name} (attempt {attempt + 1}): {last}")
        time.sleep(4)
    return False


def main() -> None:
    feet = sys.argv[1:] or ["b", "c", "d"]
    mapping: dict[str, list[list]] = {}
    if os.path.exists(MAP_PATH):
        mapping = json.load(open(MAP_PATH))
    combos = [
        ("a", "base", BASE_A),
        ("a", "hi", HI_A),
        ("b", "base", BASE_B),
        ("b", "hi", HI_B),
    ]
    for foot in feet:
        print(f"== foot {foot.upper()}")
        for bank, suffix, msgs in combos:
            name = f"f{foot.upper()}_{bank}_{suffix}"
            # Re-select before EVERY variant: the previous capture's
            # close/reopen resets FootCtrlPlus to footswitch A.
            if not ensure_foot(foot):
                print(f"  FAILED to select foot {foot.upper()}, skipping {name}")
                continue
            if prior_capture(name):
                mapping[f"camp_{name}.log"] = [list(m) for m in msgs]
                print(f"  SKIP {name} (already on disk)")
                continue
            if run_one(name, bank, msgs):
                mapping[f"camp_{name}.log"] = [list(m) for m in msgs]
                print(f"  OK {name}")
            else:
                print(f"  FAILED {name}")
            with open(MAP_PATH, "w") as f:
                json.dump(mapping, f, indent=1)
    with open(MAP_PATH, "w") as f:
        json.dump(mapping, f, indent=1)
    print(f"saved {MAP_PATH} with {len(mapping)} entries")


if __name__ == "__main__":
    main()
