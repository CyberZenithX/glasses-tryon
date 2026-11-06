// Vite build config. The app is fully static: everything (code, WASM, model, HDR,
// glasses) is served from the same host, so it can be deployed to any static host.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js + MediaPipe make one ~1.5 MB (≈420 KB gzipped) bundle. That is
    // expected for a 3D + ML app and is cached after the first visit.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
