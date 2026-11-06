// Vite build config. The app is fully static: everything (code, WASM, model, HDR,
// glasses) is served from the same host, so it can be deployed to any static host.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
