/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#1c1c1c',     // Slightly lighter dark gray for modules
        border: '#eb0000',      // Sentry red border for accents
        sentry: {
          red: '#cc0000',
          redHover: '#e60000',
          green: '#00ff33',
          dark: '#0d0d0d',      // Deepest background
          panel: '#222222',     // Module backgrounds
          textFaded: '#b0b0b0',
        }
      },
      fontFamily: {
        sentry: ['"Space Mono"', 'monospace', 'sans-serif'],
        display: ['"Inter"', 'sans-serif'],
      },
      backgroundImage: {
        'sentry-gradient': 'linear-gradient(to bottom, #d9ccb9 0%, #a3af9e 15%, #606d64 40%, #1a1e1b 80%, #0d0d0d 100%)',
      }
    },
  },
  plugins: [],
};
