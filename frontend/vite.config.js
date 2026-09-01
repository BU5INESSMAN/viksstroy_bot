import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  // update.sh exports APP_VERSION before the build; embed it into every
  // client audit event so a regression can be tied to an exact release.
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.APP_VERSION || 'dev'),
  },
  plugins: [
    react(),
    legacy({
      // Keep the installed app usable on older iPhones and Android WebViews.
      targets: ['iOS >= 11', 'Safari >= 11.1', 'Chrome >= 64', 'Android >= 7'],
    }),
  ],
})
