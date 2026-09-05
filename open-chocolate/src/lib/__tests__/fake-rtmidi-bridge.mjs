// Stub standing in for the compiled rtmidi-bridge during tests: speaks the
// same newline-delimited JSON protocol, but against a fixed "device" and
// without any MIDI hardware. Uses globalThis.process so ESLint's no-undef
// rule (which lacks Node globals in this config) stays quiet.
import { createInterface } from 'node:readline';
import { setTimeout } from 'node:timers';

const out = (obj) => globalThis.process.stdout.write(JSON.stringify(obj) + '\n');

out({ type: 'ready' });

createInterface({ input: globalThis.process.stdin }).on('line', (line) => {
  const [cmd, ...rest] = line.trim().split(' ');
  if (!cmd) return;
  switch (cmd) {
    case 'list':
      out({
        type: 'list',
        inputs: [{ index: 0, name: 'Fake MIDI 1' }],
        outputs: [{ index: 0, name: 'Fake MIDI 1' }],
      });
      break;
    case 'open': {
      const [dir, index] = rest;
      out({ type: 'open', dir, index: Number(index) });
      if (dir === 'in') {
        // Deliver one demo SysEx message shortly after opening, like a device
        // answering a discovery request.
        setTimeout(
          () =>
            out({ type: 'msg', index: Number(index), bytes: [0xf0, 0x00, 0x32, 0x45, 0x58, 0xf7] }),
          20
        );
      }
      break;
    }
    case 'send': {
      const index = Number(rest[0]);
      if (index !== 0) {
        out({ type: 'error', message: `output port not open: ${index}` });
        break;
      }
      out({ type: 'sent', index, count: rest.length - 1 });
      break;
    }
    case 'close': {
      const [dir, index] = rest;
      out({ type: 'close', dir, index: Number(index) });
      break;
    }
    case 'quit':
      globalThis.process.exit(0);
      break;
    default:
      out({ type: 'error', message: `unknown command: ${cmd}` });
  }
});
