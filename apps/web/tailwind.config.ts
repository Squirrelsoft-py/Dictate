import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#FAFAF7',
          dark: '#1C1C1E',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          muted: '#6B6B6B',
          dark: '#FAFAF7',
          'dark-muted': '#A1A1A6',
        },
        accent: {
          DEFAULT: '#FF6B35',
          hover: '#E55A24',
          dark: '#FF7F4D',
        },
        border: {
          DEFAULT: '#E5E5E0',
          dark: '#2C2C2E',
        },
        card: {
          DEFAULT: '#FFFFFF',
          dark: '#2C2C2E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Source Serif Pro"', 'Georgia', 'serif'],
      },
      maxWidth: {
        reading: '720px',
      },
      borderRadius: {
        xl2: '0.875rem',
      },
    },
  },
  plugins: [],
};

export default config;