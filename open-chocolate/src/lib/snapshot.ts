/**
 * Configuration snapshot serialization for import/export.
 *
 * Snapshots are written to and loaded from JSON files, so everything parsed
 * here treats the input as untrusted: fields are validated individually and
 * fall back to null instead of throwing.
 */

import type { DeviceConfig } from './device';
import { CUSTOM_CC_BANKS } from './sysex';

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
    midiInterface: numOrNull(cfg.midiInterface),
    midiChannel: numOrNull(cfg.midiChannel),
    polarity: Boolean(cfg.polarity),
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
  };
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
