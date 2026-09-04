<script setup lang="ts">
interface MonitorEntry {
  direction: 'IN' | 'OUT';
  timestamp: string;
  data: string;
}

const emit = defineEmits<{
  clear: [];
}>();

defineProps<{
  monitor: MonitorEntry[];
}>();

const directionLabel = (direction: 'IN' | 'OUT') => (direction === 'IN' ? 'RX' : 'TX');
</script>

<template>
  <section class="monitor">
    <h2>MIDI monitor</h2>
    <button type="button" @click="emit('clear')">Clear</button>
    <p v-if="monitor.length === 0">No MIDI messages yet.</p>
    <table class="monitor-table">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Direction</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(entry, index) in monitor"
          :key="index"
          :class="entry.direction === 'IN' ? 'incoming' : 'outgoing'"
        >
          <td>
            <time>{{ entry.timestamp }}</time>
          </td>
          <td>{{ directionLabel(entry.direction) }}</td>
          <td>
            <code>{{ entry.data }}</code>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.monitor-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.monitor-table th,
.monitor-table td {
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  text-align: left;
}
.monitor-table th {
  font-weight: 600;
  color: var(--text-secondary, #666);
}
.monitor-table tr.incoming {
  background-color: var(--outgoing-bg, #32cd32);
  color: white;
}
.monitor-table tr.outgoing {
  background-color: var(--incoming-bg, #1e90ff);
  color: white;
}
.monitor-table code {
  font-family: monospace;
  font-size: 0.875em;
}
</style>
