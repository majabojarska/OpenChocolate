import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: true,
    // Component tests opt into a DOM environment per file via a
    // `// @vitest-environment happy-dom` docblock comment.
    env: {
      // MonitorView renders wall-clock timestamps with local-time getters;
      // pin to UTC so snapshots are identical on any machine/timezone.
      TZ: 'UTC',
    },
  },
});
