/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* Logo: charcoal square + icy cyan wave */
        ink: {
          DEFAULT: '#0a0e14',
          soft: '#141c28',
          muted: '#1e293b',
          light: '#334155',
        },
        ice: {
          50: '#f4f9fd',
          100: '#e5f2fa',
          200: '#c5e4f7',
          300: '#94d0f0',
          400: '#5eb8e8',
          500: '#38a0d9',
          600: '#2586bd',
          700: '#1a6a9a',
          800: '#155578',
          900: '#124665',
        },
        primary: '#0a0e14',
        secondary: '#141c28',
        accent: '#5eb8e8',
        surface: '#0a0e14',
        surfaceLight: '#141c28',
        cream: '#f4f9fd',
        violet: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          400: '#a78bfa',
          500: '#8b5cf6',
          700: '#6d28d9',
          800: '#5b21b6',
        },
        lime: '#84cc16',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #0a0e14 0%, #141c28 50%, #1a3a52 100%)',
        'brand-gradient': 'linear-gradient(135deg, #0a0e14 0%, #141c28 48%, #1a3a52 100%)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(94, 184, 232, 0.18)',
        'glow-lg': '0 0 40px rgba(94, 184, 232, 0.22)',
        'card': '0 4px 6px -1px rgba(10, 14, 20, 0.12), 0 2px 4px -2px rgba(10, 14, 20, 0.08)',
        'card-hover': '0 20px 25px -5px rgba(10, 14, 20, 0.18), 0 8px 10px -6px rgba(10, 14, 20, 0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
