# SahiDana Deployment Runbook

Operational guide for building, verifying, deploying, and rolling back the SahiDana Progressive Web App (PWA) and its stateless `/api/llm` serverless proxy on Vercel, aligned with [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/SPEC.md`](SPEC.md).

---

## 1. Prerequisites

| Tool | Minimum Version | Verification Command | Purpose |
|---|---|---|---|
| Node.js | `20.0.0` | `node --version` | Vite build, Vitest, data compiler, Vercel Node runtime |
| npm | `10.0.0` | `npm --version` | Dependency and script runner |
| Playwright + Chromium | `1.45.0` | `npx playwright --version` | Offline/online E2E verification (`npx playwright install chromium`) |
| Vercel CLI | `37.0.0` | `npx vercel --version` | Preview and production deployments, rollbacks |
| Python (M3 eval only) | `3.11.0` | `python --version` | Independent SciPy HiGHS LP cross-check (`eval/`) |

---

## 2. Environment Variables

Configure the following environment variables in the Vercel project settings (**Settings → Environment Variables**) or via `npx vercel env add <NAME>`. Never commit `.env` or secret values to version control.

| Variable Name | Scope | Required | Default Behaviour When Unset | Purpose |
|---|---|---|---|---|
| `OPENROUTER_API_KEY` | Server (`api/llm.ts`) | Yes (from M2) | `/api/llm` returns structured `UPSTREAM_ERROR`; manual entry and deterministic template fallback remain active | Authenticates server-side requests to OpenRouter chat completions API. Never prefix with `VITE_`. |
| `OPENROUTER_MODEL` | Server (`api/llm.ts`) | Optional | `meta-llama/llama-3.3-70b-instruct:free` | Primary OpenRouter model identifier for `extract` and `explain` actions. |
| `OPENROUTER_FALLBACK_MODELS` | Server (`api/llm.ts`) | Optional | `google/gemma-3-27b-it:free,qwen/qwen-2.5-72b-instruct:free` | Comma-separated fallback models tried automatically on HTTP `429`, `5xx`, or upstream timeout. |
| `VITE_USE_MOCK_ADAPTER` | Client (`import.meta.env`) | Optional | `'false'` (live v1 data and browser LP solver) | Set to `'false'` in production so `src/services/rationService.ts` uses `liveAdapter` (`feeds.v1.json`, `breeds.v1.json`, `requirements.v1.json`, and `src/domain/solver.ts`). Set to `'true'` only for Phase 2 prototype fixture previews. |
| `VERCEL_TOKEN` | CLI / CI only | Optional | Interactive `npx vercel login` session | Personal access token for non-interactive Vercel CLI commands. |

---

## 3. Build and Local Verification

### 3.1 Compile and Validate Cited Data (`v1` JSON)

Whenever `data/feeds.csv`, `data/breeds.csv`, or `data/requirements.json` changes, recompile and validate the versioned JSON catalogs:

```bash
npm run compile:data
```

This generates `src/data/feeds.v1.json`, `src/data/breeds.v1.json`, and `src/data/requirements.v1.json`, enforcing NFC Devanagari normalization, vertical and price-reliability enums, breed cap priority rules, and ICAR/NDDB roughage minimum citation checks.

### 3.2 Production Build and PWA Precache Check

Run the TypeScript type-checker, Vite production bundler, and Workbox Service Worker generator:

```bash
npm run build
```

Verify the build output in `dist/`:
- `dist/sw.js` and `dist/workbox-*.js` are generated in `generateSW` mode (`registerType: 'autoUpdate'`, `skipWaiting: true`, `clientsClaim: true`, `cleanupOutdatedCaches: true`).
- `dist/assets/v1-data-*.js` and `dist/assets/index-*.js` are precached alongside `index.html`, `manifest.webmanifest`, `favicon.svg`, and `icons/*.png`.
- Self-hosted `@fontsource/noto-sans` and `@fontsource/noto-sans-devanagari` `.woff2` subsets (`latin-400`, `latin-600`, `devanagari-400`, `devanagari-600`) are emitted in `dist/assets/*.woff2` with total `.woff2` size `<= 300 KB` (~131 KB).

### 3.3 Pre-Deployment Test Suite

Run the fast unit/component test suite or the full unit + Playwright E2E suite before deploying:

```bash
# Fast unit & component suite (< 15s)
npm test

# E2E offline vertical-slice journey in headless Chromium
npx playwright test tests/e2e/ration-journey.spec.ts

# Full verification suite (Vitest + Playwright)
npm run test:full
```

---

## 4. Routing and Offline Architecture (`vercel.json` & `vite.config.ts`)

1. **Vercel rewrites (`vercel.json`):**
   - `/api/(.*)` routes to `/api/$1` (the stateless Node.js serverless function `api/llm.ts`).
   - `/((?!api/).*)` falls back to `/index.html` for the PWA application shell after static files in `dist/` are matched.
2. **Service Worker navigation boundary (`vite.config.ts`):**
   - Workbox precaches `**/*.{js,css,html,json,woff2,svg,png,webmanifest}`.
   - `navigateFallback: 'index.html'` with `navigateFallbackDenylist: [/^\/api\//]` ensures offline navigation loads the cached PWA shell while never intercepting `/api/*` requests.

---

## 5. Deployment Procedure (User-Executed)

> **Important:** Automated agents never deploy to remote or production environments. Execute the steps below manually when ready to publish.

### 5.1 Link Project (First Time Only)

```bash
npx vercel login
npx vercel link
```

### 5.2 Configure Production Environment Variables

```bash
npx vercel env add VITE_USE_MOCK_ADAPTER production
# Enter: false

npx vercel env add OPENROUTER_API_KEY production
# Enter your OpenRouter key when prompted

npx vercel env add OPENROUTER_MODEL production
# Enter primary model ID (e.g. meta-llama/llama-3.3-70b-instruct:free)

npx vercel env add OPENROUTER_FALLBACK_MODELS production
# Enter comma-separated fallback model IDs
```

### 5.3 Deploy a Preview Build

```bash
npx vercel
```

Inspect the preview URL generated by Vercel and verify both online and offline flows in browser DevTools.

### 5.4 Promote / Deploy to Production

```bash
npx vercel --prod
```

---

## 6. Rollback Procedure

If a production deployment introduces a regression:

1. **List recent deployments:**
   ```bash
   npx vercel ls
   ```
2. **Instant rollback to the previous known-good production deployment:**
   ```bash
   npx vercel rollback <previous-deployment-url-or-id>
   ```
   *(Alternatively, in the Vercel Dashboard, open **Deployments**, locate the last healthy production deployment, open its menu, and select **Instant Rollback**.)*
3. **Client Service Worker recovery:**
   Because `vite-plugin-pwa` is configured with `registerType: 'autoUpdate'`, `skipWaiting: true`, `clientsClaim: true`, and `cleanupOutdatedCaches: true`, connected clients automatically activate the rolled-back `sw.js` and purge outdated precache entries on their next online visit.
