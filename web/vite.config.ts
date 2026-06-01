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
  build: {
    // Split heavy, route-specific vendors into their own chunks so the POS /
    // customer-display / login shell (the PWA-installed surfaces) stay lean.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Only isolate the heavy, route-specific libs; let the rest (incl. the
          // React runtime) share one 'vendor' chunk to avoid circular splits.
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('xlsx') || id.includes('jszip')) return 'exporters';
          if (id.includes('html5-qrcode')) return 'scanner';
          if (id.includes('qrcode')) return 'qrcode';
          return 'vendor';
        },
      },
    },
  },
});
