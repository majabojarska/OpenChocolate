#!/usr/bin/env python3
"""Mode/TRS/polarity init-readback campaign (TODO: mode mapping task).

For each control value: set via the GUI, verify via get, close+reopen
FootCtrlPlus under recording. Writes captures/<day>/<ts>_camp_<name>.log
and /tmp/mode_map.json (capture-name -> {control, value}) incrementally.
Requires the GUI stack up (footctrlplus focused). Ends on
advanced_custom (bank UI depends on it).
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, "tools")

from camp2 import capture

MAP_PATH = "/tmp/mode_map.json"

DEVICE_MODES = [
    "program_change_a",
    "program_change_b",
    "custom",
    "advanced_custom",
    "manufacturer_control",
    "touch_screen_android",
    "video_control",
    "keyboard_a",
    "keyboard_b",
    "multimedia_keyboard",
    "custom_keyboard",
    "mix",
    "speaker",
]

TRS_MODES = ["expression_pedal", "trs_midi"]


def cli(*args: str) -> tuple[int, str]:
    r = subprocess.run(
        ["python3", "choco.py", *args], capture_output=True, text=True, check=False
    )
    return r.returncode, (r.stdout + r.stderr).strip()


def set_verify(cmd: str, value: str) -> bool:
    """Set a control and confirm via get (3 attempts)."""
    for _ in range(3):
        rc, out = cli(cmd, value)
        if rc != 0:
            print(f"  set {value} failed: {out[-80:]}")
            time.sleep(4)
            continue
        time.sleep(2)
        rc, out = cli(cmd, "get")
        if rc == 0 and value.replace("_", "-") in out.replace("_", "-"):
            return True
        print(f"  verify {value} failed ({out[-80:]}), retry")
        time.sleep(4)
    return False


def prior_capture(name: str) -> str:
    pat = f"captures/*/*_camp_{name}.log"
    hits = (p for p in glob.glob(pat) if os.path.getsize(p) > 0)
    return min(hits, default="")


def run_one(name: str) -> bool:
    """Close+reopen under recording; the capture views foot A (reset)."""
    return capture(name) is not None


def main() -> None:
    mapping: dict[str, str] = {}
    if os.path.exists(MAP_PATH):
        mapping = json.load(open(MAP_PATH))
    plan: list[tuple[str, str, str]] = [
        (f"mode_{m}", "device-mode", m) for m in DEVICE_MODES
    ]
    plan += [(f"trs_{m}", "trs-jack-mode", m) for m in TRS_MODES]
    # polarity: capture both states explicitly (toggle twice from unknown start)
    for name, control, value in plan:
        if prior_capture(name):
            print(f"  SKIP {name} (already on disk)")
            continue
        print(f"== {name} ({control}={value})", flush=True)
        if not set_verify(control, value):
            print(f"  FAILED to set {name}, skipping")
            continue
        if run_one(name):
            mapping[f"camp_{name}.log"] = f"{control}={value}"
            print(f"  OK {name}", flush=True)
        else:
            print(f"  FAILED capture {name}")
        with open(MAP_PATH, "w") as f:
            json.dump(mapping, f, indent=1)
    for want in ("off", "on"):
        name = f"pol_{want}"
        if prior_capture(name):
            print(f"  SKIP {name} (already on disk)")
            continue
        print(f"== {name} (polarity={want})", flush=True)
        _, out = cli("trs-jack-reverse-polarity", "get")
        cur = "on" if "(reversed)" in out else "off"
        if cur != want:
            cli("trs-jack-reverse-polarity", "toggle")
            time.sleep(2)
        _, out = cli("trs-jack-reverse-polarity", "get")
        ok = ("(reversed)" in out) == (want == "on")
        if not ok:
            print(f"  FAILED to set polarity {want} ({out[-80:]})")
            continue
        if run_one(name):
            mapping[f"camp_{name}.log"] = f"polarity={want}"
            print(f"  OK {name}", flush=True)
        else:
            print(f"  FAILED capture {name}")
        with open(MAP_PATH, "w") as f:
            json.dump(mapping, f, indent=1)
    print("== restore advanced_custom", flush=True)
    set_verify("device-mode", "advanced_custom")
    with open(MAP_PATH, "w") as f:
        json.dump(mapping, f, indent=1)
    print(f"saved {MAP_PATH} with {len(mapping)} entries", flush=True)


if __name__ == "__main__":
    main()
