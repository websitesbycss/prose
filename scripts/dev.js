#!/usr/bin/env node
// Clears ELECTRON_RUN_AS_NODE so electron-vite starts Electron in app mode, not Node mode.
const { spawn } = require('child_process')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// `npm run dev:onboarding` passes --onboarding here, which forces the
// onboarding flow (Welcome -> SaveLocation -> OllamaInstall -> ModelDownload)
// to render every launch, with the install/download steps simulated instead
// of hitting the real Ollama installer or /api/pull. See App.tsx,
// OllamaInstall.tsx, and ModelDownload.tsx's `mock` handling.
if (process.argv.includes('--onboarding')) {
  env.PROSE_MOCK_ONBOARDING = '1'
}

// `npm run dev:simple` passes --no-ai here, which skips onboarding entirely
// and forces ai:getStatus to always report 'unavailable' (see ai.ts), and
// disables the controls in Settings > AI that would re-enable it. Lets you
// test the AI-unavailable state (greyed-out sparkle buttons, tooltips, the
// locked-out Settings controls) without actually removing Ollama or a
// custom LLM key from this machine.
if (process.argv.includes('--no-ai')) {
  env.PROSE_MOCK_NO_AI = '1'
}

const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', env, shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
