import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite is the build tool that serves the app in development and bundles
// it for production. This config registers the React plugin which enables
// JSX/TSX support and fast refresh (changes appear instantly without a reload).
export default defineConfig({
  plugins: [react()],
})
