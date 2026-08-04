import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      // Keep the installed app usable on older iPhones and Android WebViews.
      targets: ['iOS >= 11', 'Safari >= 11.1', 'Chrome >= 64', 'Android >= 7'],
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react'],
          'vendor-axios': ['axios'],
          'vendor-toast': ['react-hot-toast'],
        },
      },
    },
  },
})
