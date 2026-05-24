import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  build: {
    chunkSizeWarningLimit: 600,
    sourcemap: false, // never expose source in production
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'charts': ['recharts'],
          'export': ['html2canvas'],
          'db': ['idb-keyval', 'axios'],
          'sentry': ['@sentry/react'],
        },
      },
    },
  },
});
