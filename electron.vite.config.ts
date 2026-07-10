import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        'src': resolve(__dirname, 'src'),
      },
    },
    plugins: [react()],
    optimizeDeps: {
      // Explicitly include Excalidraw so Vite pre-bundles it with esbuild.
      // This converts all its transitive CJS dependencies (es6-promise-pool,
      // png-chunks-*, lodash.*, roughjs, etc.) to ESM in one pass, avoiding
      // a cascade of "does not provide an export named 'default'" errors.
      include: ['@excalidraw/excalidraw'],
      // harper.js locates its WASM binary via `new URL('harper_wasm_bg.wasm',
      // import.meta.url)` — esbuild's dep pre-bundling doesn't understand that
      // Vite-specific asset-URL pattern and mis-resolves it, so in dev the
      // request falls through to index.html instead of the actual .wasm file
      // (surfaces as a WASM "magic word" CompileError). Excluding it from
      // pre-bundling lets Vite's dev server handle the URL natively.
      exclude: ['harper.js'],
    },
  },
})
