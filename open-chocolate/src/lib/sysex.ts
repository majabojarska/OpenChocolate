// Common SysEx markers.
export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;

const HEADER = [0x00, 0x32];
const DISCOVERY_COMMAND = 0x45;
const OPEN_DEVICE_COMMAND = 0x0d;
const CONFIGURATION_RESPONSE_COMMAND = 0x49;

// Shared response envelope. After the command byte, both `openDevice` and
// `configurationRead` share the same prefix + 4-byte selector + suffix.
const ENVELOPE_PREFIX = [0, 0, 0, 2];
const ENVELOPE_SUFFIX = [0x10, 0x7e];
const READ_TRAILER = [0, 0, 7, 0];
const OPEN_DEVICE_SELECTOR = [0, 0, 0, 0];

export interface DiscoveryRequest {
  kind: 'discovery-request';
  target: number;
}

export interface ConfigurationResponse {
  kind: 'configuration-response';
  command: number;
  selector: Uint8Array;
  payload: Uint8Array;
}

export function buildDiscoveryRequest(target = 0x7f): Uint8Array {
  return new Uint8Array([
    SYSEX_START,
    ...HEADER,
    DISCOVERY_COMMAND,
    0,
    0,
    0,
    0x40,
    target,
    SYSEX_END,
  ]);
}

export function parseDiscoveryResponse(data: Uint8Array): DiscoveryRequest | null {
  if (data.length !== 10) return null;
  if (
    data[0] !== SYSEX_START ||
    data[1] !== 0 ||
    data[2] !== 0x32 ||
    data[3] !== DISCOVERY_COMMAND ||
    data[4] !== 0 ||
    data[5] !== 0 ||
    data[6] !== 0 ||
    data[7] !== 0x40 ||
    data[9] !== SYSEX_END
  ) {
    return null;
  }
  return { kind: 'discovery-request', target: data[8] };
}

export function buildOpenDeviceRequest(): Uint8Array {
  return new Uint8Array([
    SYSEX_START,
    ...HEADER,
    OPEN_DEVICE_COMMAND,
    0x41,
    ...ENVELOPE_PREFIX,
    ...OPEN_DEVICE_SELECTOR,
    ...ENVELOPE_SUFFIX,
    ...READ_TRAILER,
    SYSEX_END,
  ]);
}

export function buildConfigurationReadRequest(
  selector: Uint8Array,
  trailer: Uint8Array = new Uint8Array(READ_TRAILER)
): Uint8Array {
  if (selector.length !== 4 || trailer.length !== 4) {
    throw new Error('Invalid read-request fields');
  }
  return new Uint8Array([
    SYSEX_START,
    ...HEADER,
    OPEN_DEVICE_COMMAND,
    0x41,
    ...ENVELOPE_PREFIX,
    ...selector,
    ...ENVELOPE_SUFFIX,
    ...trailer,
    SYSEX_END,
  ]);
}

export function parseConfigurationResponse(data: Uint8Array): ConfigurationResponse | null {
  if (data.length < 20) return null;
  if (
    data[0] !== SYSEX_START ||
    data[1] !== 0 ||
    data[2] !== 0x32 ||
    data[4] !== CONFIGURATION_RESPONSE_COMMAND ||
    data[data.length - 1] !== SYSEX_END
  ) {
    return null;
  }
  return {
    kind: 'configuration-response',
    command: data[3],
    selector: data.slice(5, 9),
    payload: data.slice(9, data.length - 1),
  };
}
