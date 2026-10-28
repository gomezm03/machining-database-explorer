import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so the built site works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [preact()],
  // File-change events were missed on this machine (the dev server kept serving stale modules), so poll instead.
  server: { watch: { usePolling: true, interval: 250 } },
});
