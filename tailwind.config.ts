import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          50: '#effefb', 100: '#c8fff4', 200: '#91feea', 300: '#53f5dc',
          400: '#1fe0c8', 500: '#06a896', 600: '#047a70', 700: '#065f59',
          800: '#0a4c48', 900: '#0c3f3c',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
