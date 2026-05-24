import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  build: {
    chunkSizeWarningLimit: 600,
    sourcemap: false, // never expose source in production
    ssr: false,       // explicit: this is a pure client-side SPA
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'charts': ['recharts'],
          'export': ['html2canvas'],
          'db': ['idb-keyval', 'axios'],
          // Note: sentry is intentionally NOT here — it is dynamically imported
          // in main.jsx only when VITE_SENTRY_DSN is defined. Putting it in
          // manualChunks would cause the browser to pre-fetch it for ALL users.
        },
      },
    },
  },
});
