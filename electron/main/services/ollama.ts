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

export class OllamaManager {
  private proc: ChildProcess | null = null
  private status: OllamaStatus = 'loading'

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
    userMessage: string
  ): AsyncGenerator<string> {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        keep_alive: '10m',
      }),
    })
    if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`)
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
