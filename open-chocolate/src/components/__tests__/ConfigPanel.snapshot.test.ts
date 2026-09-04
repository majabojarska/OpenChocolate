// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ConfigPanel from '../ConfigPanel.vue';
import { emptyConfig } from '../../lib/device';
import { fullConfig } from './fixtures';

/** Mount ConfigPanel with a config for the given mode and snapshot it. */
function snapshotForMode(
  mode: number | null,
  tweak: (config: ReturnType<typeof emptyConfig>) => void = () => {}
) {
  const config = emptyConfig();
  config.mode = mode;
  tweak(config);
  const wrapper = mount(ConfigPanel, {
    props: { config, hasDevice: true, busy: false },
  });
  expect(wrapper.html()).toMatchSnapshot();
}

describe('ConfigPanel snapshot', () => {
  it('shows the placeholder when no device is connected', () => {
    const wrapper = mount(ConfigPanel, {
      props: { config: emptyConfig(), hasDevice: false, busy: false },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('renders PC mode (A) with device-wide settings', () => {
    snapshotForMode(0x00, (c) => {
      c.midiChannel = 0;
      c.maxGroupCount = 4;
      c.midiInterface = 0;
      c.maxBanksPcA = 8;
      c.polarity = false;
    });
  });

  it('renders CC mode (B) and uses maxBanksPcB', () => {
    snapshotForMode(0x01, (c) => {
      c.maxBanksPcB = 2;
    });
  });

  it('renders Custom mode with CC/latch values', () => {
    snapshotForMode(0x02, (c) => {
      c.customCc = [
        [10, 0],
        [20, 1],
        [30, 0],
        [40, 1],
        [50, 0],
      ];
    });
  });

  it('renders Advanced Custom mode with banks', () => {
    snapshotForMode(0x03, (c) => {
      Object.assign(c, fullConfig());
    });
  });

  it('renders Manufacturer Control mode (no sub-view)', () => {
    snapshotForMode(0x04);
  });

  it('renders Touch Screen mode predefined actions', () => {
    snapshotForMode(0x05);
  });

  it('renders Video Control mode predefined actions', () => {
    snapshotForMode(0x06);
  });

  it('renders Keyboard A mode predefined actions', () => {
    snapshotForMode(0x07);
  });

  it('renders Keyboard B mode predefined actions', () => {
    snapshotForMode(0x08);
  });

  it('renders Music Player mode predefined actions', () => {
    snapshotForMode(0x09);
  });

  it('renders Custom Keyboard placeholder', () => {
    snapshotForMode(0x0a);
  });

  it('renders Mix Key placeholder', () => {
    snapshotForMode(0x0b);
  });

  it('renders Speaker mode (no sub-view)', () => {
    snapshotForMode(0x0c);
  });

  it('renders a null mode as an empty config with controls disabled', () => {
    snapshotForMode(null);
  });

  it('disables all controls while busy', () => {
    const config = emptyConfig();
    config.mode = 0x02;
    config.customCc = [
      [10, 0],
      [20, 1],
      [30, 0],
      [40, 1],
      [50, 0],
    ];
    const wrapper = mount(ConfigPanel, {
      props: { config, hasDevice: true, busy: true },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
