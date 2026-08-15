import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: '현장 측량 레벨 야장',
        short_name: '측량야장',
        description: '관로 터파기 측량 및 표준 고저 측량 레벨 야장 전문 모바일 앱',
        theme_color: '#12171A',
        background_color: '#0E1214',
        display: 'standalone',
        orientation: 'portrait',
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
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    host: true,
    watch: {
      ignored: ['**/android/**', '**/dist/**']
    }
  },
  preview: {
    port: 3000,
    host: true
  }
});
