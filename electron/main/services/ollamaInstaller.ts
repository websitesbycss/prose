import { net, BrowserWindow } from 'electron'
import { createWriteStream, existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync, spawn } from 'child_process'

const INSTALLER_URL =
  'https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe'

export function isOllamaInstalled(): boolean {
  const localAppData = process.env['LOCALAPPDATA'] ?? ''
  if (existsSync(join(localAppData, 'Programs', 'Ollama', 'ollama.exe'))) return true
  try {
    const result = spawnSync('where', ['ollama'], { timeout: 2000 })
    return result.status === 0
  } catch {
    return false
  }
}

function sendToRenderer(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) win.webContents.send(channel, data)
}

export async function downloadAndInstallOllama(): Promise<void> {
  const dest = join(tmpdir(), 'OllamaSetup.exe')

  // ── Download ──────────────────────────────────────────────────────────────
  sendToRenderer('ollama:install-progress', { percent: 0, status: 'Downloading Ollama…' })

  const response = await net.fetch(INSTALLER_URL)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  if (!response.body) throw new Error('No response body')

  const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10)
  const reader = response.body.getReader()
  const fileStream = createWriteStream(dest)

  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.length
    await new Promise<void>((resolve, reject) => {
      fileStream.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()))
    })
    const percent = contentLength
      ? Math.min(Math.round((received / contentLength) * 90), 90)
      : 0
    sendToRenderer('ollama:install-progress', { percent, status: 'Downloading Ollama…' })
  }
  await new Promise<void>((resolve, reject) => {
    fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
  })

  // ── Install ───────────────────────────────────────────────────────────────
  sendToRenderer('ollama:install-progress', { percent: 92, status: 'Installing…' })

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(dest, ['/S'], { detached: true, stdio: 'ignore' })
    proc.on('exit', (code) => {
      if (code === 0 || code === null) resolve()
      else reject(new Error(`Installer exited with code ${code}`))
    })
    proc.on('error', reject)
  })

  sendToRenderer('ollama:install-progress', { percent: 98, status: 'Starting Ollama…' })

  // Clean up installer (best-effort)
  unlink(dest).catch(() => { /* ignore */ })

  // Give Ollama a moment to start after installer launches it
  await new Promise<void>((r) => setTimeout(r, 2500))

  sendToRenderer('ollama:install-progress', { percent: 100, status: 'Done' })
}
