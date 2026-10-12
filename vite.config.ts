import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [react(), iwsdkDev({
    https: false,
    emulator: { device: 'metaQuest3', activation: 'localhost', injectOnBuild: false },
  })],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
});
