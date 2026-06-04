import { ipcMain, app } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

type NspellInstance = {
  correct(word: string): boolean
  suggest(word: string): string[]
  add(word: string): void
}

let checker: NspellInstance | null = null
let loadPromise: Promise<void> | null = null

// Per-document custom word lists — persisted to userData/spell-words.json
type WordStore = Record<string, string[]>
let wordStore: WordStore = {}
const STORE_PATH = path.join(app.getPath('userData'), 'spell-words.json')

async function loadStore(): Promise<void> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    wordStore = JSON.parse(raw) as WordStore
  } catch {
    wordStore = {}
  }
}

async function saveStore(): Promise<void> {
  try {
    await fs.writeFile(STORE_PATH, JSON.stringify(wordStore), 'utf-8')
  } catch (e) {
    console.error('[spell] Failed to save word store:', e)
  }
}

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

// Strip leading/trailing punctuation, preserve internal apostrophes.
function stripPunct(word: string): string {
  return word.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '')
}

// Check if a word is correct — tries the original case first (handles proper nouns
// like "Instagram"), then lowercased as a fallback for sentence-start capitalisation.
function isCorrect(raw: string): boolean {
  if (!checker) return true
  const original = stripPunct(raw)
  if (!original || original.length < 2) return true
  if (checker.correct(original)) return true
  const lower = original.toLowerCase()
  return lower !== original && checker.correct(lower)
}

function getSuggestions(raw: string): string[] {
  if (!checker) return []
  const original = stripPunct(raw)
  if (!original) return []
  // Get suggestions from lowercased form (nspell suggests based on lowercase)
  const sugs = checker.suggest(original.toLowerCase()).slice(0, 5)
  // Filter out suggestions that are merely a case variant of the original word
  return sugs.filter(s => s.toLowerCase() !== original.toLowerCase())
}

export function registerSpellHandlers(): void {
  void load()
  void loadStore()

  ipcMain.handle('spell:isReady', async () => {
    await load()
    return checker !== null
  })

  ipcMain.handle('spell:check', async (_, word: unknown) => {
    if (typeof word !== 'string') return { correct: true, suggestions: [] }
    const clean = stripPunct(word)
    if (!clean || clean.length < 2) return { correct: true, suggestions: [] }
    await load()
    const correct = isCorrect(word)
    return { correct, suggestions: correct ? [] : getSuggestions(word) }
  })

  ipcMain.handle('spell:checkBatch', async (_, words: unknown) => {
    if (!Array.isArray(words)) return {}
    await load()
    if (!checker) return {}
    const result: Record<string, { correct: boolean; suggestions: string[] }> = {}
    for (const word of words) {
      if (typeof word !== 'string') continue
      const clean = stripPunct(word)
      if (!clean || clean.length < 2) continue
      const correct = isCorrect(word)
      result[word] = { correct, suggestions: correct ? [] : getSuggestions(word) }
    }
    return result
  })

  // Get all custom words for a document
  ipcMain.handle('spell:getWords', (_, documentId: unknown): string[] => {
    if (typeof documentId !== 'string') return []
    return wordStore[documentId] ?? []
  })

  // Add a word to a document's custom list and persist it
  ipcMain.handle('spell:addWord', async (_, documentId: unknown, word: unknown): Promise<string[]> => {
    if (typeof documentId !== 'string' || typeof word !== 'string' || !word.trim()) return []
    const clean = stripPunct(word)
    if (!clean) return wordStore[documentId] ?? []
    if (!wordStore[documentId]) wordStore[documentId] = []
    if (!wordStore[documentId].includes(clean)) {
      wordStore[documentId].push(clean)
      await saveStore()
    }
    return wordStore[documentId]
  })

  // Remove a word from a document's custom list and persist it
  ipcMain.handle('spell:removeWord', async (_, documentId: unknown, word: unknown): Promise<string[]> => {
    if (typeof documentId !== 'string' || typeof word !== 'string') return []
    const list = wordStore[documentId]
    if (!list) return []
    wordStore[documentId] = list.filter(w => w.toLowerCase() !== word.toLowerCase())
    await saveStore()
    return wordStore[documentId]
  })
}
