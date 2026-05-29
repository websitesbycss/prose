import { ipcMain } from 'electron'

// nspell and dictionary-en-us use CommonJS; load them dynamically so the
// main process doesn't block startup while the dictionary file is parsed.
type NspellInstance = {
  correct(word: string): boolean
  suggest(word: string): string[]
  add(word: string): void
}

let checker: NspellInstance | null = null
let loadPromise: Promise<void> | null = null

function load(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nspell = require('nspell')
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dictionary = require('dictionary-en-us')
      dictionary((err: Error | null, dict: { aff: Buffer; dic: Buffer }) => {
        if (!err) checker = nspell(dict) as NspellInstance
        resolve()
      })
    } catch (e) {
      console.error('[spell] Failed to load dictionary:', e)
      resolve()
    }
  })
  return loadPromise
}

// Normalise a word for checking: strip punctuation, lowercase.
// Preserves internal apostrophes (don't → don't).
function normalise(word: string): string {
  return word.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '').toLowerCase()
}

export function registerSpellHandlers(): void {
  // Kick off dictionary load at registration time so it's ready when first needed.
  void load()

  ipcMain.handle('spell:check', async (_, word: unknown) => {
    if (typeof word !== 'string') return { correct: true, suggestions: [] }
    const clean = normalise(word)
    if (!clean || clean.length < 2) return { correct: true, suggestions: [] }
    await load()
    if (!checker) return { correct: true, suggestions: [] }
    const correct = checker.correct(clean)
    const suggestions = correct ? [] : checker.suggest(clean).slice(0, 5)
    return { correct, suggestions }
  })

  // Add a word to the in-memory user dictionary (survives the session, not persisted).
  ipcMain.handle('spell:addWord', (_, word: unknown) => {
    if (typeof word !== 'string' || !word.trim()) return
    checker?.add(normalise(word))
  })
}
