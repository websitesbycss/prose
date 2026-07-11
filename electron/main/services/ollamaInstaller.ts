import { net, BrowserWindow } from 'electron'
import { createWriteStream, existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'

const INSTALLER_URL =
  'https://github.com/ollama/ollama/releases/download/v0.6.5/OllamaSetup.exe'
const MIN_INSTALLER_BYTES = 50 * 1024 * 1024

export function isOllamaInstalled(): Promise<boolean> {
  const localAppData = process.env['LOCALAPPDATA'] ?? ''
  if (existsSync(join(localAppData, 'Programs', 'Ollama', 'ollama.exe'))) return Promise.resolve(true)

  // spawnSync blocks the main process's event loop — on a fresh machine
  // (Ollama not on PATH) `where` can take the full timeout, freezing the
  // entire app (including window paint) for up to 2s on every launch.
  // spawn + a manual timeout keeps this off the main thread.
  return new Promise<boolean>((resolve) => {
    let settled = false
    const child = spawn('where', ['ollama'])
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      resolve(false)
    }, 2000)
    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(code === 0)
    })
    child.on('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(false)
    })
  })
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
  // eslint-disable-next-line no-constant-condition -- reads until the stream reports done
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

  if (received < MIN_INSTALLER_BYTES) {
    await unlink(dest).catch(() => { /* ignore */ })
    throw new Error('Downloaded installer is unexpectedly small — aborting for safety')
  }

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
