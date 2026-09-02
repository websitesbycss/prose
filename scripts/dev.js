#!/usr/bin/env node
// Clears ELECTRON_RUN_AS_NODE so electron-vite starts Electron in app mode, not Node mode.
const { spawn } = require('child_process')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// `npm run dev:onboarding` passes --onboarding here, which forces the
// onboarding flow (Welcome -> SaveLocation -> OllamaInstall -> ModelDownload)
// to render every launch, with the install/download steps simulated instead
// of hitting the real Ollama installer or /api/pull — see App.tsx,
// OllamaInstall.tsx, and ModelDownload.tsx's `mock` handling.
if (process.argv.includes('--onboarding')) {
  env.PROSE_MOCK_ONBOARDING = '1'
}

const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', env, shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
