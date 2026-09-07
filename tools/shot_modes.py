#!/usr/bin/env python3
"""Screenshot FootCtrlPlus in every device mode (TODO: mode screenshots).

Per mode: set via GUI, verify via get, screenshot the FootCtrlPlus
window to screenshots/FootCtrlPlus-<Pascal>Mode.png. Skips modes whose
PNG already exists. Ends on advanced_custom. Requires the GUI stack up.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time

sys.path.insert(0, "tools")

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


def cli(*args: str) -> tuple[int, str]:
    r = subprocess.run(
        ["python3", "choco.py", *args], capture_output=True, text=True, check=False
    )
    return r.returncode, (r.stdout + r.stderr).strip()


def wid_of_footctrlplus() -> str:
    r = subprocess.run(
        ["python3", "choco.py", "state", "--json"],
        capture_output=True,
        text=True,
        check=False,
    )
    import json

    try:
        return json.loads(r.stdout)["windows"].get("footctrlplus") or ""
    except (ValueError, KeyError, AttributeError):
        return ""


def main() -> None:
    os.makedirs("screenshots", exist_ok=True)
    for mode in DEVICE_MODES:
        fname = "".join(p.capitalize() for p in mode.split("_")) + "Mode"
        path = f"screenshots/FootCtrlPlus-{fname}.png"
        if os.path.exists(path) and os.path.getsize(path) > 0:
            print(f"  SKIP {mode} (already on disk)")
            continue
        print(f"== {mode}", flush=True)
        ok = False
        for _ in range(3):
            rc, out = cli("device-mode", mode)
            if rc != 0:
                print(f"  set failed: {out[-80:]}")
                time.sleep(4)
                continue
            time.sleep(2)
            rc, out = cli("device-mode", "get")
            if rc == 0 and mode.replace("_", "-") in out.replace("_", "-"):
                ok = True
                break
            print(f"  verify failed ({out[-80:]}), retry")
            time.sleep(4)
        if not ok:
            print(f"  FAILED to set {mode}, skipping")
            continue
        wid = wid_of_footctrlplus()
        if not wid:
            print(f"  FAILED: FootCtrlPlus not open for {mode}")
            continue
        r = subprocess.run(
            ["import", "-window", wid, path],
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode != 0 or not os.path.getsize(path):
            print(f"  FAILED screenshot {mode}: {r.stderr.strip()[-80:]}")
            continue
        print(f"  OK {mode} -> {path} [{os.path.getsize(path)} bytes]", flush=True)
    print("== restore advanced_custom", flush=True)
    cli("device-mode", "advanced_custom")


if __name__ == "__main__":
    main()
