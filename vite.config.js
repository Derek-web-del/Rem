import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// scripts/dev.mjs sets VITE_PROXY_AUTH_PORT to match AUTH_SERVER_PORT (avoids EADDRINUSE).
const authProxyPort = process.env.VITE_PROXY_AUTH_PORT || '3001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'Frontend/dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'react-vendor'
          }
          if (id.includes('react-router')) {
            return 'react-router'
          }
          if (id.includes('better-auth') || id.includes('@better-auth')) {
            return 'better-auth'
          }
          return undefined
        },
      },
    },
  },
  server: {
    // `scripts/dev.mjs` picks a free port (5173+) and sets VITE_DEV_SERVER_PORT + BETTER_AUTH_URL.
    port: Number(process.env.VITE_DEV_SERVER_PORT || 5173),
    strictPort: String(process.env.VITE_STRICT_PORT || 'true').toLowerCase() !== 'false',
    // Allow ngrok tunnels (Better Auth infra “Connect your app” / public testing).
    // Without this, Vite blocks requests with “host is not allowed”.
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok.io',
    ],
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${authProxyPort}`,
        changeOrigin: true,
      },
      '/api/auth': {
        target: `http://127.0.0.1:${authProxyPort}`,
        changeOrigin: true,
      },
      '/uploads': {
        target: `http://127.0.0.1:${authProxyPort}`,
        changeOrigin: true,
      },
      '/subject-logos': {
        target: `http://127.0.0.1:${authProxyPort}`,
        changeOrigin: true,
      },
    },
  },
})
