import { defineConfig } from 'vite';

// A relative base works on GitHub Pages project sites (/Vice-Coast/) and locally,
// so asset URLs never 404 regardless of the repository name.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
