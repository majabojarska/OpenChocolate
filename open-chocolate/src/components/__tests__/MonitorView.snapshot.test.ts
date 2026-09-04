// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MonitorView from '../MonitorView.vue';
import type { MonitorEntry } from '../../lib/device';
import { monitorEntry } from './fixtures';

const hex = (s: string): Uint8Array => new Uint8Array(s.match(/../g)!.map((b) => parseInt(b, 16)));

describe('MonitorView snapshot', () => {
  it('shows the empty state', () => {
    const wrapper = mount(MonitorView, { props: { entries: [] } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('renders a single RX message with hex rows', () => {
    const entries: MonitorEntry[] = [
      monitorEntry({
        bytes: hex('f00032455801f7'), // short discovery response
      }),
    ];
    const wrapper = mount(MonitorView, { props: { entries } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('groups a full, multi-device stream into runs (newest first)', () => {
    const entries: MonitorEntry[] = [
      monitorEntry({
        id: 1,
        device: 'Chocolate Plus',
        dir: 'RX',
        bytes: hex('f00032455801f7'),
      }),
      monitorEntry({
        id: 2,
        device: 'Chocolate Plus',
        dir: 'TX',
        wall: 1_700_000_001_000,
        bytes: hex('f000320d41'),
      }),
      monitorEntry({
        id: 3,
        device: 'Other Midi',
        dir: 'RX',
        wall: 1_700_000_002_000,
        bytes: hex('f00032455802f7'),
      }),
      // A long message spanning two 16-byte rows.
      monitorEntry({
        id: 4,
        device: 'Chocolate Plus',
        dir: 'RX',
        wall: 1_700_000_003_000,
        bytes: hex(
          'f000320d493f0000020000000000107e0000' + '030105010a0014011e00280132abcd'.padEnd(32, '00')
        ),
      }),
    ];
    const wrapper = mount(MonitorView, { props: { entries } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('filters by direction when the RX filter is active', async () => {
    const entries: MonitorEntry[] = [
      monitorEntry({ dir: 'RX', bytes: hex('f00032455801f7') }),
      monitorEntry({ id: 2, dir: 'TX', wall: 1_700_000_001_000, bytes: hex('f000320d41') }),
    ];
    const wrapper = mount(MonitorView, { props: { entries } });
    const buttons = wrapper.findAll('.seg-btn');
    // [All, RX, TX] - click RX
    await buttons[1].trigger('click');
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('shows everything again after filtering back to All', async () => {
    const entries: MonitorEntry[] = [
      monitorEntry({ dir: 'RX', bytes: hex('f00032455801f7') }),
      monitorEntry({ id: 2, dir: 'TX', wall: 1_700_000_001_000, bytes: hex('f000320d41') }),
    ];
    const wrapper = mount(MonitorView, { props: { entries } });
    const buttons = wrapper.findAll('.seg-btn');
    await buttons[1].trigger('click'); // RX
    await buttons[0].trigger('click'); // back to All
    expect(wrapper.html()).toMatchSnapshot();
  });
});
