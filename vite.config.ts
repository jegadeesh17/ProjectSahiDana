/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Strip legacy .woff fallback URLs from @fontsource CSS so only .woff2 subsets (~131 KB total, <= 300 KB budget) are emitted. */
function woff2OnlyPlugin(): Plugin {
  return {
    name: 'sahidana-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('@fontsource') && id.endsWith('.css')) {
        return {
          code: code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, ''),
          map: null,
        };
      }
      return null;
    },
  };
}

// Workbox precaches js/css/html/json/woff2/svg/png/webmanifest so the v1 libraries, solver, and Devanagari fonts work offline.
export default defineConfig({
  plugins: [
    woff2OnlyPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.webmanifest is linked from index.html
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,woff2,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/data/') && id.endsWith('.v1.json')) {
            return 'v1-data';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
