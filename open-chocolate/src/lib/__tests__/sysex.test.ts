import { describe, expect, it } from 'vitest';
import {
  buildConfigurationReadRequest,
  buildDiscoveryRequest,
  buildOpenDeviceRequest,
  parseConfigurationResponse,
  parseDiscoveryRequest,
} from '../sysex';

const discoveryExpected = new Uint8Array([0xf0, 0, 0x32, 0x45, 0, 0, 0, 0x40, 0x7f, 0xf7]);
const openExpected = new Uint8Array([
  0xf0, 0x0, 0x32, 0x0d, 0x41, 0, 0, 0, 2, 0, 0, 0, 0, 0x10, 0x7e, 0, 0, 7, 0, 0xf7,
]);

describe('sysex codec', () => {
  it('builds and parses discovery', () => {
    expect(buildDiscoveryRequest()).toEqual(discoveryExpected);
    expect(parseDiscoveryRequest(discoveryExpected)).toEqual({
      kind: 'discovery-request',
      target: 0x7f,
    });
  });
  it('builds the captured open request', () => {
    expect(buildOpenDeviceRequest()).toEqual(openExpected);
  });
  it('builds a captured configuration read request', () => {
    expect(buildConfigurationReadRequest(new Uint8Array([0, 0, 0, 0]))).toEqual(openExpected);
  });
  it('parses a real configuration response header', () => {
    const response = new Uint8Array([
      0xf0, 0, 0x32, 0x0d, 0x49, 0x3f, 0, 0, 2, 0, 0x10, 0x7e, 0, 0, 0, 1, 2, 3, 4, 0xf7,
    ]);
    expect(parseConfigurationResponse(response)?.selector).toEqual(new Uint8Array([0x3f, 0, 0, 2]));
  });
});
