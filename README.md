# choco — M-Vave Chocolate Plus editor CLI driver

Thin wrapper around `wmctrl`/`xdotool` that drives the M-Vave Chocolate
Plus editor GUI from the command line. The end goal is a CLI that can
script the editor and record the MIDI traffic it exchanges with the
Chocolate controller.

## Window stack model

The app is a stack of three windows; each one steals focus from the one
below it, so only the actions of the *topmost open* window are legal:

| window       | title match        | actions                               |
|--------------|--------------------|---------------------------------------|
| launchpad    | `CubeSuite`        | `start-foot-ctrl-plus`                |
| footctrlplus | `FootCtrlPlus`     | `switch A/B/C/D`, `remove-all`, `add` |
| midi_edit    | `midi code edit`   | TBD (placeholder)                     |

Actions refuse to run (exit 1, no click) when their window isn't the
focused one. `choco.py state` reports the current state and the allowed
actions.

## Dependencies

- `wmctrl`, `xdotool` (both already installed on this machine)
- Python 3.8+ (stdlib only)

## Usage

```sh
python3 choco.py state                  # focused window + allowed actions (--json for machine-readable)
python3 choco.py geometry [window]      # frame rect x y w h of a window (default: focused)
python3 choco.py start-cubesuite       # start CubeSuite via Bottles (env Chocolate) + wait for launchpad
python3 choco.py start-foot-ctrl-plus   # launcher button -> FootCtrlPlus + init sequence
python3 choco.py close-footctrlplus     # close FootCtrlPlus via title-bar close button (1250,17)
python3 choco.py close-editor           # (alt) close FootCtrlPlus via Escape
python3 choco.py close-launchpad        # close the CubeSuite launchpad (exits the app) (648,13)
python3 choco.py switch A               # select foot switch A/B/C/D
python3 choco.py switch get             # detect the selected footswitch (requires Advanced Custom)
python3 choco.py footswitch-mode single_step_double_bank   # select a footswitch mode radio (per foot switch)
python3 choco.py footswitch-mode get                       # detect the enabled footswitch mode (current footswitch)
python3 choco.py device-mode advanced_custom             # select a device mode radio (one at a time)
python3 choco.py device-mode get                          # detect the enabled device mode (white-dot radio)
python3 choco.py trs-jack-mode expression_pedal          # select TRS jack mode (expression pedal / trs-midi)
python3 choco.py trs-jack-mode get                        # detect the enabled TRS jack mode (white-dot radio)
python3 choco.py trs-jack-reverse-polarity toggle        # toggle TRS jack polarity reversal (toggle|get)
python3 choco.py remove-all             # clear the mapped events list
python3 choco.py add                    # append a new event to the list
python3 choco.py click <name>           # generic: click any named coordinate
./demo.sh                               # canned sequence with 1s pauses
```

Footswitch modes (radio group, selected per foot switch; the mode decides
how many banks are configurable — 1 or 2): `single_step_single_bank`,
`single_step_double_bank`, `press_down_release_double_bank`,
`long_step_single_bank`, `step_short_or_long_double_bank`. Bank A events
are shared across all modes; Bank B events are shared across all
double-bank modes. `footswitch-mode get` detects the enabled mode for the
currently-selected footswitch (requires `advanced_custom`).

Device modes (radio group, how the whole device operates; one at a time;
distinct from footswitch mode): `program_change_a`, `program_change_b`,
`custom`, `advanced_custom` (the only one exposing granular footswitch
mode/bank config), `manufacturer_control`, `touch_screen_android`,
`video_control`, `keyboard_a`, `keyboard_b`, `multimedia_keyboard`,
`custom_keyboard`, `mix`, `speaker`. `device-mode get` detects the
enabled one from the window: the selected radio shows a white center dot
(others dark); it errors if 0 or >1 modes look enabled. `switch get`
detects the selected footswitch (A/B/C/D) the same way, requiring
`advanced_custom` device mode (errors otherwise).

TRS jack modes (radio group, how the TRS socket reads; independent of
device/footswitch mode; one at a time): `expression_pedal`, `trs_midi`.
`trs-jack-mode get` detects the enabled one (same white-dot radio method
as `device-mode get`).
The TRS jack polarity reversal toggle (`trs-jack-reverse-polarity
[toggle|get]`) is read back from the window's pixels (#08251d off /
#33eab8 on, tolerance ±24).

## OCR: reading a bank's MIDI message list

In `Advanced Custom` device mode each bank shows its configured MIDI
messages as text rows. `read-bank` screenshots the FootCtrlPlus window and
OCRs the bank region (A: (590,640)-(883,852), B shifted +340px X):

```sh
python3 choco.py read-bank a     # bank A (default)
python3 choco.py read-bank b     # bank B
python3 choco.py read-bank-exact a  # byte-exact slot-1 read via 0D register-read init (reopens editor)
```

`read-bank-exact` decodes the slot-1 MIDI record directly from the device
config (the `0D` register-read protocol, chunk `000000`) — no OCR. It
closes and re-opens FootCtrlPlus to trigger the read-back. Currently
decodes slot 1 only (see REVERSED_PROTOCOL_SPEC.md §4.3).

Output is one row per parsed entry:
```
bank A entries (2):
  [1] ch3 Note ON 60 127
  [2] ch1 PC 0 0
```

Requirements / notes:
- **tesseract** + **pytesseract** (pip) + **Pillow**. `eng.traineddata`
  must be present — this machine has it in `~/.local/share/tessdata`;
  `read-bank` auto-points `TESSDATA_PREFIX` there if the system dir lacks
  `eng`.
- The list text is bright green (#33eab8) on dark green; `read-bank`
  masks on green-dominance before OCR (grayscale alone can't separate it).
The `[idx]` and `data2` of a `PC` row sometimes OCR imperfectly (merged
`00`) — the parser tolerates a missing `[` and a single trailing number
(data2 defaults to 0).

**Fidelity caveat:** tesseract on this small green-on-dark font reliably
detects the row structure (indices, message types) but exact data1/data2
digits can be misread (~30-40% of rows; bottom rows 9-11 most affected).
Treat `read-bank` as an overview; for exact values use the harness to
re-read the configured messages, or decode the `0D` register-read protocol
(bytes from the device) which is exact.

## Filling in the coordinates

`COORDS` in `choco.py` is a dict of name → window-relative `(x, y)`.
`foot_a` / `foot_b` are measured; the rest are placeholders. To measure:

1. `python3 choco.py state` — confirm which window is focused
2. Screenshot the window to get pixel positions:
   `import -window <wid> shot.png` (ImageMagick)
3. Fill in `COORDS` and test with `python3 choco.py switch A`

### If clicks land in the wrong place

Window-relative clicks (`xdotool mousemove --window`) are measured from
the window's reported origin. On reparenting WMs that origin includes the
title bar, shifting every click a bit down/right. If so, either:

- measure coordinates relative to the *frame* (title bar included), starting
  from `python3 choco.py geometry`,
- or use `python3 choco.py switch A --absolute`, which converts relative
  coords to absolute screen coords internally via `wmctrl -lG`.

## MIDI recording

`midi.py` provides a context manager that runs `aseqdump` on the matching
ALSA sequencer ports while a choco action sequence executes. Events stream
live to the console (prefixed per port) and are teed to a timestamped log
file under `captures/<MM_DD>/` (`captures/09_05/midi_20260905_190017.log`).

```python
from midi import record
from choco import switch, add, remove_all

with record("WINE midi driver"):      # port client-name pattern(s)
    switch("B")
    add()
```

- Patterns are substring + case-insensitive matches against `aseqdump -l`
  client names; pass several to capture multiple ports (e.g.
  `record("WINE midi driver", "SINCO")` for the pedal later).
- Raise an error (with the full port list) if nothing matches, so typos
  are obvious.
- The `with` block's value is `{"log_file": ..., "ports": [...]}`.

The same actions are importable from `choco` for scripting:
`switch("A")`, `add()`, `remove_all()`, `start_foot_ctrl_plus()`, `click_named(...)`.

### trace.py — decode and watch MIDI live (no files)

`trace.py` taps the ALSA ports itself and decodes each event as it
arrives — one command, no intermediate log:

```sh
python3 trace.py                         # live: taps WINE midi driver + SINCO
python3 trace.py SINCO "WINE midi"       # live: custom port patterns
python3 trace.py --dir app->              # live: app side only
python3 trace.py midi_xxx.log            # analyze an existing capture log
```

```
[#   1] app-> SYSEX len=111 op=erase?(05) sub=025E off=00 chk=6804
[#   2] pdl-> SYSEX len=12 ACK F0 00 32 01 08 00 00 00 00 7F 01 F7
[#   3] app-> SYSEX len=1190 op=dump(40) sub=025D off=00 chk=6C01
...
[#  29] app-> SYSEX len=56 op=write(02) sub=025D off=68 chk=2009
[#  31] pdl-> Program change 0, program 0
```

- Default patterns: `WINE midi driver`, `SINCO`. Direction comes from the
  source port's client name: matching `--app` -> `app->` (TX), the rest ->
  `pdl->` (RX) unless `--pedal` is given.
- Options: `--raw` (full SysEx hex), `--dir app->|pdl->`, `--app`/`--pedal`.
- Listen in one terminal: `python3 trace.py`; interact with the app
  (or press pedal buttons) in another. `Ctrl+C` stops (decoded lines go to
  stdout, status lines to stderr, so `1> trace.txt` captures just the decode).

If you *do* want a saved capture, use `record()` (writes
`captures/<MM_DD>/midi_<timestamp>.log` with a `# port:` header; `trace.py
<path>` analyzes it later).

### First observations (2026-09-05)

The app reads/writes the device config in chunked SysEx. Each GUI action
triggers: an erase/write message, ~13 x 1190B `op=40` dump chunks (offset
byte 0x00-0x60, stepping 8), each ACKed by the pedal
(`F0 00 32 01 08 ... 7F 01 F7`), then the specific change (`op=02` write at
offset 0x68 for "add one Program change"). Header is
`F0 00 32 09 41 <op> <ln> <lnlen> <subhi> <sublo> <off> <payload> <chk1> <chk2> F7`;
`09` = host->device, `01` = device->host; the last two bytes before `F7`
look like a data-dependent checksum. Decoding is tentative and lives in
trace.py's `SYSEX_OP` / `decode_sysex`.

Button A on the pedal sends `Program change 0, program 0` (raw `C0 00`) —
and, earlier, sent four of them when four events were mapped. One event
mapped = one message delivered per press, end-to-end verified.

## Next steps (planned)

- auto-open/close the app instead of requiring it to be running
- JSONL log format `{t, dir: in|out, bytes, gui_action}` correlating GUI
  actions with the SysEx/NRPN bytes they produce; replay + diff for
  hypothesis testing
- protocol discovery: discovery ping → config dump, button → event list
- "midi code edit" window actions once that window exists