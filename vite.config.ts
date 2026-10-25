import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        // 3D 뷰어(three.js)는 code-split 돼 있는데, 서비스워커 사전캐싱이 다 쓸어가면
        // 3D를 한 번도 안 열어도 설치 직후 백그라운드로 받아가 버려 분리한 의미가 없다 —
        // 이 청크만 사전캐싱에서 빼고, 실제로 열 때 받아서 그 뒤로는 캐시로 쓴다.
        globIgnores: ['**/ThreeDViewModal-*.js'],
        runtimeCaching: [
          {
            urlPattern: /ThreeDViewModal-.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: '3d-viewer-chunk' }
          }
        ]
      },
      manifest: {
        name: '현장 측량 레벨 야장',
        short_name: '측량야장',
        description: '관로 터파기 측량 및 표준 고저 측량 레벨 야장 전문 모바일 앱',
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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
