// TailAdmin Free React (MIT, v2.5 design tokens) ported to Tailwind v3
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecf3ff', 100: '#dde9ff', 200: '#c2d6ff', 300: '#9cb9ff',
          400: '#7592ff', 500: '#465fff', 600: '#3641f5', 700: '#2a31d8',
          800: '#252dae', 900: '#262e89', 950: '#161950',
        },
        gray: {
          25: '#fcfcfd', 50: '#f9fafb', 100: '#f2f4f7', 200: '#eaecf0',
          300: '#d0d5dd', 400: '#98a2b3', 500: '#667085', 600: '#475467',
          700: '#344054', 800: '#1d2939', 900: '#101828',
        },
        navy: { 700: '#1A3F73', 800: '#12305A', 900: '#0B1F3A' },
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        outfit: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'theme-xs': '0px 1px 2px 0px rgba(16, 24, 40, 0.05)',
        'theme-sm': '0px 1px 3px 0px rgba(16, 24, 40, 0.1), 0px 1px 2px 0px rgba(16, 24, 40, 0.06)',
        'theme-md': '0px 4px 8px -2px rgba(16, 24, 40, 0.1), 0px 2px 4px -2px rgba(16, 24, 40, 0.06)',
        'theme-lg': '0px 12px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)',
        'theme-xl': '0px 20px 24px -4px rgba(16, 24, 40, 0.08), 0px 8px 8px -4px rgba(16, 24, 40, 0.03)',
        'focus-ring': '0px 0px 0px 4px rgba(70, 95, 255, 0.12)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
