// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import AdvancedCustomView from '../config/AdvancedCustomView.vue';
import { defaultMidiCode, type DeviceConfig, type MidiCode } from '../../lib/device';
import { fullConfig } from './fixtures';

/** A config whose bank data is shared with the test so parent-driven
 *  updates (mirroring CommsService.setFootswitchMidiCode) propagate back. */
function advancedConfig(): DeviceConfig {
  return fullConfig();
}

describe('AdvancedCustomView add-message flow', () => {
  it('saves an added message as enabled and shows it in the bank list', async () => {
    const config = ref<DeviceConfig>(advancedConfig());
    // Footswitch A, Bank B: start empty (mode 1 is a two-bank mode, so Bank B
    // tab is visible).
    config.value.footswitchBanks[0]![1] = {
      codes: Array.from({ length: 16 }, () => defaultMidiCode()),
    };

    const wrapper = mount(AdvancedCustomView, {
      props: { config: config.value, busy: false },
    });

    // Switch to Bank B.
    const bankButtons = wrapper.findAll('.bank-tabs .seg-btn');
    await bankButtons[1].trigger('click');

    // Click "Add message" (list is empty, so only the add/remove-all row shows).
    const addButton = wrapper.findAll('button').find((b) => b.text().trim() === 'Add message');
    expect(addButton).toBeDefined();
    await addButton!.trigger('click');

    // The edit form opens with the draft; fill in CH 3, CC type, data1 64, data2 127.
    // The draft starts as PC (type 0), so the Data 2 field is hidden until CC is
    // selected - re-query the selects after choosing the type.
    let selects = wrapper.findAll('form.bank-edit select');
    await selects[0].setValue('2'); // channel (0-based) = 2 -> CH 3
    await selects[1].setValue('1'); // CC
    selects = wrapper.findAll('form.bank-edit select');
    await selects[2].setValue('64');
    await selects[3].setValue('127');

    // Save.
    await wrapper.find('form.bank-edit').trigger('submit');

    // The emitted code must be enabled so the device fires it and the list
    // (which only shows enabled entries) renders it.
    const emitted = wrapper.emitted('footswitch-bank')!;
    expect(emitted).toHaveLength(1);
    expect(emitted[0][0]).toMatchObject({
      page: 0,
      index: 0,
      bank: 1,
      slot: 0,
      code: { enabled: true, channel: 2, type: 1, data1: 64, data2: 127 },
    });

    // Mirror what CommsService.setFootswitchMidiCode does: write the code back
    // into the config, then let the component re-render the bank list.
    const code = (emitted[0][0] as { code: MidiCode }).code;
    config.value.footswitchBanks[0]![1].codes[0] = code;
    await nextTick();

    const rows = wrapper.findAll('.bank-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('CH 3');
    expect(rows[0].text()).toContain('CC');
  });
});

describe('AdvancedCustomView PC data-2 handling', () => {
  it('hides the editable Data 2 field for PC messages and shows a fixed 0', async () => {
    const config = ref<DeviceConfig>(advancedConfig());
    config.value.footswitchBanks[0]![0] = {
      codes: Array.from({ length: 16 }, () => defaultMidiCode()),
    };

    const wrapper = mount(AdvancedCustomView, {
      props: { config: config.value, busy: false },
    });

    const addButton = wrapper.findAll('button').find((b) => b.text().trim() === 'Add message');
    await addButton!.trigger('click');

    // The starter draft is enabled with type 0 (PC) and data 2 fixed at 0.
    const selects = wrapper.findAll('form.bank-edit select');
    expect(selects).toHaveLength(3); // channel, type, data1 - no editable data2

    // Switch to CC and the editable Data 2 field appears again.
    await selects[1].setValue('1');
    await nextTick();
    expect(wrapper.findAll('form.bank-edit select')).toHaveLength(4);
  });
});
