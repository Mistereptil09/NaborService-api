// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => `/v1${path}`,
      },
      '/geo': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => `/v1${path}`,
      },
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => `/v1${path}`,
      },
      '/users': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => `/v1${path}`,
      },
    },
  },
})