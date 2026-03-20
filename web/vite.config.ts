import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 38593,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:38592',
        changeOrigin: true
      },
      '/media': {
        target: 'http://localhost:38592',
        changeOrigin: true
      }
    }
  }
})