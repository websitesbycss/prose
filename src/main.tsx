import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/geist-sans'
import '@fontsource/geist-mono'
import './globals.css'
import 'katex/dist/katex.min.css'
import App from './App'

// Excalidraw self-hosted fonts — point to public/fonts/excalidraw/ so the app
// works offline.  Must be set before Excalidraw renders.
;(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = '/fonts/excalidraw'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
