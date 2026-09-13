import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  // Public routes are emitted as HTML at build time; missing URLs must stay 404s.
  appType: command === 'serve' && !isPreview ? 'spa' : 'mpa',
  plugins: [react(), tailwindcss()],
}))
