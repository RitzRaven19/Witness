import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// @meshtastic/core's bundled logger imports node builtins; shim them for the browser.
const nodeShim = fileURLToPath(new URL('./src/shims/node-builtins.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      os: nodeShim,
      path: nodeShim,
      util: nodeShim,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use injectManifest so we can write a custom SW with Background Sync
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Witness',
        short_name: 'Witness',
        description: 'Tamper-proof evidence capture for conflict zones',
        theme_color: '#0d0d0d',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,wasm}'],
        // Build the SW with the webworker tsconfig to avoid lib.dom conflicts
        buildPlugins: {
          vite: [{ name: 'sw-tsconfig', config: () => ({ build: { rollupOptions: {} } }) }],
        },
      },
    }),
  ],
});
