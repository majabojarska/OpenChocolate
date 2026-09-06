#!/usr/bin/env python3
"""Fill bank B via the proven CLI approach and capture read-backs.

Each state: remove-all, add N slots, set each. Then close+reopen under
recording and save captures/09_06/camp_<name>.log.
"""

from __future__ import annotations

import subprocess
import sys
import time

CAPTURES_DIR = "captures/09_06"


def cli(*args: str) -> int:
    r = subprocess.run(
        ["python3", "choco.py", *args], capture_output=True, text=True, check=False
    )
    if r.returncode:
        print(r.stderr.strip() or r.stdout.strip(), file=sys.stderr)
    return r.returncode


def fill(bank: str, msgs: list[tuple[str, int, int, int]]) -> bool:
    # make sure FootCtrlPlus is the top window: if it's closed, reopen it.
    # start-foot-ctrl-plus only fires when the launchpad is on top, so a
    # non-zero exit just means FootCtrlPlus is already focused.
    if cli("state") != 0:
        return False
    import subprocess as _sp

    st = _sp.run(
        ["python3", "choco.py", "state", "--json"],
        capture_output=True,
        text=True,
        check=False,
    ).stdout
    if '"state": "footctrlplus"' not in st:
        cli("start-foot-ctrl-plus")
        time.sleep(6)
    if cli("remove-all", "--bank", bank):
        return False
    time.sleep(1.2)
    for i, (mt, ch, d1, d2) in enumerate(msgs):
        if cli("add", "--bank", bank):
            return False
        time.sleep(1.2)
        args = ["set-message", mt, str(ch), str(d1)]
        if mt != "pc":
            args.append(str(d2))
        args += ["--event", str(i), "--bank", bank]
        if cli(*args):
            return False
        time.sleep(1.2)
    return True


def capture(name: str) -> str | None:
    if cli("state"):
        return None
    path = f"{CAPTURES_DIR}/camp_{name}.log"
    code = f"""
from midi import record
from choco import close_footctrlplus, start_foot_ctrl_plus, open_windows, top_of_stack
import time
with record("SINCO", "WINE midi driver", log_file="{path}", tee=False, rescan_after=0):
    close_footctrlplus()
    for _ in range(60):
        if top_of_stack(open_windows()) == "launchpad": break
        time.sleep(0.1)
    time.sleep(1.0)
    start_foot_ctrl_plus()
    for _ in range(120):
        if top_of_stack(open_windows()) == "footctrlplus": break
        time.sleep(0.1)
    time.sleep(6)
"""
    r = subprocess.run(
        ["python3", "-c", code], capture_output=True, text=True, check=False
    )
    if r.returncode:
        print(r.stderr.strip() or r.stdout.strip(), file=sys.stderr)
        return None
    return path


def main() -> None:
    name = sys.argv[1]
    specs = sys.argv[2:]
    msgs = []
    for s in specs:
        parts = s.split(":")
        mt = parts[0]
        ch, d1 = int(parts[1]), int(parts[2])
        d2 = int(parts[3]) if len(parts) > 3 else 0
        msgs.append((mt, ch, d1, d2))
    print(f"filling bank B: {msgs}")
    if not fill("b", msgs):
        print("fill failed", file=sys.stderr)
        sys.exit(1)
    print("capturing ...")
    path = capture(name)
    if path:
        print(f"saved -> {path}")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
