#!/usr/bin/env python3
"""Fill bank B via the proven CLI approach and capture read-backs.

Each state: remove-all, add N slots, set each. Then close+reopen under
recording and save captures/YYYY-MM-DD/YYYY-MM-DD_hh-mm-ss_camp_<name>.log.
"""

from __future__ import annotations

import subprocess
import sys
import time

from choco import MAX_SLOTS

CAPTURES_ROOT = "captures"


def capture_path(name: str) -> str:
    """Capture path for a fill: captures/YYYY-MM-DD/<ts>_camp_<name>.log."""
    day = time.strftime("%Y-%m-%d")
    ts = time.strftime("%Y-%m-%d_%H-%M-%S")
    return f"{CAPTURES_ROOT}/{day}/{ts}_camp_{name}.log"


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
    if len(msgs) > MAX_SLOTS:
        print(
            f"fill: {len(msgs)} slots exceeds the bank capacity "
            f"of {MAX_SLOTS}; refusing",
            file=sys.stderr,
        )
        return False
    t_fill = time.perf_counter()
    t_remove = t_add = t_set = 0.0
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
    t_remove = time.perf_counter() - t_fill
    time.sleep(0.7)
    for i, (mt, ch, d1, d2) in enumerate(msgs):
        t0 = time.perf_counter()
        # --count i: the bank holds i slots before this Add, so the 17th
        # Add (i=16) is refused by the harness instead of clicked.
        if cli("add", "--bank", bank, "--count", str(i)):
            return False
        t_add += time.perf_counter() - t0
        time.sleep(0.7)
        args = ["set-message", mt, str(ch), str(d1)]
        if mt != "pc":
            args.append(str(d2))
        args += ["--event", str(i), "--bank", bank]
        t0 = time.perf_counter()
        if cli(*args):
            return False
        t_set += time.perf_counter() - t0
        time.sleep(0.7)
    print(
        f"FILLTIMING remove={t_remove:.1f}s add={t_add:.1f}s"
        f" set={t_set:.1f}s total={time.perf_counter() - t_fill:.1f}s"
    )
    return True


def capture(name: str) -> str | None:
    if cli("state"):
        return None
    path = capture_path(name)
    code = f"""
from midi import record
from choco import close_footctrlplus, start_foot_ctrl_plus, open_windows, top_of_stack
import time
with record("SINCO", "WINE midi driver", log_file="{path}", tee=False, rescan_after=0):
    t0 = time.perf_counter()
    close_footctrlplus()
    for _ in range(60):
        if top_of_stack(open_windows()) == "launchpad": break
        time.sleep(0.1)
    t1 = time.perf_counter()
    time.sleep(1.0)
    start_foot_ctrl_plus()
    for _ in range(120):
        if top_of_stack(open_windows()) == "footctrlplus": break
        time.sleep(0.1)
    t2 = time.perf_counter()
    time.sleep(6)
    t3 = time.perf_counter()
print(f"CAPTIMING close_wait={{t1 - t0:.1f}}s "
      f"reopen_wait={{t2 - t1 - 1.0:.1f}}s settle={{t3 - t2:.1f}}s")
"""
    r = subprocess.run(
        ["python3", "-c", code], capture_output=True, text=True, check=False
    )
    if r.returncode:
        print(r.stderr.strip() or r.stdout.strip(), file=sys.stderr)
        return None
    for line in r.stdout.splitlines():
        if "CAPTIMING" in line or "recorded" in line:
            print(f"  [capture] {line.strip()}")
    return path


def main() -> None:
    bank = "b"
    if len(sys.argv) > 1 and sys.argv[1] in ("a", "b"):
        bank = sys.argv[1]
        sys.argv = [sys.argv[0]] + sys.argv[2:]
    name = sys.argv[1]
    specs = sys.argv[2:]
    msgs = []
    for s in specs:
        parts = s.split(":")
        mt = parts[0]
        ch, d1 = int(parts[1]), int(parts[2])
        d2 = int(parts[3]) if len(parts) > 3 else 0
        msgs.append((mt, ch, d1, d2))
    print(f"filling bank {bank.upper()}: {msgs}")
    t_start = time.perf_counter()
    if not fill(bank, msgs):
        print("fill failed", file=sys.stderr)
        sys.exit(1)
    t_filled = time.perf_counter()
    print("capturing ...")
    path = capture(name)
    t_done = time.perf_counter()
    if path:
        print(
            f"TIMING fill={t_filled - t_start:.1f}s"
            f" capture={t_done - t_filled:.1f}s"
            f" total={t_done - t_start:.1f}s"
        )
        print(f"saved -> {path}")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
