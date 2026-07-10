import { ChildProcess, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const OLLAMA_HOST = 'http://localhost:11434'
const STARTUP_TIMEOUT_MS = 20_000
const HEALTH_POLL_INTERVAL_MS = 500

export type OllamaStatus = 'ready' | 'loading' | 'unavailable'

export interface PullProgress {
  percent: number
  status: string
}

const CAPABILITIES_CACHE_TTL_MS = 60_000

export class OllamaManager {
  private proc: ChildProcess | null = null
  private status: OllamaStatus = 'loading'
  private capabilitiesCache = new Map<string, { caps: string[]; at: number }>()

  async start(): Promise<void> {
    if (await this.healthCheck()) {
      this.status = 'ready'
      return
    }

    const binary = this.resolveBinary()
    this.proc = spawn(binary, ['serve'], { stdio: 'ignore', detached: false })

    this.proc.on('error', () => {
      this.status = 'unavailable'
    })
    this.proc.on('exit', () => {
      this.proc = null
      if (this.status === 'ready') this.status = 'unavailable'
    })

    const ok = await this.waitForReady()
    this.status = ok ? 'ready' : 'unavailable'
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
  }

  getStatus(): OllamaStatus {
    return this.status
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3_000) })
      if (!res.ok) return []
      const data = (await res.json()) as { models: Array<{ name: string }> }
      return data.models.map((m) => m.name)
    } catch {
      return []
    }
  }

  async isModelDownloaded(model: string): Promise<boolean> {
    if (this.status !== 'ready') return false
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { models: Array<{ name: string }> }
      const base = model.split(':')[0]
      return data.models.some((m) => m.name === model || m.name.startsWith(base + ':'))
    } catch {
      return false
    }
  }

  /**
   * Whether `model` is currently resident in memory, per Ollama's /api/ps
   * (lists actively-loaded models, distinct from /api/tags' full downloaded
   * list). A model not in this list will incur a cold-load delay on its next
   * request — this lets callers show an honest "starting the model" state
   * instead of misrepresenting load time as generation time.
   */
  async isModelLoaded(model: string): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/ps`, { signal: AbortSignal.timeout(3_000) })
      if (!res.ok) return false
      const data = (await res.json()) as { models: Array<{ name: string }> }
      const base = model.split(':')[0]
      return data.models.some((m) => m.name === model || m.name.startsWith(base + ':'))
    } catch {
      return false
    }
  }

  /** Model capabilities per Ollama's /api/show (e.g. "completion", "vision", "tools"). Cached briefly per model. */
  async getModelCapabilities(model: string): Promise<string[]> {
    const cached = this.capabilitiesCache.get(model)
    if (cached && Date.now() - cached.at < CAPABILITIES_CACHE_TTL_MS) return cached.caps

    try {
      const res = await fetch(`${OLLAMA_HOST}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(3_000),
      })
      if (!res.ok) return []
      const data = (await res.json()) as { capabilities?: string[] }
      const caps = Array.isArray(data.capabilities) ? data.capabilities : []
      this.capabilitiesCache.set(model, { caps, at: Date.now() })
      return caps
    } catch {
      return []
    }
  }

  async *pull(model: string): AsyncGenerator<PullProgress> {
    const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
    })
    if (!res.ok) throw new Error(`Ollama pull failed: ${res.status}`)
    if (!res.body) throw new Error('No response body from Ollama pull')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line) as {
            status: string
            completed?: number
            total?: number
          }
          const percent =
            chunk.total && chunk.completed
              ? Math.round((chunk.completed / chunk.total) * 100)
              : chunk.status === 'success'
              ? 100
              : 0
          yield { percent, status: chunk.status }
        } catch {
          // malformed line — skip
        }
      }
    }
  }

  async *streamChat(
    model: string,
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    optionsOverride?: { temperature?: number; seed?: number },
    images?: string[],
  ): AsyncGenerator<string> {
    // Images (base64, no data: prefix) attach only to the last message in the
    // conversation — the current turn — mirroring Ollama's /api/chat contract.
    const chatMessages = messages.map((m, i) =>
      images && images.length > 0 && i === messages.length - 1
        ? { ...m, images }
        : m,
    )
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatMessages,
        ],
        stream: true,
        keep_alive: '10m',
        options: {
          num_predict: -1,
          num_ctx: 8192,
          temperature: 0.4,  // lower than default 0.8 — reduces mid-expression drift on math
          ...optionsOverride,
        },
      }),
    })
    if (!res.ok) {
      // Read the body to surface Ollama's own error message (e.g. model file not found)
      let detail = ''
      try {
        const body = await res.text()
        const parsed = JSON.parse(body) as { error?: string }
        detail = parsed.error ? `: ${parsed.error}` : ` — ${body.slice(0, 200)}`
      } catch { /* ignore parse errors */ }
      throw new Error(`Ollama chat failed (${res.status})${detail}`)
    }
    if (!res.body) throw new Error('No response body from Ollama chat')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line) as { message?: { content: string }; done?: boolean }
          if (chunk.message?.content) yield chunk.message.content
        } catch {
          // malformed line — skip
        }
      }
    }
  }

  private resolveBinary(): string {
    const bundledPath = join(
      app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
      'ollama',
      process.platform === 'win32' ? 'ollama.exe' : 'ollama'
    )
    return existsSync(bundledPath) ? bundledPath : 'ollama'
  }

  private async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
        signal: AbortSignal.timeout(2_000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private async waitForReady(): Promise<boolean> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS))
      if (await this.healthCheck()) return true
    }
    return false
  }
}

export const ollamaManager = new OllamaManager()
