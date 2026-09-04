<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { MonitorEntry } from '../lib/device';

const props = defineProps<{ entries: MonitorEntry[] }>();

defineEmits<{ clear: [] }>();

const filter = ref<'All' | 'RX' | 'TX'>('All');
const autoScroll = ref(true);
const listEl = ref<HTMLElement | null>(null);

const filtered = computed(() =>
  filter.value === 'All' ? props.entries : props.entries.filter((e) => e.dir === filter.value)
);

/**
 * Group consecutive messages of the same device into runs, newest run first.
 * Entries arrive oldest -> newest; walking them backwards yields runs in
 * newest-first order, and a device that appears again later in the stream
 * gets a fresh group instead of appending to its older one.
 */
const groups = computed(() => {
  const out: { device: string; entries: MonitorEntry[] }[] = [];
  let current: { device: string; entries: MonitorEntry[] } | null = null;
  for (let i = filtered.value.length - 1; i >= 0; i--) {
    const entry = filtered.value[i];
    if (!current || current.device !== entry.device) {
      current = { device: entry.device, entries: [] };
      out.push(current);
    }
    current.entries.push(entry);
  }
  return out;
});

/** Format a wall-clock timestamp as HH:MM:SS.mmm */
function time(wall: number): string {
  const d = new Date(wall);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Row of hex byte cells with fixed width so bytes align vertically. */
function hexCells(bytes: Uint8Array): string[] {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
}

const BYTES_PER_ROW = 16;

/** Split a message into rows of 16 bytes with an offset column. */
function rows(entry: MonitorEntry) {
  const cells = hexCells(entry.bytes);
  const out: { offset: string; cells: string[] }[] = [];
  for (let i = 0; i < cells.length; i += BYTES_PER_ROW) {
    out.push({
      offset: i.toString(16).padStart(4, '0'),
      cells: cells.slice(i, i + BYTES_PER_ROW),
    });
  }
  return out;
}

// Newest messages are rendered at the top - keep the list pinned there.
watch(
  () => props.entries.length,
  () => {
    if (autoScroll.value && listEl.value) {
      listEl.value.scrollTop = 0;
    }
  }
);
</script>

<template>
  <section class="card monitor-card">
    <div class="card-head">
      <h2>MIDI monitor</h2>
      <div class="row gap">
        <div class="seg">
          <button
            v-for="f in ['All', 'RX', 'TX'] as const"
            :key="f"
            :class="['seg-btn', { active: filter === f }]"
            @click="filter = f"
          >
            {{ f }}
          </button>
        </div>
        <label class="row small muted">
          <input v-model="autoScroll" type="checkbox" /> auto-scroll
        </label>
        <button class="btn btn-small" @click="$emit('clear')">Clear</button>
      </div>
    </div>

    <div ref="listEl" class="monitor-list mono">
      <p v-if="filtered.length === 0" class="muted empty">No MIDI traffic yet.</p>

      <section v-for="group in groups" :key="group.entries[0].id" class="device-group">
        <header class="group-head">
          <span class="group-name">{{ group.device }}</span>
          <span class="muted small">
            {{ group.entries.length }} messages · last at {{ time(group.entries[0].wall) }}
          </span>
        </header>

        <div v-for="entry in group.entries" :key="entry.id" class="msg">
          <div class="msg-head">
            <span :class="['tag', entry.dir === 'RX' ? 'tag-rx' : 'tag-tx']">{{ entry.dir }}</span>
            <span class="muted small">{{ time(entry.wall) }}</span>
            <span class="muted small">{{ entry.bytes.length }} bytes</span>
          </div>
          <div class="msg-body">
            <div v-for="row in rows(entry)" :key="row.offset" class="hex-row">
              <span class="hex-offset">{{ row.offset }}</span>
              <span v-for="(cell, i) in row.cells" :key="i" class="hex-cell">{{ cell }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
