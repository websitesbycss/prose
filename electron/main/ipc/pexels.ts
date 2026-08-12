import { ipcMain } from 'electron'
import { getSettingsDb } from '../services/settingsDb'
import { readSecret } from '../services/secureStorage'

// Pexels stock-photo search for AI-generated Slides — strictly opt-in (see
// Settings > Slides). Off by default, and even when the setting is on, this
// silently no-ops without a user-supplied API key rather than falling back
// to any bundled/shared key: a key embedded in a distributed open-source app
// is a guaranteed rate-limit/abuse target the moment the repo is public, and
// Pexels' own terms expect a key registered per application, not shared.

interface PexelsPhoto {
  photographer: string
  photographer_url: string
  src: { large: string }
}

function getPexelsSettings(): { enabled: boolean; apiKey: string | null } {
  const db = getSettingsDb()
  const row = (key: string): string | undefined =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value

  let enabled = false
  try { enabled = JSON.parse(row('slidesPexelsEnabled') ?? 'false') === true } catch { /* default false */ }
  // Encrypted-at-rest via secureStorage, with a fallback to the legacy plain
  // JSON value for anyone who saved a key before this field was encrypted.
  let apiKey = readSecret('slidesPexelsApiKey')
  if (!apiKey) {
    try {
      const parsed = JSON.parse(row('slidesPexelsApiKey') ?? 'null')
      apiKey = typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null
    } catch { apiKey = null }
  }
  return { enabled, apiKey }
}

export function registerPexelsHandlers(): void {
  // Returns { dataUrl, photographer, photographerUrl } for the query's top
  // result, or null if disabled, unconfigured, or the search/download fails
  // for any reason — same silent-fallback convention as generateSlideVisual,
  // a missing photo just means the caller falls back to another visual path.
  ipcMain.handle('slides:searchPexelsImage', async (_, query: unknown) => {
    if (typeof query !== 'string' || !query.trim()) return null
    const { enabled, apiKey } = getPexelsSettings()
    if (!enabled || !apiKey) return null

    try {
      const searchRes = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query.trim())}&per_page=1&orientation=landscape`,
        { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(8000) },
      )
      if (!searchRes.ok) return null
      const body = (await searchRes.json()) as { photos?: PexelsPhoto[] }
      const photo = body.photos?.[0]
      if (!photo?.src?.large) return null

      const imgRes = await fetch(photo.src.large, { signal: AbortSignal.timeout(15000) })
      if (!imgRes.ok) return null
      const buf = Buffer.from(await imgRes.arrayBuffer())
      const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'

      return {
        dataUrl: `data:${contentType};base64,${buf.toString('base64')}`,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
      }
    } catch {
      return null
    }
  })
}
