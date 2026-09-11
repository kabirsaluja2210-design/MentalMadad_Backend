import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#08080c', 900: '#0d0d14', 800: '#15151f', 700: '#1e1e2b', 600: '#2a2a3a' },
        brand: { 400: '#8b7cff', 500: '#6d5cf6', 600: '#5843e0' },
        accent: { 400: '#ff7a59', 500: '#f45f38' },
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', 'Inter', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
