/**
 * Configuration snapshot serialization for import/export.
 *
 * Snapshots are written to and loaded from JSON files, so everything parsed
 * here treats the input as untrusted: fields are validated individually and
 * fall back to null instead of throwing.
 */

import type { DeviceConfig, FootswitchBank, MidiCode } from './device.ts';
import { CUSTOM_CC_BANKS, MIDI_CODE_SLOTS } from './sysex.ts';

export interface CommsSnapshot {
  app: string;
  version: number;
  savedAt: string;
  device: { name: string; manufacturer: string | null } | null;
  config: DeviceConfig;
  rawPages?: { index: number; payloadHex: string }[];
}

/** Build a snapshot for a file download. Clones its inputs. */
export function toSnapshot(
  device: { name: string; manufacturer: string | null } | null,
  config: DeviceConfig,
  rawPages: Map<number, Uint8Array>
): CommsSnapshot {
  return {
    app: 'open-chocolate',
    version: 1,
    savedAt: new Date().toISOString(),
    device: device ? { ...device } : null,
    config: structuredClone(config),
    rawPages: [...rawPages.entries()].map(([index, payload]) => ({
      index,
      payloadHex: Array.from(payload, (b) => b.toString(16).padStart(2, '0')).join(''),
    })),
  };
}

/** Defensively parse the config of a loaded snapshot file. */
export function configFromSnapshot(snapshot: unknown): DeviceConfig {
  const cfg = (asRecord(snapshot)?.config ?? {}) as Record<string, unknown>;
  return {
    mode: numOrNull(cfg.mode),
    midiInterface: normalizeInterface(numOrNull(cfg.midiInterface)),
    midiChannel: numOrNull(cfg.midiChannel),
    reversePolarity: Boolean(cfg.reversePolarity ?? cfg.polarity),
    maxGroupCount: numOrNull(cfg.maxGroupCount),
    maxBanksPcA: numOrNull(cfg.maxBanksPcA),
    maxBanksPcB: numOrNull(cfg.maxBanksPcB),
    usrPage: numOrNull(cfg.usrPage),
    customCc: Array.from({ length: CUSTOM_CC_BANKS }, (_, i) => {
      const pair = Array.isArray(cfg.customCc) ? cfg.customCc[i] : null;
      if (Array.isArray(pair) && pair.length === 2) {
        const cc = numOrNull(pair[0]);
        const latch = numOrNull(pair[1]);
        if (cc !== null && latch !== null) return [cc, latch] as [number, number];
      }
      return null;
    }),
    footswitchModes: [0, 1, 2, 3].map((i) =>
      numOrNull(Array.isArray(cfg.footswitchModes) ? cfg.footswitchModes[i] : null)
    ),
    footswitchBanks: [0, 1, 2, 3].map((sw) => {
      const raw = cfg.footswitchBanks;
      return parseBankPair(Array.isArray(raw) ? raw[sw] : null);
    }),
  };
}

/** Parse one widened [bankA, bankB] pair into bank objects, or null. */
function parseBankPair(value: unknown): [FootswitchBank, FootswitchBank] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const bankA = parseBank(value[0]);
  const bankB = parseBank(value[1]);
  if (!bankA || !bankB) return null;
  return [bankA, bankB];
}

function parseBank(value: unknown): FootswitchBank | null {
  const codes = asRecord(value)?.codes;
  if (!Array.isArray(codes)) return null;
  const parsed: MidiCode[] = [];
  for (let s = 0; s < MIDI_CODE_SLOTS; s++) {
    const rec = asRecord(codes[s]);
    parsed.push(
      rec
        ? {
            enabled: rec.enabled === true || rec.enabled === 1,
            channel: numOrNull(rec.channel) ?? 0,
            type: numOrNull(rec.type) ?? 0,
            data1: numOrNull(rec.data1) ?? 0,
            data2: numOrNull(rec.data2) ?? 0,
          }
        : { enabled: false, channel: 0, type: 0, data1: 0, data2: 0 }
    );
  }
  return { codes: parsed };
}

/** Defensively parse the raw read-back pages of a loaded snapshot file. */
export function pagesFromSnapshot(snapshot: unknown): Map<number, Uint8Array> {
  const pages = new Map<number, Uint8Array>();
  const raw = asRecord(snapshot)?.rawPages;
  if (!Array.isArray(raw)) return pages;
  for (const entry of raw) {
    const rec = asRecord(entry);
    const index = rec ? numOrNull(rec.index) : null;
    const hex = rec?.payloadHex;
    // Reject anything that is not clean hex in whole bytes.
    if (index === null || typeof hex !== 'string') continue;
    if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) continue;
    pages.set(index, new Uint8Array((hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16))));
  }
  return pages;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Clamp a stored TRS value (0 = expression pedal, otherwise TRS-MIDI). */
function normalizeInterface(v: number | null): number | null {
  return v === null ? null : v === 0 ? 0 : 1;
}
