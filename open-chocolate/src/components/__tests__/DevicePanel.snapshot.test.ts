// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DevicePanel from '../DevicePanel.vue';
import { device, fullConfig, pair } from './fixtures';

describe('DevicePanel snapshot', () => {
  it('prompts to rescan before the first scan', () => {
    const wrapper = mount(DevicePanel, {
      props: {
        devices: [],
        scanned: false,
        scanning: false,
        selectedKey: null,
        connectedKey: null,
        connectingKey: null,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('reports no devices after a completed scan', () => {
    const wrapper = mount(DevicePanel, {
      props: {
        devices: [],
        scanned: true,
        scanning: false,
        selectedKey: null,
        connectedKey: null,
        connectingKey: null,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('shows the scanning message while scanning', () => {
    const wrapper = mount(DevicePanel, {
      props: {
        devices: [],
        scanned: false,
        scanning: true,
        selectedKey: null,
        connectedKey: null,
        connectingKey: null,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('lists a single detected device as selected', () => {
    const wrapper = mount(DevicePanel, {
      props: {
        devices: [device({ pair: pair('Chocolate Plus') })],
        scanned: true,
        scanning: false,
        selectedKey: 'Chocolate Plus',
        connectedKey: null,
        connectingKey: null,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('shows the connecting state on the connecting device', () => {
    const wrapper = mount(DevicePanel, {
      props: {
        devices: [device({ pair: pair('Chocolate Plus'), status: 'connecting' })],
        scanned: true,
        scanning: false,
        selectedKey: null,
        connectedKey: null,
        connectingKey: 'Chocolate Plus',
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('shows the disconnect button on the connected device', () => {
    const wrapper = mount(DevicePanel, {
      props: {
        devices: [device({ pair: pair('Chocolate Plus'), status: 'connected' })],
        scanned: true,
        scanning: false,
        selectedKey: 'Chocolate Plus',
        connectedKey: 'Chocolate Plus',
        connectingKey: null,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('shows a failed device with a connect button', () => {
    const wrapper = mount(DevicePanel, {
      props: {
        devices: [device({ pair: pair('Chocolate Plus'), status: 'failed' })],
        scanned: true,
        scanning: false,
        selectedKey: null,
        connectedKey: null,
        connectingKey: null,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('lists mixed-status devices and keeps the selected one highlighted', () => {
    const wrapper = mount(DevicePanel, {
      props: {
        devices: [
          device({ pair: pair('Chocolate Plus', 'cp-1') }),
          device({
            pair: pair('Other Midi', 'other-1', null),
            status: 'failed',
          }),
          device({
            pair: pair('Chocolate Plus B', 'cp-2'),
            status: 'connected',
            config: fullConfig(),
          }),
        ],
        scanned: true,
        scanning: false,
        selectedKey: 'cp-2',
        connectedKey: 'cp-2',
        connectingKey: null,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
