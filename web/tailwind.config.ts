import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#7e2674',
          purple2: '#a6398f',
          purpleDeep: '#2a0a27',
          lime: '#a6cd35',
          lime2: '#c3e05f',
        },
      },
      fontFamily: { sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
