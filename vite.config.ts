import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

export default defineConfig({
  // Relative URLs also work at https://<owner>.github.io/<repository>/.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Local GGUF Chat',
        short_name: 'GGUF Chat',
        description: 'Private, offline chat with local GGUF models.',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm}'],
        // The llama.cpp runtime is intentionally cached for fully offline inference.
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024
      }
    })
  ],
  worker: { format: 'es' },
  // Keep local development equivalent to production: this unlocks
  // SharedArrayBuffer and wllama's multi-threaded CPU/WASM runtime.
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders }
});
