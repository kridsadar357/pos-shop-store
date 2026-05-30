import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // NOTE: the customer-display WebSocket connects directly to the backend
    // (see wsUrl() in src/lib/display.ts), so it is intentionally NOT proxied
    // here — that avoids Vite's ws-proxy EPIPE noise entirely.
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
