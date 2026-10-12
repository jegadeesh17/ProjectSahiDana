import type { Config } from 'tailwindcss';

// Every token is a CSS custom property defined once in src/index.css.
// Tailwind only maps utility names onto those variables.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    borderRadius: {
      none: '0',
      DEFAULT: 'var(--r-control)',
      inner: 'var(--r-inner)',
      card: 'var(--r-card)',
      full: 'var(--r-pill)',
    },
    boxShadow: { none: 'none', card: 'var(--shadow-card)' },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      ground: 'var(--c-ground)',
      surface: 'var(--c-surface)',
      sunken: 'var(--c-sunken)',
      line: 'var(--c-line)',
      text: 'var(--c-text)',
      'text-2': 'var(--c-text-2)',
      accent: 'var(--c-accent)',
      'accent-ink': 'var(--c-accent-ink)',
      'accent-tint': 'var(--c-accent-tint)',
      warn: 'var(--c-warn)',
      danger: 'var(--c-danger)',
    },
    fontFamily: {
      sans: ['var(--font-sans)'],
    },
    fontSize: {
      xs: ['var(--fs-xs)', { lineHeight: '1.35' }],
      sm: ['var(--fs-sm)', { lineHeight: '1.4' }],
      base: ['var(--fs-base)', { lineHeight: '1.5' }],
      lg: ['var(--fs-lg)', { lineHeight: '1.3' }],
      xl: ['var(--fs-xl)', { lineHeight: '1.2' }],
      '2xl': ['var(--fs-2xl)', { lineHeight: '1.15' }],
      '3xl': ['var(--fs-3xl)', { lineHeight: '1.1' }],
    },
    extend: {
      screens: { lg: '1024px' },
      maxWidth: { page: '1280px' },
    },
  },
  plugins: [],
} satisfies Config;
