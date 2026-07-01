import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'MF Lens',
        short_name: 'MF Lens',
        description: 'Mutual Fund Analytics Platform',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // Cache the app shell and external API responses
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mfapi\.in\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mfapi-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 600,
    // Hidden source maps: uploaded to Sentry but not publicly accessible.
    // Use 'hidden-source-map' in prod so Sentry can symbolicate crash reports
    // while the public URL returns 404 for the .map files.
    sourcemap: mode === 'production' ? 'hidden' : true,
    ssr: false,
    rollupOptions: {
      output: {
        // Fine-grained manual chunks reduce parse time and enable precise cache hits.
        // Each chunk is content-hashed — changing recharts won't bust react-vendor.
        manualChunks(id) {
          // React core — most stable, longest cache lifetime
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          // React Router — changes rarely
          if (id.includes('node_modules/react-router')) {
            return 'router';
          }
          // Recharts — large; isolated so chart pages don't bloat the initial bundle
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'charts';
          }
          // html2canvas — only used by export feature; keep separate
          if (id.includes('node_modules/html2canvas')) {
            return 'export';
          }
          // Data / cache layer
          if (id.includes('node_modules/idb-keyval') || id.includes('node_modules/axios')) {
            return 'data';
          }
          // Sentry — isolated in its own chunk so it never bloats the main entry.
          // The dynamic import in main.jsx controls WHEN it loads (after idle),
          // but the chunk boundary ensures the browser won't parse it on startup.
          if (id.includes('node_modules/@sentry') || id.includes('node_modules/@sentry-internal')) {
            return 'sentry';
          }
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    cssCodeSplit: false,
    target: 'esnext',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios'],
    exclude: ['@sentry/react'],
  },
}));
