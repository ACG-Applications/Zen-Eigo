import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Zen-Eigo/', 
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Zen Eigo',
        short_name: 'ZenEigo',
        description: 'Tap-to-build English sentence practice for Japanese speakers.',
        theme_color: '#fdfdfd',
        background_color: '#fdfdfd',
        display: 'standalone',
        start_url: '/Zen-Eigo/',
        scope: '/Zen-Eigo/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})