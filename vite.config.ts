import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Served from GitHub Pages at https://<owner>.github.io/Repat-App/
  base: '/Repat-App/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        // The PDF renderer chunk is large; raise the precache limit so the
        // whole app is available offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Repatriation Documentation',
        short_name: 'Repat Docs',
        description: 'Offline repatriation documentation for medical escorts',
        theme_color: '#0f4c81',
        background_color: '#f4f6f9',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
