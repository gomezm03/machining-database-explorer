import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so the built site works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [preact()],
  // The project lives in OneDrive, whose sync layer drops file-change events: poll so edits always reach the dev server.
  server: { watch: { usePolling: true, interval: 250 } },
});
