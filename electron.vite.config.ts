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
    // Explicitly include Excalidraw so Vite pre-bundles it with esbuild.
    // This converts all its transitive CJS dependencies (es6-promise-pool,
    // png-chunks-*, lodash.*, roughjs, etc.) to ESM in one pass, avoiding
    // a cascade of "does not provide an export named 'default'" errors.
    optimizeDeps: {
      include: ['@excalidraw/excalidraw'],
    },
  },
})
