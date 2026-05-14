import { ipcMain, WebContents } from 'electron'
import type { Database } from 'better-sqlite3'
import type { OllamaManager } from '../services/ollama'

const SYSTEM_PROMPT = `You are a writing assistant embedded in an essay editor. Give specific, actionable feedback grounded in the actual text — quote or paraphrase the relevant passage when it helps. Never rewrite the essay for the user; instead point to what needs changing and why. Keep responses tight: 2–3 sentences for simple requests, a short numbered list (3–5 items max) when the request calls for multiple points, a short paragraph when deeper analysis is warranted. No preamble, no "Great essay!", no filler.`

function buildUserMessage(
  documentContent: string,
  request: string,
  assignmentContext?: string
): string {
  const parts: string[] = [`Document content:\n${documentContent}`]
  if (assignmentContext?.trim()) {
    parts.push(`Assignment context:\n${assignmentContext.trim()}`)
  }
  parts.push(`User request:\n${request}`)
  return parts.join('\n\n')
}

function getModel(db: Database): string {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'ollamaModel'")
    .get() as { value: string } | undefined
  if (!row) return 'llama3.2:3b'
  try {
    return (JSON.parse(row.value) as string) || 'llama3.2:3b'
  } catch {
    return 'llama3.2:3b'
  }
}

export function registerAiHandlers(db: Database, manager: OllamaManager): void {
  ipcMain.handle('ai:getStatus', (): string => manager.getStatus())

  ipcMain.handle('ai:prompt', async (_, payload: unknown): Promise<string> => {
    if (!payload || typeof payload !== 'object') return ''
    const p = payload as { documentContent?: string; request?: string; assignmentContext?: string }
    if (!p.documentContent || !p.request) return ''

    const model = getModel(db)
    let result = ''
    try {
      for await (const chunk of manager.streamChat(
        model,
        SYSTEM_PROMPT,
        buildUserMessage(p.documentContent, p.request, p.assignmentContext)
      )) {
        result += chunk
      }
    } catch (err) {
      console.error('ai:prompt error:', err)
    }
    return result
  })

  ipcMain.handle('ai:streamPrompt', async (event, payload: unknown): Promise<void> => {
    if (!payload || typeof payload !== 'object') return
    const p = payload as { documentContent?: string; request?: string; assignmentContext?: string }
    if (!p.documentContent || !p.request) return

    const sender: WebContents = event.sender
    const model = getModel(db)
    try {
      for await (const chunk of manager.streamChat(
        model,
        SYSTEM_PROMPT,
        buildUserMessage(p.documentContent, p.request, p.assignmentContext)
      )) {
        if (sender.isDestroyed()) break
        sender.send('ai:stream-chunk', chunk)
      }
    } catch (err) {
      console.error('ai:streamPrompt error:', err)
    }
  })
}
