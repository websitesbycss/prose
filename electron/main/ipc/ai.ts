import { ipcMain, WebContents } from 'electron'
import type { Database } from 'better-sqlite3'
import type { OllamaManager } from '../services/ollama'

const SYSTEM_PROMPT = `You are a writing assistant embedded in an essay editor. You give concise, specific, actionable feedback. You never write the essay for the user. You respond in 2-4 sentences unless a longer response is clearly needed. You do not use bullet points unless the user explicitly asks for a list.`

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
