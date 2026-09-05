#!/usr/bin/env python3
"""choco: CLI driver for the M-Vave Chocolate Plus editor.

The editor is a stack of three windows; each one steals focus from the
one below it, so only the actions of the *topmost open* window are legal:

    launchpad      (CubeSuite)   -> action: start-foot-ctrl-plus
    footctrlplus   (FootCtrlPlus) -> actions: switch A-D, remove-all, add
    midi_edit      (not built)   -> actions: TBD

    python choco.py state                 # which window is focused + allowed actions
    python choco.py start-foot-ctrl-plus  # click the launcher button (init sequence)
    python choco.py switch A              # select foot switch A/B/C/D
    python choco.py remove-all            # clear the mapped events list
    python choco.py add                   # append a new event to the list

Action commands refuse to run (exit 1, no click) when their window isn't
the focused (topmost open) one. Coordinates in COORDS are window-relative
placeholders; fill them in by measuring the real UI.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from enum import Enum

# ---------------------------------------------------------------------------
# Window stack, topmost first: a window steals focus from those below it.
# ---------------------------------------------------------------------------
STACK = ["midi_edit", "footctrlplus", "launchpad"]

# Title regexes matched against the title field of `wmctrl -l`.
WINDOW_TITLES = {
    # the launcher window: "CubeSuite V2.8.10 - [FootCtrlPlus,unknow]"
    "launchpad": re.compile(r"^CubeSuite V2\.8\.10"),
    "footctrlplus": re.compile(r"^FootCtrlPlus$"),
    # the "midi code edit" dialog window (titled just "CubeSuite")
    "midi_edit": re.compile(r"^CubeSuite$"),
}

# Footswitch mode radio buttons, one set per foot switch (radio group:
# selecting a mode disables the others for that switch). x, y on the
# FootCtrlPlus window; banks = number of configurable banks.
# Bank reuse: bank A events are identical across modes; bank B events are
# shared across all double-bank modes (and survive switching to a
# single-bank mode and back).
FOOTSWITCH_MODES = {
    "single_step_single_bank": (609, 221, 1),  # 1 bank
    "single_step_double_bank": (609, 256, 2),  # 2 banks
    "press_down_release_double_bank": (609, 289, 2),  # 2 banks
    "long_step_single_bank": (609, 323, 1),  # 1 bank
    "step_short_or_long_double_bank": (609, 356, 2),  # 2 banks
}

# Device mode radios — how the DEVICE operates as a whole (distinct from
# footswitch mode). One device mode at a time. x, y on FootCtrlPlus.
# "Advanced Custom" is the only mode exposing granular footswitch
# mode/bank (MIDI events in Bank A/B) configuration.
DEVICE_MODES = {
    "program_change_a": (38, 233),
    "program_change_b": (298, 233),
    "custom": (38, 269),
    "advanced_custom": (298, 269),
    "manufacturer_control": (38, 303),
    "touch_screen_android": (298, 304),
    "video_control": (38, 343),
    "keyboard_a": (298, 343),
    "keyboard_b": (38, 383),
    "multimedia_keyboard": (298, 383),
    "custom_keyboard": (38, 423),
    "mix": (298, 423),
    "speaker": (38, 463),
}

# TRS jack mode radios — how the TRS socket reads (expression pedal vs raw
# MIDI). Independent of device mode / footswitch mode; one at a time.
TRS_JACK_MODES = {
    "expression_pedal": (38, 151),
    "trs_midi": (218, 151),
}

# Window-relative click coordinates (x, y) in pixels.
# TODO: fill in real values (uncertain ones are still placeholders).
COORDS = {
    # launchpad
    "start_foot_ctrl_plus": (280, 140),  # TODO: "FootCtrlPlus" launcher button
    # FootCtrlPlus editor
    "foot_a": (610, 132),  # TODO: Foot Switch A tab
    "foot_b": (830, 132),  # TODO: Foot Switch B tab
    "foot_c": (1050, 132),  # TODO: Foot Switch C tab
    "foot_d": (612, 163),  # TODO: Foot Switch D tab
    "remove_all": (800, 600),  # TODO: "Remove all" button
    "add": (650, 600),  # TODO: "Add" button
    # legacy alias for single_step_double_bank (same radio)
    "mode_single_step_two_banks": (609, 256),
    # device mode radio buttons
    **DEVICE_MODES,
    # TRS jack mode radio buttons
    **TRS_JACK_MODES,
    # Polarity reversal toggle (same position on/off)
    "polarity_reversal": (248, 76),
    # bank list regions for OCR (bank B shifted +340px X)
    "bank_a_topleft": (590, 640),
    "bank_a_botright": (883, 852),
    "bank_b_topleft": (590 + 340, 640),
    "bank_b_botright": (883 + 340, 852),
    # window close buttons (title bar)
    "close_footctrlplus": (1250, 17),
    "close_launchpad": (648, 13),
}
COORDS.update({name: (x, y) for name, (x, y, _) in FOOTSWITCH_MODES.items()})

# Which window each action clicks in.
ACTION_WINDOW = {
    "start_foot_ctrl_plus": "launchpad",
    "foot_a": "footctrlplus",
    "foot_b": "footctrlplus",
    "foot_c": "footctrlplus",
    "foot_d": "footctrlplus",
    "remove_all": "footctrlplus",
    "add": "footctrlplus",
    # footswitch mode radio buttons + legacy alias
    **dict.fromkeys(FOOTSWITCH_MODES, "footctrlplus"),
    "mode_single_step_two_banks": "footctrlplus",
    # device mode radio buttons
    **dict.fromkeys(DEVICE_MODES, "footctrlplus"),
    # TRS jack mode radio buttons
    **dict.fromkeys(TRS_JACK_MODES, "footctrlplus"),
    "polarity_reversal": "footctrlplus",
    "close_editor": "footctrlplus",
    "open_edit": "footctrlplus",
    "close_footctrlplus": "footctrlplus",
    "close_launchpad": "launchpad",
    "edit_channel": "midi_edit",
    "edit_type": "midi_edit",
    "edit_data1": "midi_edit",
    "edit_data2": "midi_edit",
    "confirm_edit": "midi_edit",
}

# User-facing command names for messages / state output.
DISPLAY = {
    "start_foot_ctrl_plus": "start-foot-ctrl-plus",
    "foot_a": "switch A",
    "foot_b": "switch B",
    "foot_c": "switch C",
    "foot_d": "switch D",
    "remove_all": "remove-all",
    "add": "add",
    # footswitch mode radio buttons; display names use dashes
    **{mode: mode.replace("_", "-") for mode in FOOTSWITCH_MODES},
    "mode_single_step_two_banks": "mode-single-step-two-banks",
    # device mode radio buttons; same dashed convention
    **{mode: mode.replace("_", "-") for mode in DEVICE_MODES},
    # TRS jack mode radio buttons
    **{mode: mode.replace("_", "-") for mode in TRS_JACK_MODES},
    "polarity_reversal": "polarity-reversal",
    "close_editor": "close-editor",
    "open_edit": "open-edit",
    "close_footctrlplus": "close-footctrlplus",
    "close_launchpad": "close-launchpad",
    "edit_channel": "edit-channel",
    "edit_type": "edit-type",
    "edit_data1": "edit-data1",
    "edit_data2": "edit-data2",
    "confirm_edit": "confirm-edit",
}

FOOT_SWITCHES = {"a": "foot_a", "b": "foot_b", "c": "foot_c", "d": "foot_d"}


# ---------------------------------------------------------------------------
# MIDI message model
# ---------------------------------------------------------------------------
class MidiType(Enum):
    """The kinds of MIDI message the editor can map to a button."""

    PC = "pc"  # program change
    CC = "cc"  # control change
    NOTE_ON = "noteon"  # MIDI note on
    NOTE_OFF = "noteoff"  # MIDI note off


# Down-arrow presses from the top of the type combo (after Up x5 to reset)
# needed to select each type.
TYPE_DOWN_ARROWS = {
    MidiType.PC: 0,
    MidiType.CC: 1,
    MidiType.NOTE_ON: 2,
    MidiType.NOTE_OFF: 3,
}


@dataclass
class MidiMessage:
    """A single MIDI event mapped to a foot switch press.

    channel: MIDI channel 1-16
    mtype:   event kind (pc / cc / noteon / noteoff)
    data1:   program number (PC), controller number (CC), or note
    data2:   value (CC) / velocity (notes); unused for PC
    """

    channel: int = 1
    mtype: MidiType = MidiType.PC
    data1: int = 0
    data2: int | None = None

    def validate(self) -> str | None:
        """Return an error string, or None if the message is valid."""
        if not 1 <= self.channel <= 16:
            return f"channel must be 1-16 (got {self.channel})"
        if not 0 <= self.data1 <= 127:
            return f"data1 must be 0-127 (got {self.data1})"
        if self.data2 is not None and not 0 <= self.data2 <= 127:
            return f"data2 must be 0-127 (got {self.data2})"
        return None


# "midi code edit" dialog (window titled "CubeSuite", 408x254): widget coords.
MIDI_EDIT_COORDS = {
    "channel": (124, 74),
    "type": (132, 107),
    "data1": (159, 130),
    "data2": (250, 155),
    "confirm": (318, 186),
}

# When the message type is PC, the Data2 field is hidden, which collapses
# the dialog and moves the OK button 10px up.
CONFIRM_Y_BY_TYPE = {MidiType.PC: 176}  # others keep the default 186

# "Edit" buttons for each mapped event, in the FootCtrlPlus window.
# One entry per event row (slot 1 = index 0).
EVENT_EDIT_BUTTONS = [
    (725, 652),  # slot 1
    (695, 674),  # slot 2
    (695, 692),  # slot 3
    (695, 711),  # slot 4
    (695, 730),  # slot 5
    (695, 749),  # slot 6
    (695, 768),  # slot 7
    (695, 788),  # slot 8
    (695, 805),  # slot 9
    (695, 825),  # slot 10
    (695, 844),  # slot 11
]

# Text fields need the old value cleared before typing a new one.
CLEAR_KEYPRESSES = 3
# The type combo is reset to its top entry (PC) with this many Ups.
TYPE_RESET_UP_ARROWS = 5

# CubeSuite app launch (Bottles).
BOTTLES_APP = "com.usebottles.bottles"
BOTTLES_ENV = "Chocolate"
CUBESUITE_WIN_PATH = r"C:\users\maja\Desktop\CubeSuite\CubeSuite.exe"

# Bank B: every foot switch has bank A and bank B. In bank B view, the
# FootCtrlPlus event-list controls shift +350px on X (midi edit dialog is
# unaffected).
BANK_SHIFT_X = 350
# FootCtrlPlus actions whose X is shifted for bank B.
BANK_SHIFTED_ACTIONS = {"remove_all", "add", "open_edit"}


def banked_coord(action: str, x: int, y: int, bank: str = "a") -> tuple[int, int]:
    """Apply the bank-B X shift to a FootCtrlPlus coordinate if applicable."""
    if (
        bank == "b"
        and ACTION_WINDOW.get(action) == "footctrlplus"
        and action in BANK_SHIFTED_ACTIONS
    ):
        return x + BANK_SHIFT_X, y
    return x, y


def _run(args) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, check=False)


# ---------------------------------------------------------------------------
# Window discovery and state
# ---------------------------------------------------------------------------
def open_windows() -> dict[str, str | None]:
    """Map window name -> window id (or None if not open), one wmctrl call."""
    ids: dict[str, str | None] = dict.fromkeys(STACK)
    proc = _run(["wmctrl", "-l"])
    if proc.returncode != 0:
        print(f"wmctrl failed: {proc.stderr.strip()}", file=sys.stderr)
        return ids
    for line in proc.stdout.splitlines():
        fields = line.split(None, 3)
        if len(fields) < 4:
            continue
        wid, title = fields[0], fields[3]
        for name, pat in WINDOW_TITLES.items():
            if ids[name] is None and pat.search(title):
                ids[name] = wid
    return ids


def top_of_stack(windows: dict[str, str | None]) -> str | None:
    """Name of the topmost open window, or None if none are open."""
    for name in STACK:
        if windows[name]:
            return name
    return None


def allowed_actions(state: str) -> list[str]:
    return [DISPLAY[a] for a in ACTION_WINDOW if ACTION_WINDOW[a] == state]


def require(action: str) -> str | None:
    """If `action` is legal right now, return the window id to click in.

    Stack rule: an action is only legal when its window is the topmost
    open one. Otherwise print why not and return None.
    """
    windows = open_windows()
    state = top_of_stack(windows)
    if state is None:
        print(
            "no known windows are open (launchpad / FootCtrlPlus / midi code edit)",
            file=sys.stderr,
        )
        return None
    needed = ACTION_WINDOW[action]
    if state != needed:
        allowed = ", ".join(allowed_actions(state))
        print(
            f"cannot {DISPLAY[action]}: '{needed}' is not focused "
            f"(state is '{state}'; allowed now: {allowed or 'none'})",
            file=sys.stderr,
        )
        return None
    wid = windows[needed]
    if wid is None:
        print(f"'{needed}' window vanished while checking", file=sys.stderr)
        return None
    return wid


def window_geometry(wid: str) -> tuple[int, int, int, int]:
    """Absolute frame origin and size (x, y, w, h) via `wmctrl -lG`."""
    proc = _run(["wmctrl", "-lG"])
    if proc.returncode != 0:
        raise RuntimeError(f"wmctrl -lG failed: {proc.stderr.strip()}")
    for line in proc.stdout.splitlines():
        # wmctrl -lG per window: wid desktop x y w h host title
        fields = line.split(None, 6)
        if not fields or fields[0] != wid:
            continue
        _, _, x, y, w, h, _ = fields
        return int(x), int(y), int(w), int(h)
    raise RuntimeError(f"window {wid} not found in wmctrl -lG")


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
def click(wid: str, x: int, y: int, absolute: bool = False, clicks: int = 1) -> None:
    """Focus the window and left-click `clicks` times at (x, y).

    `clicks=2` produces a double-click (open-in-editor); click spacing is
    ~100ms via xdotool's built-in repeat delay.
    """
    # Raise first so the user can visually follow what we're clicking,
    # then focus. windowraise (XRaiseWindow) works even on WMs that
    # ignore / reject _NET_ACTIVE_WINDOW.
    raise_err = _run(["xdotool", "windowraise", wid])
    activate = _run(["xdotool", "windowactivate", "--sync", wid])
    if activate.returncode != 0:
        # Some WMs/reparenting setups reject _NET_ACTIVE_WINDOW; fall back
        # to raw XSetInputFocus so the click still lands.
        _run(["xdotool", "windowfocus", wid])
    for cmd, proc in (("windowraise", raise_err), ("windowactivate", activate)):
        if proc.returncode != 0:
            print(f"xdotool {cmd} failed: {proc.stderr.strip()}", file=sys.stderr)

    if absolute:
        # Compute absolute screen coords from the frame rect. Use this if
        # --window relative clicks land offset (title-bar offset).
        fx, fy, _, _ = window_geometry(wid)
        x, y = fx + x, fy + y
        move = _run(["xdotool", "mousemove", str(x), str(y)])
    else:
        move = _run(["xdotool", "mousemove", "--window", wid, str(x), str(y)])

    if clicks > 1:
        press = _run(
            ["xdotool", "click", "--repeat", str(clicks), "--delay", "120", "1"]
        )
    else:
        press = _run(["xdotool", "click", "1"])
    for cmd, proc in (("mousemove", move), ("click", press)):
        if proc.returncode != 0:
            print(f"xdotool {cmd} failed: {proc.stderr.strip()}", file=sys.stderr)


def cmd_click(action: str, absolute: bool, bank: str = "a") -> int:
    """Gate `action` on the window stack, then click its coordinates."""
    wid = require(action)
    if wid is None:
        return 1
    x, y = COORDS[action]
    x, y = banked_coord(action, x, y, bank)
    click(wid, x, y, absolute=absolute)
    print(
        f"clicked {DISPLAY[action]!r} at ({x}, {y})"
        + (f" [bank {bank}]" if bank != "a" else "")
    )
    return 0


def cmd_close_editor() -> int:
    """Close FootCtrlPlus via the Escape key (graceful; Wine windows often
    ignore WM_DELETE_WINDOW / wmctrl close messages)."""
    wid = require("close_editor")
    if wid is None:
        return 1

    raise_err = _run(["xdotool", "windowraise", wid])
    activate = _run(["xdotool", "windowactivate", "--sync", wid])
    if activate.returncode != 0:
        # Some WMs/reparenting setups reject _NET_ACTIVE_WINDOW; fall back
        # to raw XSetInputFocus so the key still reaches the window.
        _run(["xdotool", "windowfocus", wid])

    # Wine ignores XSendEvent, so send the key to the focused window via
    # XTEST (plain `key`, no --window).
    key = _run(["xdotool", "key", "Escape"])
    for cmd, proc in (
        ("windowraise", raise_err),
        ("windowactivate", activate),
        ("key", key),
    ):
        if proc.returncode != 0:
            print(f"xdotool {cmd} failed: {proc.stderr.strip()}", file=sys.stderr)

    # Give the app a moment to close, then verify the stack state.
    for _ in range(30):
        if open_windows()["footctrlplus"] is None:
            print("close-editor: FootCtrlPlus closed")
            return 0
        time.sleep(0.1)
    print("close-editor: FootCtrlPlus still open after Escape", file=sys.stderr)
    return 1


def cmd_close_with_button(action: str) -> int:
    """Close a window by clicking its title-bar close button."""
    wid = require(action)
    if wid is None:
        return 1
    if action == "close_footctrlplus":
        # FootCtrlPlus first returns focus to the launchpad; the window is
        # gone, so re-resolve the stack fresh.
        click(wid, *COORDS["close_footctrlplus"])
        for _ in range(30):
            if open_windows()["footctrlplus"] is None:
                print("close-footctrlplus: FootCtrlPlus closed")
                return 0
            time.sleep(0.1)
        print("close-footctrlplus: still open after close click", file=sys.stderr)
        return 1
    # launchpad close: window vanishes and the app process exits
    click(wid, *COORDS["close_launchpad"])
    for _ in range(50):
        if open_windows()["launchpad"] is None:
            print("close-launchpad: CubeSuite window closed")
            return 0
        time.sleep(0.1)
    print("close-launchpad: launchpad still open after close click", file=sys.stderr)
    return 1


# ---------------------------------------------------------------------------
# "midi code edit" dialog
# ---------------------------------------------------------------------------
def _dialog_click(widget: str, action: str, clicks: int = 1) -> str | None:
    """Gate+click a dialog widget; return its window id or None.

    `clicks=2` for text fields: after the type-combo interaction, focus may
    still be on the combo (its dropdown possibly open), so the first click
    only dismisses it / gives the field focus and the second lands in the
    field. Double-clicking makes both happen.
    """
    wid = require(action)
    if wid is None:
        return None
    x, y = MIDI_EDIT_COORDS[widget]
    click(wid, x, y, clicks=clicks)
    return wid


def _clear_and_type(value: int) -> None:
    """Clear a text field (BackSpace xN) and type a number."""
    _run(["xdotool", "key", "--repeat", str(CLEAR_KEYPRESSES), "BackSpace"])
    _run(["xdotool", "type", "--delay", "80", str(value)])


def open_edit(event_index: int = 0, bank: str = "a") -> int:
    """Click the Edit button of a mapped event (default: the first one)."""
    if not 0 <= event_index < len(EVENT_EDIT_BUTTONS):
        print(
            "open-edit: only event 1 (index 0) is defined so far",
            file=sys.stderr,
        )
        return 1
    wid = require("open_edit")
    if wid is None:
        return 1
    x, y = EVENT_EDIT_BUTTONS[event_index]
    x, y = banked_coord("open_edit", x, y, bank)
    # Double-click: the Edit button opens the dialog on a double-click.
    click(wid, x, y, clicks=2)
    print(
        f"open-edit: double-clicked edit button of event {event_index + 1} "
        f"at ({x}, {y})" + (f" [bank {bank}]" if bank != "a" else "")
    )
    return 0


def edit_set_channel(channel: int) -> int:
    """Set the MIDI channel (1-16) in the edit dialog."""
    wid = _dialog_click("channel", "edit_channel")
    if wid is None:
        return 1
    _clear_and_type(channel)
    print(f"edit-channel: set channel to {channel}")
    return 0


def edit_set_type(mtype: MidiType) -> int:
    """Select the message type via the combo (Up x5 reset, Down xN, Enter)."""
    wid = _dialog_click("type", "edit_type")
    if wid is None:
        return 1
    _run(["xdotool", "key", "--repeat", str(TYPE_RESET_UP_ARROWS), "Up"])
    down = TYPE_DOWN_ARROWS[mtype]
    if down:
        _run(["xdotool", "key", "--repeat", str(down), "Down"])
    # The combo needs Enter to confirm the selection (the dropdown stays
    # open / the selection doesn't apply until then).
    _run(["xdotool", "key", "Return"])
    print(f"edit-type: selected {mtype.value} ({down} down-arrow(s)) + Enter")
    return 0


def edit_set_data1(value: int) -> int:
    """Set the Data1 field (program/controller/note number)."""
    wid = _dialog_click("data1", "edit_data1", clicks=2)
    if wid is None:
        return 1
    _clear_and_type(value)
    print(f"edit-data1: set to {value}")
    return 0


def edit_set_data2(value: int) -> int:
    """Set the Data2 field (value/velocity). Only visible for non-PC types."""
    wid = _dialog_click("data2", "edit_data2", clicks=2)
    if wid is None:
        return 1
    _clear_and_type(value)
    print(f"edit-data2: set to {value}")
    return 0


def edit_confirm(mtype: MidiType | None = None) -> int:
    """Click Confirm (OK): closes the dialog and saves the entered values.

    `mtype` adjusts the OK position: for PC the Data2 field is hidden and
    the button sits 10px higher. Defaults to the non-PC position.
    """
    wid = require("confirm_edit")
    if wid is None:
        return 1
    x, y = MIDI_EDIT_COORDS["confirm"]
    if mtype is not None:
        y = CONFIRM_Y_BY_TYPE.get(mtype, y)
    click(wid, x, y)
    print("confirm-edit: dialog saved and closed")
    return 0


def set_message(msg: MidiMessage, event_index: int = 0, bank: str = "a") -> int:
    """Full pipeline: open the event's edit dialog if needed, fill in the
    message fields, and confirm."""
    err = msg.validate()
    if err:
        print(f"set-message: invalid message: {err}", file=sys.stderr)
        return 1

    window_state = top_of_stack(open_windows())
    if window_state == "footctrlplus":
        if open_edit(event_index, bank=bank):
            return 1
        # wait for the dialog to appear
        for _ in range(50):
            if top_of_stack(open_windows()) == "midi_edit":
                break
            time.sleep(0.1)
        else:
            print("set-message: edit dialog did not open", file=sys.stderr)
            return 1
    elif window_state != "midi_edit":
        print(
            f"set-message: need footctrlplus or midi_edit, state is '{window_state}'",
            file=sys.stderr,
        )
        return 1

    if edit_set_channel(msg.channel):
        return 1
    if edit_set_type(msg.mtype):
        return 1
    if edit_set_data1(msg.data1):
        return 1
    if msg.mtype is not MidiType.PC:
        d2 = msg.data2 if msg.data2 is not None else 0
        if edit_set_data2(d2):
            return 1
    return edit_confirm(mtype=msg.mtype)


def cmd_state(json_out: bool) -> int:
    windows = open_windows()
    state = top_of_stack(windows)
    allowed = allowed_actions(state) if state else []
    if json_out:
        print(json.dumps({"state": state, "windows": windows, "allowed": allowed}))
    else:
        print(f"state: {state or 'none'}")
        for name in STACK:
            wid = windows[name]
            print(f"  {name:<13} {'open  ' + wid if wid else 'closed'}")
        print(f"allowed: {', '.join(allowed) if allowed else '(none)'}")
    return 0 if state else 1


def cmd_geometry(window: str | None) -> int:
    """Print the frame rect of one window (default: topmost open one)."""
    windows = open_windows()
    if window is None:
        state = top_of_stack(windows)
        if state is None:
            print("no known windows are open", file=sys.stderr)
            return 1
        window = state
    wid = windows[window]
    if wid is None:
        print(f"window '{window}' is not open", file=sys.stderr)
        return 1
    x, y, w, h = window_geometry(wid)
    print(f"{x} {y} {w} {h}")
    return 0


# ---------------------------------------------------------------------------
# Importable API (used by the CLI and by `midi.record` scripts)
# ---------------------------------------------------------------------------
def switch(foot: str, absolute: bool = False, bank: str = "a") -> int:
    """Select foot switch A/B/C/D (case-insensitive)."""
    return cmd_click(FOOT_SWITCHES[foot.lower()], absolute, bank=bank)


def add(absolute: bool = False, bank: str = "a") -> int:
    """Click 'Add' on FootCtrlPlus."""
    return cmd_click("add", absolute, bank=bank)


def remove_all(absolute: bool = False, bank: str = "a") -> int:
    """Click 'Remove all' on FootCtrlPlus."""
    return cmd_click("remove_all", absolute, bank=bank)


def start_foot_ctrl_plus(absolute: bool = False) -> int:
    """Click the launcher button on the launchpad (runs init sequence)."""
    return cmd_click("start_foot_ctrl_plus", absolute)


def click_named(name: str, absolute: bool = False, bank: str = "a") -> int:
    """Click any named coordinate in COORDS."""
    return cmd_click(name, absolute, bank=bank)


def set_footswitch_mode(mode: str) -> int:
    """Select a footswitch mode radio button (see FOOTSWITCH_MODES).

    The choice is per foot switch; selecting one mode disables the others
    for that switch. Bank count follows the mode (1 or 2). Raises/returns 1
    on an unknown mode.
    """
    if mode not in FOOTSWITCH_MODES:
        print(
            f"set_footswitch_mode: unknown mode {mode!r}; "
            f"known: {', '.join(FOOTSWITCH_MODES)}",
            file=sys.stderr,
        )
        return 1
    wid = require(mode)  # mode name doubles as the gated action name
    if wid is None:
        return 1
    x, y, banks = FOOTSWITCH_MODES[mode]
    click(wid, x, y)
    print(f"footswitch-mode: {mode} selected at ({x}, {y}) ({banks} bank(s))")
    return 0


def set_device_mode(mode: str) -> int:
    """Select a device mode radio button (see DEVICE_MODES).

    Device mode controls how the device operates as a whole (distinct from
    footswitch mode). Only one device mode can be enabled at a time.
    """
    if mode not in DEVICE_MODES:
        print(
            f"set_device_mode: unknown mode {mode!r}; known: {', '.join(DEVICE_MODES)}",
            file=sys.stderr,
        )
        return 1
    wid = require(mode)  # mode name doubles as the gated action name
    if wid is None:
        return 1
    x, y = DEVICE_MODES[mode]
    click(wid, x, y)
    print(f"device-mode: {mode} selected at ({x}, {y})")
    return 0


def set_trs_jack_mode(mode: str) -> int:
    """Select a TRS jack mode radio button (see TRS_JACK_MODES).

    TRS jack mode controls how the TRS socket reads (expression pedal vs
    raw MIDI); independent of device / footswitch mode. One at a time.
    """
    if mode not in TRS_JACK_MODES:
        print(
            f"set_trs_jack_mode: unknown mode {mode!r}; "
            f"known: {', '.join(TRS_JACK_MODES)}",
            file=sys.stderr,
        )
        return 1
    wid = require(mode)  # mode name doubles as the gated action name
    if wid is None:
        return 1
    x, y = TRS_JACK_MODES[mode]
    click(wid, x, y)
    print(f"trs-jack-mode: {mode} selected at ({x}, {y})")
    return 0


# Selection detector: the selected control shows a white center dot /
# marker; others are dark. Count white pixels in a box around each item.
def _detect_radio_group(
    modes: dict[str, tuple[int, int]],
    label: str,
    box: int = 20,
    x_off: int = -10,
) -> tuple[str | None, list[str]]:
    """Detect which item of `modes` is selected (white marker).

    Returns (selected, problems). Exactly one should be selected; callers
    should treat 0 or >1 as failure. `box` is the half-width of the scan
    square; `x_off` shifts its center (radios: dot left of the label;
    tabs: centered on the tab).
    """
    import tempfile

    wid = open_windows().get("footctrlplus")
    if wid is None:
        return None, ["footctrlplus window not open"]
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        path = tmp.name
    try:
        proc = _run(["import", "-window", wid, path])
        if proc.returncode != 0:
            return None, ["screenshot failed"]
        from PIL import Image

        im = Image.open(path).convert("RGB")
        enabled: list[str] = []
        for name, (x, y) in modes.items():
            white = 0
            cx = x + x_off
            for yy in range(y - 8, y + 9):
                for xx in range(cx - box, cx + box):
                    c = im.getpixel((xx, yy))
                    if c[0] > 200 and c[1] > 200 and c[2] > 200:
                        white += 1
            if white > 0:
                enabled.append(name)
        if not enabled:
            return None, [f"no {label} radio shows a white dot"]
        if len(enabled) > 1:
            return None, [f"{len(enabled)} {label} radios show white dots: {enabled}"]
        return enabled[0], []
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def detect_device_mode() -> tuple[str | None, list[str]]:
    """Detect which device mode is enabled from the window pixels."""
    return _detect_radio_group(DEVICE_MODES, "device-mode")


def detect_trs_jack_mode() -> tuple[str | None, list[str]]:
    """Detect which TRS jack mode is enabled from the window pixels."""
    return _detect_radio_group(TRS_JACK_MODES, "trs-jack-mode")


# Footswitch selection tabs (coords are the tab positions).
FOOTSWITCH_TABS = {
    "a": COORDS["foot_a"],
    "b": COORDS["foot_b"],
    "c": COORDS["foot_c"],
    "d": COORDS["foot_d"],
}


def detect_footswitch(
    require_advanced_custom: bool = True,
) -> tuple[str | None, list[str]]:
    """Detect the currently-selected footswitch (A/B/C/D) tab.

    Requires device mode "Advanced Custom" (else error, since footswitch
    selection is only meaningful there). Uses the same white-marker scan;
    errors if 0 or >1 tabs look selected.
    """
    if require_advanced_custom:
        dmode, dprobs = detect_device_mode()
        if dprobs or dmode != "advanced_custom":
            return None, [
                "advanced_custom device mode not enabled "
                f"(detected={dmode}, problems={dprobs})"
            ]
    return _detect_radio_group(FOOTSWITCH_TABS, "footswitch", box=40, x_off=0)


# Polarity reversal toggle colors (FootCtrlPlus, at 248,76):
#   off = dark   #08251d
#   on  = bright #33eab8
POLARITY_OFF_RGB = (0x08, 0x25, 0x1D)
POLARITY_ON_RGB = (0x33, 0xEA, 0xB8)
# tolerance for screenshot color comparison (per channel)
POLARITY_TOLERANCE = 24


def toggle_polarity() -> int:
    """Toggle the Polarity reversal switch (same position on/off)."""
    wid = require("polarity_reversal")
    if wid is None:
        return 1
    click(wid, *COORDS["polarity_reversal"])
    print("trs-jack-reverse-polarity: toggled")
    return 0


def polarity_reversed() -> bool | None:
    """Read the Polarity reversal state from the window's pixels.

    Screenshots the FootCtrlPlus window and compares the color at the
    toggle's position against the known bright/dark colors (with
    tolerance). Returns True (on) / False (off), or None if the state
    can't be determined (window closed / color unknown).
    """
    import tempfile

    wid = open_windows().get("footctrlplus")
    if wid is None:
        return None
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        path = tmp.name
    proc = _run(["import", "-window", wid, path])
    if proc.returncode != 0:
        return None
    try:
        from PIL import Image

        im = Image.open(path).convert("RGB")
        x, y = COORDS["polarity_reversal"]
        # sample a small patch around the toggle (exclude the exact border)
        w = im.width
        # the patch is small; average a 4x4 area centered on (x, y)
        xs = range(max(0, x - 2), min(w, x + 3))
        ys = range(max(0, y - 2), min(im.height, y + 3))
        px = im.load()
        n = 0
        tot = [0, 0, 0]
        for xx in xs:
            for yy in ys:
                c = px[xx, yy]
                tot[0] += c[0]
                tot[1] += c[1]
                tot[2] += c[2]
                n += 1
        avg = tuple(t // n for t in tot)
        d_off = sum(abs(a - b) for a, b in zip(avg, POLARITY_OFF_RGB))
        d_on = sum(abs(a - b) for a, b in zip(avg, POLARITY_ON_RGB))
        if d_on <= POLARITY_TOLERANCE * 3 and d_on < d_off:
            return True
        if d_off <= POLARITY_TOLERANCE * 3 and d_off < d_on:
            return False
        return None
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def read_bank(bank: str = "a") -> list[dict] | None:
    """OCR the MIDI message list shown in a bank (Advanced Custom mode).

    Screenshots FootCtrlPlus, crops the bank list region (A: (590,640)..
    (883,852); B shifted +340px X), preprocesses for the dark theme, and
    OCRs with tesseract. Returns a list of parsed entries
    ({index, channel, type, data1, data2}) or None if a row can't be
    parsed / the window is closed.
    """
    import tempfile

    wid = open_windows().get("footctrlplus")
    if wid is None:
        return None
    if bank not in ("a", "b"):
        print(f"read_bank: bank must be 'a' or 'b' (got {bank!r})", file=sys.stderr)
        return None
    x0, y0 = COORDS["bank_a_topleft" if bank == "a" else "bank_b_topleft"]
    x1, y1 = COORDS["bank_a_botright" if bank == "a" else "bank_b_botright"]
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        png_path = tmp.name
    try:
        proc = _run(["import", "-window", wid, png_path])
        if proc.returncode != 0:
            return None
        from PIL import Image, ImageChops

        im = Image.open(png_path).convert("RGB").crop((x0, y0, x1, y1))
        # The list text is bright green (#33eab8) on dark green; mask on
        # green-dominance (like the polarity detector) and OCR the mask.
        r, g, b = im.split()
        hi = g.point(lambda p: 255 if p > 60 else 0)  # bright green
        gr = ImageChops.subtract(g, r, scale=1, offset=0).point(
            lambda p: 255 if p > 20 else 0
        )  # g - r > 20
        gb = ImageChops.subtract(g, b, scale=1, offset=0).point(
            lambda p: 255 if p > 20 else 0
        )  # g - b > 20
        mask = ImageChops.multiply(hi, ImageChops.multiply(gr, gb))
        mask = mask.resize((im.width * 6, im.height * 6), Image.LANCZOS)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t2:
            ocr_path = t2.name
        mask.save(ocr_path)
        try:
            import pytesseract

            # Point tesseract at a user tessdata dir if the system one lacks
            # eng (we install eng.traineddata into ~/.local/share/tessdata).
            import os as _os

            user_tess = _os.path.expanduser("~/.local/share/tessdata")
            if _os.path.isdir(user_tess) and _os.path.isfile(
                _os.path.join(user_tess, "eng.traineddata")
            ):
                _os.environ.setdefault("TESSDATA_PREFIX", user_tess)

            text = pytesseract.image_to_string(ocr_path, config="--psm 6")
        finally:
            try:
                os.unlink(ocr_path)
            except OSError:
                pass
    finally:
        try:
            os.unlink(png_path)
        except OSError:
            pass

    # parse lines like: [1] 3 Note ON 60 127, or [2] 1 PC 00 (PC data2 may
    # OCR merged as a single trailing number). The leading `[` may be eaten.
    entries = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        # [idx] chan TYPE d1 [d2]
        m = re.match(r"\[?(\d+)\]?\s+(\d+)\s+(.+?)\s+(\d+)(?:\s+(\d+))?\s*$", line)
        if not m:
            continue
        d2 = int(m.group(5)) if m.group(5) else 0
        entries.append(
            {
                "index": int(m.group(1)),
                "channel": int(m.group(2)),
                "type": m.group(3).strip(),
                "data1": int(m.group(4)),
                "data2": d2,
            }
        )
    return entries or None


def close_editor() -> int:
    """Close FootCtrlPlus via the Escape key."""
    return cmd_close_editor()


def close_footctrlplus() -> int:
    """Close FootCtrlPlus via its close button."""
    return cmd_close_with_button("close_footctrlplus")


def close_launchpad() -> int:
    """Close the CubeSuite launchpad via its close button (exits the app)."""
    return cmd_close_with_button("close_launchpad")


def start_cubesuite(timeout: float = 30.0) -> int:
    """Start CubeSuite (Bottles env Chocolate) if not running; wait for the
    launchpad window to appear."""
    if open_windows()["launchpad"] is not None:
        print("start-cubesuite: CubeSuite already running")
        return 0
    try:
        subprocess.Popen(
            [
                "flatpak",
                "run",
                BOTTLES_APP,
                "-b",
                BOTTLES_ENV,
                "-e",
                CUBESUITE_WIN_PATH,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        print("start-cubesuite: flatpak not found", file=sys.stderr)
        return 1
    # The `flatpak run` parent may exit quickly after delegating to
    # bottles-cli / launching Wine; don't treat that as failure. Wait for
    # the launchpad window instead.
    deadline = time.time() + timeout
    while time.time() < deadline:
        if open_windows()["launchpad"] is not None:
            elapsed = time.time() - (deadline - timeout)
            print(f"start-cubesuite: launchpad window up ({elapsed:.1f}s)")
            return 0
        time.sleep(0.25)
    print(
        f"start-cubesuite: timeout ({timeout}s) waiting for launchpad", file=sys.stderr
    )
    return 1


def set_channel(channel: int) -> int:
    """Set the MIDI channel in the edit dialog."""
    return edit_set_channel(channel)


def set_type(mtype: MidiType) -> int:
    """Select the message type in the edit dialog."""
    return edit_set_type(mtype)


def set_data1(value: int) -> int:
    return edit_set_data1(value)


def set_data2(value: int) -> int:
    return edit_set_data2(value)


def _add_bank_flag(p) -> None:
    p.add_argument(
        "--bank",
        choices=["a", "b"],
        default="a",
        help="foot switch bank: a (default) or b (+350px X on FootCtrlPlus)",
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="choco",
        description="Drive the M-Vave Chocolate Plus editor GUI via xdotool.",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    p_state = sub.add_parser(
        "state",
        aliases=["status"],
        help="report which window is focused and which actions are allowed",
    )
    p_state.add_argument("--json", action="store_true", help="machine-readable output")

    p_geom = sub.add_parser("geometry", help="print a window's frame rect (x y w h)")
    p_geom.add_argument(
        "window",
        nargs="?",
        choices=STACK,
        help="window to measure (default: topmost open one)",
    )

    p_click = sub.add_parser("click", help="left-click a named coordinate")
    p_click.add_argument("name", choices=sorted(COORDS))
    p_click.add_argument(
        "--absolute",
        action="store_true",
        help="compute screen coords from wmctrl -lG instead of window-relative",
    )
    _add_bank_flag(p_click)

    p_switch = sub.add_parser(
        "switch",
        help="select a foot switch (A/B/C/D), or 'get' to detect the "
        "currently-selected one (requires Advanced Custom mode)",
    )
    p_switch.add_argument(
        "foot",
        nargs="?",
        default="set",
        choices=["set", "get"] + list(FOOT_SWITCHES),
        help="'get' (detect), 'set' (show choices), or A/B/C/D",
    )
    p_switch.add_argument(
        "--absolute",
        action="store_true",
        help="compute screen coords from wmctrl -lG instead of window-relative",
    )
    _add_bank_flag(p_switch)

    p_fsm = sub.add_parser(
        "footswitch-mode",
        aliases=["mode"],
        help="select a footswitch mode radio button (per foot switch)",
    )
    p_fsm.add_argument("mode", choices=sorted(FOOTSWITCH_MODES))

    p_dm = sub.add_parser(
        "device-mode",
        help="select ['set'] a device mode radio button (how the device "
        "operates as a whole; one at a time), or 'get' to detect the "
        "enabled one from the window",
    )
    p_dm.add_argument(
        "mode",
        nargs="?",
        default="set",
        choices=["set", "get"] + sorted(DEVICE_MODES),
        help="'get' (detect), 'set' (show choices), or a mode name",
    )

    p_trs = sub.add_parser(
        "trs-jack-mode",
        help="select a TRS jack mode radio button (expression pedal vs raw "
        "MIDI into the TRS socket), or 'get' to detect the enabled one",
    )
    p_trs.add_argument(
        "mode",
        nargs="?",
        default="set",
        choices=["set", "get"] + sorted(TRS_JACK_MODES),
        help="'get' (detect), 'set' (show choices), or a mode name",
    )

    p_pol = sub.add_parser(
        "trs-jack-reverse-polarity",
        help="toggle TRS jack reverse-polarity, or 'get' to read the switch "
        "state from the window (requires PIL + ImageMagick)",
    )
    p_pol.add_argument(
        "action",
        nargs="?",
        default="toggle",
        choices=["toggle", "get"],
        help="'toggle' (default) or 'get'",
    )
    p_pol.add_argument(
        "--absolute",
        action="store_true",
        help="compute screen coords from wmctrl -lG instead of window-relative",
    )

    p_read = sub.add_parser(
        "read-bank",
        help="OCR the MIDI message list in a bank (Advanced Custom mode) "
        "via screenshot + tesseract",
    )
    p_read.add_argument("bank", nargs="?", default="a", choices=["a", "b"])

    p_remove = sub.add_parser("remove-all", help="click 'Remove all' on FootCtrlPlus")
    p_remove.add_argument(
        "--absolute",
        action="store_true",
        help="compute screen coords from wmctrl -lG instead of window-relative",
    )
    _add_bank_flag(p_remove)

    p_add = sub.add_parser("add", help="click 'Add' on FootCtrlPlus")
    p_add.add_argument(
        "--absolute",
        action="store_true",
        help="compute screen coords from wmctrl -lG instead of window-relative",
    )
    _add_bank_flag(p_add)

    p_start = sub.add_parser(
        "start-foot-ctrl-plus",
        help="click the launcher button on the launchpad (runs init sequence)",
    )
    p_start.add_argument(
        "--absolute",
        action="store_true",
        help="compute screen coords from wmctrl -lG instead of window-relative",
    )

    sub.add_parser(
        "close-editor",
        help="close FootCtrlPlus via the Escape key (graceful exit)",
    )
    sub.add_parser(
        "close-footctrlplus",
        help="close the FootCtrlPlus window via its title-bar close button",
    )
    sub.add_parser(
        "close-launchpad",
        help="close the CubeSuite launchpad via its title-bar close button "
        "(exits the app)",
    )
    sub.add_parser(
        "start-cubesuite",
        help="start CubeSuite via Bottles (env Chocolate) and wait for the launchpad",
    )

    p_open_edit = sub.add_parser(
        "open-edit",
        help="click the Edit button of a mapped event (default: the first one)",
    )
    p_open_edit.add_argument("index", nargs="?", type=int, default=0)
    _add_bank_flag(p_open_edit)

    p_ec = sub.add_parser("edit-channel", help="set MIDI channel 1-16 in the dialog")
    p_ec.add_argument("channel", type=int)

    p_et = sub.add_parser("edit-type", help="select the message type in the dialog")
    p_et.add_argument("type", choices=[t.value for t in MidiType])

    p_d1 = sub.add_parser("edit-data1", help="set the Data1 field (0-127)")
    p_d1.add_argument("value", type=int)

    p_d2 = sub.add_parser("edit-data2", help="set the Data2 field (0-127)")
    p_d2.add_argument("value", type=int)

    p_confirm = sub.add_parser(
        "confirm-edit",
        help="click Confirm: save the dialog and close it",
    )
    p_confirm.add_argument(
        "--type",
        choices=[t.value for t in MidiType],
        help="message type; adjusts OK position (PC hides Data2, button 10px up)",
    )

    p_sm = sub.add_parser(
        "set-message",
        help="one-shot: open the event's edit dialog, fill it, and confirm",
    )
    p_sm.add_argument("type", choices=[t.value for t in MidiType])
    p_sm.add_argument("channel", type=int, help="MIDI channel 1-16")
    p_sm.add_argument("data1", type=int, help="program/controller/note number 0-127")
    p_sm.add_argument(
        "data2", type=int, nargs="?", help="value/velocity 0-127 (non-PC)"
    )
    p_sm.add_argument("--event", type=int, default=0, help="event index (default 0)")
    _add_bank_flag(p_sm)

    args = parser.parse_args(argv)

    if args.command in ("state", "status"):
        return cmd_state(args.json)
    if args.command == "geometry":
        return cmd_geometry(args.window)
    if args.command == "click":
        return click_named(args.name, args.absolute, bank=args.bank)
    if args.command == "switch":
        if args.foot == "get":
            fsw, problems = detect_footswitch()
            if problems:
                print(
                    f"switch get: detection problem: {'; '.join(problems)}",
                    file=sys.stderr,
                )
                return 1
            print(f"switch: footswitch {fsw.upper()} selected")
            return 0
        return switch(args.foot, args.absolute, bank=args.bank)
    if args.command in ("footswitch-mode", "mode"):
        return set_footswitch_mode(args.mode)
    if args.command == "device-mode":
        if args.mode == "get":
            mode, problems = detect_device_mode()
            if problems:
                print(
                    f"device-mode get: detection problem: {'; '.join(problems)}",
                    file=sys.stderr,
                )
                return 1
            print(f"device-mode: {mode} enabled")
            return 0
        return set_device_mode(args.mode)
    if args.command == "trs-jack-mode":
        if args.mode == "get":
            mode, problems = detect_trs_jack_mode()
            if problems:
                print(
                    f"trs-jack-mode get: detection problem: {'; '.join(problems)}",
                    file=sys.stderr,
                )
                return 1
            print(f"trs-jack-mode: {mode} enabled")
            return 0
        return set_trs_jack_mode(args.mode)
    if args.command == "trs-jack-reverse-polarity":
        if args.action == "get":
            state = polarity_reversed()
            if state is None:
                print(
                    "trs-jack-reverse-polarity: unknown ",
                    "(window closed / color not recognized)",
                    file=sys.stderr,
                )
                return 1
            print(
                "trs-jack-reverse-polarity: "
                f"{'on (reversed)' if state else 'off (normal)'}"
            )
            return 0 if state is not None else 1
        return toggle_polarity()
    if args.command == "read-bank":
        entries = read_bank(args.bank)
        if entries is None:
            print(
                f"read-bank: no entries parsed from bank {args.bank.upper()} "
                "(empty? window down? OCR failed?)",
                file=sys.stderr,
            )
            return 1
        print(f"bank {args.bank.upper()} entries ({len(entries)}):")
        for e in entries:
            print(
                f"  [{e['index']}] ch{e['channel']} {e['type']} "
                f"{e['data1']} {e['data2']}"
            )
        return 0
    if args.command == "remove-all":
        return remove_all(args.absolute, bank=args.bank)
    if args.command == "add":
        return add(args.absolute, bank=args.bank)
    if args.command == "start-foot-ctrl-plus":
        return start_foot_ctrl_plus(args.absolute)
    if args.command == "close-editor":
        return close_editor()
    if args.command == "close-footctrlplus":
        return close_footctrlplus()
    if args.command == "close-launchpad":
        return close_launchpad()
    if args.command == "start-cubesuite":
        return start_cubesuite()
    if args.command == "open-edit":
        return open_edit(args.index, bank=args.bank)
    if args.command == "edit-channel":
        return edit_set_channel(args.channel)
    if args.command == "edit-type":
        return edit_set_type(MidiType(args.type))
    if args.command == "edit-data1":
        return edit_set_data1(args.value)
    if args.command == "edit-data2":
        return edit_set_data2(args.value)
    if args.command == "confirm-edit":
        return edit_confirm(mtype=MidiType(args.type) if args.type else None)
    if args.command == "set-message":
        msg = MidiMessage(
            channel=args.channel,
            mtype=MidiType(args.type),
            data1=args.data1,
            data2=args.data2,
        )
        return set_message(msg, event_index=args.event, bank=args.bank)

    parser.error(f"unhandled command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
