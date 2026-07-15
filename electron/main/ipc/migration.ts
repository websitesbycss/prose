import { ipcMain, BrowserWindow } from 'electron'
import { access, rename, mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { getSetting, setSetting } from '../services/settingsDb'
import { upsertIndex } from '../services/indexDb'
import {
  writeProseFile,
  sanitizeFilename,
  countWordsFromContent,
  PROSE_FILE_VERSION,
  getDocumentsFolder,
  ensureDocumentsFolderExists,
  type ProseFileDocument,
} from '../services/fileService'

// ── Migration state ──────────────────────────────────────────────────────────

export type MigrationStatus = 'not_needed' | 'needed' | 'running' | 'complete' | 'error'

export interface MigrationProgress {
  status: MigrationStatus
  current: number
  total: number
  label: string
}

let currentProgress: MigrationProgress = { status: 'not_needed', current: 0, total: 0, label: '' }

function broadcast(progress: MigrationProgress): void {
  currentProgress = progress
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('migration:progress', progress)
  })
}

// ── Startup check ─────────────────────────────────────────────────────────────

function isMigrationComplete(): boolean {
  return getSetting('migration_complete') === 'true'
}

async function oldDbPath(): Promise<string> {
  return join(app.getPath('userData'), 'prose.db')
}

async function oldDbExists(): Promise<boolean> {
  try { await access(await oldDbPath()); return true } catch { return false }
}

export async function checkAndRunMigration(): Promise<void> {
  if (isMigrationComplete()) {
    currentProgress = { status: 'complete', current: 0, total: 0, label: '' }
    return
  }

  if (!(await oldDbExists())) {
    setSetting('migration_complete', 'true')
    currentProgress = { status: 'complete', current: 0, total: 0, label: '' }
    return
  }

  currentProgress = { status: 'needed', current: 0, total: 0, label: 'Preparing…' }
  broadcast(currentProgress)

  // Start migration asynchronously so the window can display progress
  runMigration().catch((err) => {
    console.error('[migration] Failed:', err)
    broadcast({ status: 'error', current: 0, total: 0, label: 'Migration failed — check the dev console.' })
  })
}

// ── Core migration ────────────────────────────────────────────────────────────

async function filePath(title: string): Promise<string> {
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })
  const base = sanitizeFilename(title)
  const candidate = join(folder, `${base}.prose`)
  try { await access(candidate); return join(folder, `${base} (${randomUUID().slice(0, 8)}).prose`) }
  catch { return candidate }
}

async function runMigration(): Promise<void> {
  broadcast({ status: 'running', current: 0, total: 0, label: 'Opening existing database…' })
  await ensureDocumentsFolderExists()

  const Database = (await import('better-sqlite3')).default
  const dbPath = await oldDbPath()
  const oldDb = new Database(dbPath, { readonly: true })
  let migratedCount = 0

  try {
    // Settings → settings db
    const oldSettings = oldDb.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
    for (const row of oldSettings) setSetting(row.key, row.value)

    // Documents
    const docs = oldDb.prepare('SELECT * FROM documents ORDER BY created_at ASC').all() as Array<{
      id: string; title: string; content: string; format: string;
      word_count_goal: number | null; created_at: string; updated_at: string;
      header_content: string | null; footer_content: string | null
    }>

    broadcast({ status: 'running', current: 0, total: docs.length, label: `Migrating ${docs.length} document${docs.length !== 1 ? 's' : ''}…` })

    for (let i = 0; i < docs.length; i++) {
      const row = docs[i]!
      broadcast({ status: 'running', current: i, total: docs.length, label: `Migrating "${row.title}"…` })

      const citations = oldDb
        .prepare('SELECT * FROM citations WHERE document_id = ? ORDER BY created_at ASC')
        .all(row.id) as Array<{ id: string; type: string; fields: string; formatted: string; created_at: string }>

      const snapshots = oldDb
        .prepare('SELECT * FROM document_snapshots WHERE document_id = ? ORDER BY created_at ASC')
        .all(row.id) as Array<{ id: string; content: string; word_count: number; created_at: string; label: string | null }>

      const parseJson = (s: string, fb: unknown): unknown => { try { return JSON.parse(s) } catch { return fb } }

      const parsedContent = parseJson(row.content, { type: 'doc', content: [] })

      const doc: ProseFileDocument = {
        version: PROSE_FILE_VERSION,
        id: row.id,
        title: row.title,
        // This legacy DB predates sheets/boards/slides — every migrated row was a document.
        fileType: 'document',
        format: row.format,
        content: parsedContent,
        pageMargins: null,
        headerContent: row.header_content ? parseJson(row.header_content, null) : null,
        footerContent: row.footer_content ? parseJson(row.footer_content, null) : null,
        wordCountGoal: row.word_count_goal,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        citations: citations.map((c) => ({
          id: c.id,
          type: c.type,
          fields: parseJson(c.fields, {}) as Record<string, unknown>,
          formatted: parseJson(c.formatted, { mla: '', apa: '', chicago: '', ieee: '' }) as ProseFileDocument['citations'][0]['formatted'],
          createdAt: c.created_at,
        })),
        snapshots: snapshots.map((s) => ({
          id: s.id,
          content: parseJson(s.content, { type: 'doc', content: [] }),
          headerContent: null,
          footerContent: null,
          wordCount: s.word_count,
          createdAt: s.created_at,
          label: s.label,
        })),
      }

      const destPath = await filePath(row.title)
      await writeProseFile(destPath, doc)

      upsertIndex({
        id: row.id,
        title: row.title,
        file_path: destPath,
        format: row.format,
        word_count: countWordsFromContent(parsedContent),
        created_at: row.created_at,
        updated_at: row.updated_at,
        file_type: 'document',
      })

      migratedCount++
    }
  } finally {
    oldDb.close()
  }

  // Back up the old database
  const backupPath = join(app.getPath('userData'), 'prose.db.bak')
  try { await rename(dbPath, backupPath) } catch { /* best-effort */ }

  setSetting('migration_complete', 'true')
  broadcast({ status: 'complete', current: migratedCount, total: migratedCount, label: 'Migration complete.' })
}

// ── IPC ───────────────────────────────────────────────────────────────────────

export function registerMigrationHandlers(): void {
  ipcMain.handle('migration:getStatus', (): MigrationProgress => currentProgress)
}
