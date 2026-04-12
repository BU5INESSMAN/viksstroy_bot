import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: colors.blue[50],
          100: colors.blue[100],
          500: colors.blue[500],
          600: colors.blue[600],
          700: colors.blue[700],
        },
        success: {
          50: colors.emerald[50],
          500: colors.emerald[500],
          600: colors.emerald[600],
        },
        warning: {
          50: colors.amber[50],
          500: colors.amber[500],
          600: colors.amber[600],
        },
        danger: {
          50: colors.red[50],
          500: colors.red[500],
          600: colors.red[600],
        },
        info: {
          50: colors.indigo[50],
          500: colors.indigo[500],
          600: colors.indigo[600],
        },
      },
    },
  },
  plugins: [],
}