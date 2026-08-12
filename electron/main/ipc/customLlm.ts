import { ipcMain } from 'electron'
import { listModels, type CustomLlmProviderId } from '../services/customLlmProviders'
import { storeSecret, clearSecret, isSecureStorageAvailable } from '../services/secureStorage'

const VALID_PROVIDERS = new Set<CustomLlmProviderId>(['anthropic', 'openai', 'gemini', 'custom'])
const MAX_KEY_LEN = 512
const MAX_BASE_URL_LEN = 512

export const CUSTOM_LLM_API_KEY_SETTING = 'customLlmApiKey'

export function registerCustomLlmHandlers(): void {
  // Lists models for a provider using the API key the user just typed (not
  // necessarily saved yet) — this is also the de facto "test connection"
  // action: a bad key surfaces as a rejected promise the renderer can show.
  ipcMain.handle('customLlm:listModels', async (_, payload: unknown) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid request.')
    const p = payload as { provider?: string; apiKey?: string; baseUrl?: string }
    if (typeof p.provider !== 'string' || !VALID_PROVIDERS.has(p.provider as CustomLlmProviderId)) {
      throw new Error('Unknown provider.')
    }
    const apiKey = typeof p.apiKey === 'string' ? p.apiKey.trim() : ''
    if (p.provider !== 'custom' && !apiKey) throw new Error('Enter an API key first.')
    const baseUrl = typeof p.baseUrl === 'string' ? p.baseUrl.trim() : undefined
    return listModels(p.provider as CustomLlmProviderId, apiKey, baseUrl)
  })

  // The key transits the renderer→main IPC exactly once, at the moment the
  // user submits it (sandboxed, contextIsolated channel — same trust
  // boundary as every other IPC call in Prose). From here it is encrypted
  // with the OS's own credential store (see secureStorage.ts) and never
  // returned to the renderer again; settings:get only ever reports whether
  // a key is set, not its value.
  ipcMain.handle('customLlm:saveApiKey', (_, apiKey: unknown): { ok: boolean; encrypted: boolean } => {
    if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > MAX_KEY_LEN) {
      throw new Error('Invalid API key.')
    }
    storeSecret(CUSTOM_LLM_API_KEY_SETTING, apiKey.trim())
    return { ok: true, encrypted: isSecureStorageAvailable() }
  })

  ipcMain.handle('customLlm:clearApiKey', (): void => {
    clearSecret(CUSTOM_LLM_API_KEY_SETTING)
  })
}

export function validateBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_BASE_URL_LEN) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return trimmed
  } catch {
    return null
  }
}
