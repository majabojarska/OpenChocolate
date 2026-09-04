import { describe, expect, it } from 'vitest';
import { emptyConfig, type DeviceConfig } from '../device';
import { configFromSnapshot, pagesFromSnapshot, toSnapshot } from '../snapshot';

const config: DeviceConfig = {
  ...emptyConfig(),
  mode: 3,
  midiInterface: 1,
  midiChannel: 5,
  polarity: true,
  maxGroupCount: 4,
  maxBanksPcA: 32,
  maxBanksPcB: 8,
  usrPage: 1,
  customCc: [[10, 1], null, [30, 0], null, [50, 1]],
  footswitchModes: [0, 1, 2, null],
};

const baseSnapshot = {
  app: 'open-chocolate',
  version: 1,
  savedAt: '2026-01-01T00:00:00.000Z',
  device: { name: 'Chocolate Plus', manufacturer: 'SinCo' },
};

describe('toSnapshot / configFromSnapshot round-trip', () => {
  it('preserves a config through serialize -> JSON file -> parse', () => {
    const pages = new Map([[0, Uint8Array.from([1, 2, 3])]]);
    const snapshot = toSnapshot(baseSnapshot.device, config, pages);
    const restored = JSON.parse(JSON.stringify(snapshot)); // what export/import does

    expect(restored.app).toBe('open-chocolate');
    expect(restored.version).toBe(1);
    expect(restored.device).toEqual(baseSnapshot.device);
    expect(configFromSnapshot(restored)).toEqual(config);
  });

  it('clones instead of retaining references to live state', () => {
    const local = structuredClone(config);
    const snapshot = toSnapshot(null, local, new Map<number, Uint8Array>());
    local.mode = 7;
    expect(snapshot.config.mode).toBe(3);
  });

  it('falls back to nulls for untrusted / invalid fields', () => {
    const restored = {
      ...baseSnapshot,
      device: null,
      config: {
        mode: 'advanced',
        midiChannel: null,
        polarity: 1,
        maxGroupCount: '4',
        customCc: [[5], 'nope', [20, 1], [7, 'x'], null],
        footswitchModes: ['a', 2, null, {}],
      },
    };
    const cfg = configFromSnapshot(restored);
    expect(cfg.mode).toBeNull();
    expect(cfg.midiChannel).toBeNull();
    expect(cfg.polarity).toBe(true);
    expect(cfg.maxGroupCount).toBeNull();
    expect(cfg.customCc).toEqual([null, null, [20, 1], null, null]);
    expect(cfg.footswitchModes).toEqual([null, 2, null, null]);
  });
});

describe('pagesFromSnapshot', () => {
  it('round-trips raw page payloads', () => {
    const pages = new Map([
      [3, Uint8Array.from([0xde, 0xad])],
      [18, Uint8Array.from([1, 2, 3, 4])],
    ]);
    const restored = JSON.parse(JSON.stringify(toSnapshot(null, emptyConfig(), pages)));
    const parsed = pagesFromSnapshot(restored);
    expect(parsed.get(3)).toEqual(Uint8Array.from([0xde, 0xad]));
    expect(parsed.get(18)).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it('skips malformed entries instead of throwing', () => {
    const parsed = pagesFromSnapshot({
      rawPages: [
        { index: 0, payloadHex: 'zz' }, // not hex
        { index: 1, payloadHex: 'abc' }, // odd length
        { index: 'x', payloadHex: 'abcd' }, // bad index
        { payloadHex: 'abcd' }, // missing index
        { index: 2, payloadHex: 'aabb' },
      ],
    });
    expect([...parsed.keys()]).toEqual([2]);
    expect(parsed.get(2)).toEqual(Uint8Array.from([0xaa, 0xbb]));
  });
});
