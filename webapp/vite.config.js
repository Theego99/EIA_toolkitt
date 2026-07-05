import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base path is '/' for local dev and set to '/EIA_toolkitt/' in CI (GitHub
// Pages serves the app from https://<user>.github.io/EIA_toolkitt/).
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
