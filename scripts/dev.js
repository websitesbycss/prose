#!/usr/bin/env node
// Clears ELECTRON_RUN_AS_NODE so electron-vite starts Electron in app mode, not Node mode.
const { spawn } = require('child_process')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', env, shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
