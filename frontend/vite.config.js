/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app calls /api on its own origin and Vite forwards it to the backend, so
// it works the same locally, in docker-compose (API_PROXY_TARGET=http://backend:8000)
// and in GitHub Codespaces, where the browser can't reach the backend's localhost.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['.app.github.dev'],
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:8000'
    }
  }
})
