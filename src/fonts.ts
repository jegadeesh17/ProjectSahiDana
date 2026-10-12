// Self-hosted Noto Sans (Latin) + Noto Sans Devanagari, weights 400 and 600 only (ADR-0005).
// Vite emits the woff2 files into dist/assets and Workbox precaches them, so Devanagari renders offline.
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-600.css';
import '@fontsource/noto-sans-devanagari/devanagari-400.css';
import '@fontsource/noto-sans-devanagari/devanagari-600.css';
