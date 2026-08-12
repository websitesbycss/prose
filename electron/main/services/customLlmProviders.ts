// Adapters for the opt-in "bring your own cloud API key" LLM feature
// (Settings > AI > Custom LLM). Mirrors the shape of OllamaManager's
// streamChat so ai.ts can swap between local Ollama and a cloud provider
// with minimal branching. Every function here is a thin, direct call to the
// provider's own API — no telemetry, no third-party relay, no bundled key.

export type CustomLlmProviderId = 'anthropic' | 'openai' | 'gemini' | 'custom'

export interface LlmModelInfo {
  id: string
  label: string
}

export interface CustomLlmConfig {
  provider: CustomLlmProviderId
  apiKey: string
  model: string
  baseUrl?: string | null
}

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

const TIMEOUT_LIST_MS = 10_000

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Sniffs image mime type from magic bytes — the base64 payloads flowing
 * through Prose's AI pipeline never carry a `data:` prefix (Ollama doesn't
 * need one), but Anthropic/OpenAI/Gemini all require an explicit media type. */
function sniffImageMime(base64: string): string {
  try {
    const buf = Buffer.from(base64.slice(0, 32), 'base64')
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
    if (buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF89a' || buf.toString('ascii', 0, 6) === 'GIF87a')) return 'image/gif'
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  } catch { /* fall through to default */ }
  return 'image/png'
}

/** Yields the payload of each `data: ...` line from an SSE response body — the
 * streaming format shared by Anthropic, OpenAI, Gemini (with alt=sse), and
 * OpenAI-compatible custom endpoints. */
async function* sseDataLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || !line.startsWith('data:')) continue
      yield line.slice(5).trim()
    }
  }
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.text()
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
      const msg = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message
      if (msg) return msg
    } catch { /* not JSON — fall through to raw body */ }
    return body.slice(0, 300)
  } catch {
    return ''
  }
}

/** Rethrows real errors surfaced inside an SSE JSON payload; swallows plain
 * malformed-JSON parse failures (a stray keep-alive line, a truncated chunk). */
function rethrowIfReal(err: unknown): void {
  if (err instanceof Error && !(err instanceof SyntaxError)) throw err
}

// ── Listing available models ─────────────────────────────────────────────────

export async function listModels(provider: CustomLlmProviderId, apiKey: string, baseUrl?: string | null): Promise<LlmModelInfo[]> {
  switch (provider) {
    case 'anthropic': return listAnthropicModels(apiKey)
    case 'openai': return listOpenAiModels(apiKey)
    case 'gemini': return listGeminiModels(apiKey)
    case 'custom': return listCustomModels(apiKey, baseUrl)
  }
}

async function listAnthropicModels(apiKey: string): Promise<LlmModelInfo[]> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(TIMEOUT_LIST_MS),
  })
  if (!res.ok) throw new Error((await readErrorDetail(res)) || `Anthropic returned ${res.status}`)
  const data = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> }
  return (data.data ?? []).map((m) => ({ id: m.id, label: m.display_name || m.id }))
}

async function listOpenAiModels(apiKey: string): Promise<LlmModelInfo[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_LIST_MS),
  })
  if (!res.ok) throw new Error((await readErrorDetail(res)) || `OpenAI returned ${res.status}`)
  const data = (await res.json()) as { data?: Array<{ id: string }> }
  // Filter out non-chat model families (embeddings, audio, image, moderation, legacy completion models).
  const EXCLUDE = /embedding|whisper|tts|dall-e|moderation|davinci|babbage|curie|ada-/i
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => !EXCLUDE.test(id))
    .sort((a, b) => b.localeCompare(a))
    .map((id) => ({ id, label: id }))
}

async function listGeminiModels(apiKey: string): Promise<LlmModelInfo[]> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(TIMEOUT_LIST_MS),
  })
  if (!res.ok) throw new Error((await readErrorDetail(res)) || `Gemini returned ${res.status}`)
  const data = (await res.json()) as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> }
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => {
      const id = m.name.replace(/^models\//, '')
      return { id, label: m.displayName || id }
    })
}

async function listCustomModels(apiKey: string, baseUrl?: string | null): Promise<LlmModelInfo[]> {
  if (!baseUrl?.trim()) return []
  const url = `${baseUrl.trim().replace(/\/+$/, '')}/models`
  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    signal: AbortSignal.timeout(TIMEOUT_LIST_MS),
  })
  if (!res.ok) throw new Error((await readErrorDetail(res)) || `Server returned ${res.status}`)
  const data = (await res.json()) as { data?: Array<{ id: string }> }
  return (data.data ?? []).map((m) => ({ id: m.id, label: m.id }))
}

// ── Streaming chat ────────────────────────────────────────────────────────────

export async function* streamCustomLlmChat(
  config: CustomLlmConfig,
  systemPrompt: string,
  messages: ChatTurn[],
  images?: string[],
): AsyncGenerator<string> {
  switch (config.provider) {
    case 'anthropic':
      yield* streamAnthropicChat(config, systemPrompt, messages, images)
      return
    case 'openai':
      yield* streamOpenAiCompatibleChat(config.apiKey, 'https://api.openai.com/v1/chat/completions', config.model, systemPrompt, messages, images)
      return
    case 'gemini':
      yield* streamGeminiChat(config, systemPrompt, messages, images)
      return
    case 'custom': {
      if (!config.baseUrl?.trim()) throw new Error('No base URL configured for the custom endpoint. Set one in Settings → AI.')
      const url = `${config.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
      yield* streamOpenAiCompatibleChat(config.apiKey, url, config.model, systemPrompt, messages, images)
      return
    }
  }
}

async function* streamAnthropicChat(
  config: CustomLlmConfig,
  systemPrompt: string,
  messages: ChatTurn[],
  images?: string[],
): AsyncGenerator<string> {
  const anthropicMessages = messages.map((m, i) => {
    if (images && images.length > 0 && i === messages.length - 1 && m.role === 'user') {
      return {
        role: m.role,
        content: [
          ...images.map((b64) => ({ type: 'image', source: { type: 'base64', media_type: sniffImageMime(b64), data: b64 } })),
          { type: 'text', text: m.content },
        ],
      }
    }
    return { role: m.role, content: m.content }
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.model, system: systemPrompt, max_tokens: 4096, stream: true, messages: anthropicMessages }),
  })
  if (!res.ok || !res.body) throw new Error((await readErrorDetail(res)) || `Claude API returned ${res.status}`)

  for await (const data of sseDataLines(res.body)) {
    try {
      const evt = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } }
      if (evt.type === 'error') throw new Error(evt.error?.message || 'Claude API returned an error.')
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) yield evt.delta.text
    } catch (err) {
      rethrowIfReal(err)
    }
  }
}

async function* streamOpenAiCompatibleChat(
  apiKey: string,
  url: string,
  model: string,
  systemPrompt: string,
  messages: ChatTurn[],
  images?: string[],
): AsyncGenerator<string> {
  const chatMessages = messages.map((m, i) => {
    if (images && images.length > 0 && i === messages.length - 1 && m.role === 'user') {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          ...images.map((b64) => ({ type: 'image_url', image_url: { url: `data:${sniffImageMime(b64)};base64,${b64}` } })),
        ],
      }
    }
    return { role: m.role, content: m.content }
  })

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: systemPrompt }, ...chatMessages] }),
  })
  if (!res.ok || !res.body) throw new Error((await readErrorDetail(res)) || `Request failed (${res.status})`)

  for await (const data of sseDataLines(res.body)) {
    if (data === '[DONE]') break
    try {
      const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; error?: { message?: string } }
      if (chunk.error?.message) throw new Error(chunk.error.message)
      const piece = chunk.choices?.[0]?.delta?.content
      if (piece) yield piece
    } catch (err) {
      rethrowIfReal(err)
    }
  }
}

async function* streamGeminiChat(
  config: CustomLlmConfig,
  systemPrompt: string,
  messages: ChatTurn[],
  images?: string[],
): AsyncGenerator<string> {
  const contents = messages.map((m, i) => {
    const parts: Array<Record<string, unknown>> = [{ text: m.content }]
    if (images && images.length > 0 && i === messages.length - 1 && m.role === 'user') {
      for (const b64 of images) parts.push({ inline_data: { mime_type: sniffImageMime(b64), data: b64 } })
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts }
  })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
    body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents }),
  })
  if (!res.ok || !res.body) throw new Error((await readErrorDetail(res)) || `Gemini API returned ${res.status}`)

  for await (const data of sseDataLines(res.body)) {
    try {
      const evt = JSON.parse(data) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } }
      if (evt.error?.message) throw new Error(evt.error.message)
      const text = evt.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
      if (text) yield text
    } catch (err) {
      rethrowIfReal(err)
    }
  }
}
