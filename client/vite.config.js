import { defineConfig } from 'vite'
import http from "https";
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: "https://tzu-chat-backend.vercel.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: false,
        agent: new http.Agent(),
      }
    }
  }
})
