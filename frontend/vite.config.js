import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API = process.env.VITE_API_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ask':    { target: API, changeOrigin: true },
      '/ingest': { target: API, changeOrigin: true },
      '/graph':  { target: API, changeOrigin: true },
      '/health': { target: API, changeOrigin: true },
      '/teams':  { target: API, changeOrigin: true },
    },
  },
})
