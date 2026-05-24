import { vitePlugin as remix } from '@remix-run/dev';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ ssrBuild }) => {
  return {
    plugins: [
      remix({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
        },
      }),
      tsconfigPaths(),
    ],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: ssrBuild
          ? {}
          : {
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
  };
});
