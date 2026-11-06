import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' so the built app works from any host or sub-folder (GitHub Pages, Netlify, Vercel)
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
})
