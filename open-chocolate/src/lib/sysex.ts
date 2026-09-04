export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
const HEADER = [0x00, 0x32];

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
  return new Uint8Array([0xf0, ...HEADER, 0x45, 0, 0, 0, 0x40, target, 0xf7]);
}

export function parseDiscoveryRequest(data: Uint8Array): DiscoveryRequest | null {
  if (
    data.length !== 10 ||
    data[0] !== 0xf0 ||
    data[1] !== 0 ||
    data[2] !== 0x32 ||
    data[3] !== 0x45 ||
    data[4] !== 0 ||
    data[5] !== 0 ||
    data[6] !== 0 ||
    data[7] !== 0x40 ||
    data[9] !== 0xf7
  )
    return null;
  return { kind: 'discovery-request', target: data[8] };
}

export function buildOpenDeviceRequest(): Uint8Array {
  return new Uint8Array([
    0xf0, 0, 0x32, 0x0d, 0x41, 0, 0, 0, 2, 0, 0, 0, 0, 0x10, 0x7e, 0, 0, 7, 0, 0xf7,
  ]);
}

export function buildConfigurationReadRequest(
  selector: Uint8Array,
  trailer = new Uint8Array([0, 0, 7, 0])
): Uint8Array {
  if (selector.length !== 4 || trailer.length !== 4) throw new Error('Invalid read-request fields');
  return new Uint8Array([
    0xf0,
    0,
    0x32,
    0x0d,
    0x41,
    0,
    0,
    0,
    2,
    ...selector,
    0x10,
    0x7e,
    ...trailer,
    0xf7,
  ]);
}

export function parseConfigurationResponse(data: Uint8Array): ConfigurationResponse | null {
  if (
    data.length < 20 ||
    data[0] !== 0xf0 ||
    data[1] !== 0 ||
    data[2] !== 0x32 ||
    data[4] !== 0x49 ||
    data[data.length - 1] !== 0xf7
  )
    return null;
  return {
    kind: 'configuration-response',
    command: data[3],
    selector: data.slice(5, 9),
    payload: data.slice(9, data.length - 1),
  };
}

export function parseSysEx(data: Uint8Array): DiscoveryRequest | ConfigurationResponse | null {
  return parseDiscoveryRequest(data) ?? parseConfigurationResponse(data);
}
