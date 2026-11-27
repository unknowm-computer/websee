import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [vue()],
  // Avoid a dev-server reload when a worker first opens a selected local file.
  optimizeDeps: {
    include: ['mediainfo.js', 'libarchive.js/src/webworker/wasm-gen/libarchive.js'],
  },
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        background: fileURLToPath(new URL('./src/extension/background.ts', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 9999,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      buffer: 'buffer/',
      string_decoder: 'string_decoder/',
    },
  },
  test: {
    environment: 'node',
  },
})
