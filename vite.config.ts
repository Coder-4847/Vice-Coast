import { defineConfig } from 'vite';

// Relative base works on GitHub Pages project sites (/vice-coast/) and locally.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
