# Native RtMidi transport

`open-chocolate` talks to the `rtmidi-bridge` — our own minimal wrapper
around [RtMidi](https://github.com/thestk/rtmidi) — instead of a Node.js
native-addon package. RtMidi is MIT-licensed and vendored unmodified in
`rtmidi/` (the two sources it is: `RtMidi.h` + `RtMidi.cpp`); everything
else here is our glue.

## Why a stdio bridge instead of a N-API addon

The bridge is a ~200-line C++ program that opens RtMidi ports and speaks
newline-delimited JSON over stdin/stdout. Node.js side (`src/lib/rtmidi.ts`)
spawns it and implements the same `MidiTransport` interface as the Web MIDI
wrapper. This gets native MIDI (ALSA on Linux — the same sequencer backend
Chromium's Web MIDI uses) with none of the node-gyp / Python / prebuild
fragility, and it is trivial to debug: every line the bridge prints is the
protocol.

## Building

Requires a C++17 compiler and ALSA development headers
(`libasound2-dev` on Debian/Ubuntu):

```sh
make -C native/rtmidi-bridge        # or: npm run build:native
# produces native/rtmidi-bridge/bin/rtmidi-bridge
```

RtMidi 6.x does not auto-detect its backend, so the Makefile passes
`-D__LINUX_ALSA__` explicitly (what CMake would normally inject).

## Protocol (one JSON line per message)

```
node -> bridge (stdin):        bridge -> node (stdout):
  list                         {"type":"ready"}
  open in|out <index>          {"type":"list","inputs":[...],"outputs":[...]}
  close in|out <index>         {"type":"open","dir":"in|out","index":N}
  send <outIndex> <byte...>    {"type":"close",...}
  quit                         {"type":"sent","index":N,"count":K}
                               {"type":"msg","index":N,"bytes":[...]}
                               {"type":"error","message":"..."}
```

Port indices are per-direction RtMidi port numbers (input and output are
numbered independently, like Web MIDI). Input ports are opened with
`ignoreTypes(false, false, false)` — RtMidi drops SysEx by default and the
whole point here is SysEx capture. A 2ms poller thread drains input queues;
stderr carries ALSA diagnostics and never touches the protocol stream.

Transport-level semantics (in `src/lib/rtmidi.ts`, mirroring Web MIDI): on
`requestAccess()` every input port is opened so SysEx flows immediately;
outputs are opened lazily on first use; `openInput`/`send` are idempotent.
The bridge itself also treats `open` as idempotent, so a double-open never
double-subscribes.

## Using it from TS

```ts
import { RtMidiTransport } from './src/lib/rtmidi';
import { CommsService } from './src/lib/device';

const comms = new CommsService(new RtMidiTransport());
await comms.scan();
await comms.connect(/* pair key */);
```

The web app never imports this module; it exists for the CLI and tests.
`src/lib/__tests__/rtmidi.test.ts` exercises the transport against a stub
bridge (`fake-rtmidi-bridge.mjs`) that speaks the protocol without hardware.

## End-to-end test (real device)

```sh
RTMIDI_E2E=1 npx vitest run src/lib/__tests__/rtmidi-e2e.test.ts
```

Skips unless `RTMIDI_E2E=1`; requires the device plugged in and ALSA access
(run unsandboxed, like the Playwright driver). Validates the full chain the
CLI will use: `CommsService <-> RtMidiTransport <-> rtmidi-bridge <-> ALSA`.
