import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function injectCssAsStyleTag() {
  return {
    name: 'inject-css-as-style-tags',
    enforce: 'post',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html;
      const cssAsset = Object.values(ctx.bundle).find((asset) => asset.fileName.endsWith('.css'));
      if (cssAsset && 'source' in cssAsset) {
        const cleanHtml = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="[^"]*\.css"[^>]*>/gi, '');
        return cleanHtml.replace('</head>', `<style>${cssAsset.source}</style></head>`);
      }
      return html;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), injectCssAsStyleTag()],
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
        // Improve cache granularity: put CSS per-chunk instead of one monolithic file
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    // Disable cssCodeSplit to compile CSS into a single bundle for inlining
    cssCodeSplit: false,
    // Target modern browsers — reduces polyfill bloat
    target: 'esnext',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  // Optimise dev experience
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios'],
    exclude: ['@sentry/react'],
  },
}));
