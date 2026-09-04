<script setup lang="ts">
import { FOOTSWITCH_NAMES } from '../../lib/modes';
import type { ModeMeta } from '../../lib/modes';

defineProps<{
  meta: ModeMeta;
}>();
</script>

<template>
  <div class="actions-grid">
    <div v-for="(action, i) in meta.actions" :key="i" class="action-cell">
      <span class="sw">{{ FOOTSWITCH_NAMES[i] }}</span>
      {{ action }}
    </div>
  </div>
</template>
