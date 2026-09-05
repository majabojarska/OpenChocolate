// End-to-end test against the REAL device through the native RtMidi
// transport. Skipped unless RTMIDI_E2E=1; requires the device plugged in and
// ALSA access (run unsandboxed, like the Playwright device driver):
//
//   RTMIDI_E2E=1 npx vitest run src/lib/__tests__/rtmidi-e2e.test.ts
//
// This validates the whole chain that the CLI will use:
// CommsService <-> RtMidiTransport <-> rtmidi-bridge <-> RtMidi <-> ALSA.

import { describe, expect, it } from 'vitest';
import { CommsService } from '../device';
import { RtMidiTransport } from '../rtmidi';

const e2e = process.env.RTMIDI_E2E === '1';

describe.skipIf(!e2e)('real device (RtMidi)', () => {
  it('scans, connects and rereads the SINCO device', async () => {
    const transport = new RtMidiTransport();
    const comms = new CommsService(transport);
    try {
      await comms.scan();
      const devices = comms.getDevices();
      const sinco = devices.find((d) => d.pair.name.toLowerCase().includes('sinco'));
      expect(
        sinco,
        `no SINCO device among: ${devices.map((d) => d.pair.name).join(', ')}`
      ).toBeTruthy();

      await comms.connect(sinco!.pair.key);
      expect(comms.getConnected()?.status).toBe('connected');

      const config = comms.getConnected()?.config;
      expect(config).toBeTruthy();
      // A connected read-back must have decoded real values.
      expect(config!.mode).toBeTypeOf('number');
      expect(config!.footswitchBanks).toBeTruthy();

      await comms.reread();
      expect(comms.getConnected()?.status).toBe('connected');
    } finally {
      await transport.close();
    }
  }, 120_000);
});
