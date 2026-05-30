/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand = emerald (Slate & Emerald theme). Used app-wide via `brand-*`.
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Dark neutral surfaces (sidebar, login, customer display) — slate family.
        ink: {
          950: '#080f1c',
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
        },
      },
      boxShadow: {
        xs: '0 1px 2px rgba(16,24,40,0.05)',
        card: '0 1px 2px rgba(16,24,40,0.04), 0 4px 16px -6px rgba(16,24,40,0.10)',
        pop: '0 12px 32px -10px rgba(16,24,40,0.22)',
        glow: '0 8px 24px -6px rgba(5,150,105,0.45)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        rise: 'rise .35s cubic-bezier(.16,1,.3,1) both',
        pop: 'pop .2s cubic-bezier(.16,1,.3,1) both',
        fade: 'fade .25s ease both',
      },
    },
  },
  plugins: [],
};
