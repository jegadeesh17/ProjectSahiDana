/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
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

/**
 * Local dev middleware for `POST /api/llm`: loads `.env` into `process.env`
 * and routes `/api/llm` requests to `api/llm.ts` with a Vercel-compatible `req`/`res` shim.
 */
function apiLlmDevPlugin(): Plugin {
  return {
    name: 'sahidana-api-llm-dev',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (pathname !== '/api/llm') {
          next();
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
          }
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          let parsedBody: unknown = rawBody;
          if (rawBody.trim().length > 0) {
            try {
              parsedBody = JSON.parse(rawBody);
            } catch {
              parsedBody = rawBody;
            }
          }

          const vercelReq = Object.assign(req, { body: parsedBody });
          const vercelRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return vercelRes;
            },
            json(payload: unknown) {
              if (!res.headersSent) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
              }
              res.end(JSON.stringify(payload));
              return vercelRes;
            },
          });

          const mod = await server.ssrLoadModule('/api/llm.ts');
          const handler = mod.default as (request: unknown, response: unknown) => Promise<void>;
          await handler(vercelReq, vercelRes);
        } catch (err) {
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: {
                  code: 'UPSTREAM_ERROR',
                  message: err instanceof Error ? err.message : 'Local /api/llm dev middleware failed.',
                },
              }),
            );
          }
        }
      });
    },
  };
}

// Workbox precaches js/css/html/json/woff2/svg/png/webmanifest so the v1 libraries, solver, and Devanagari fonts work offline.
export default defineConfig({
  plugins: [
    woff2OnlyPlugin(),
    apiLlmDevPlugin(),
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
