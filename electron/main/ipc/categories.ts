import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'

interface CategoryRow {
  id: string
  name: string
  color: string
  created_at: string
}

interface CategoryOut {
  id: string
  name: string
  color: string
  createdAt: string
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function rowToCategory(row: CategoryRow): CategoryOut {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  }
}

export function registerCategoryHandlers(db: Database): void {
  ipcMain.handle('categories:getAll', (): CategoryOut[] => {
    const rows = db
      .prepare('SELECT * FROM categories ORDER BY name ASC')
      .all() as CategoryRow[]
    return rows.map(rowToCategory)
  })

  ipcMain.handle('categories:create', (_, data: unknown): CategoryOut => {
    if (!data || typeof data !== 'object') throw new Error('Invalid create payload')
    const d = data as Record<string, unknown>

    if (typeof d.name !== 'string' || !d.name.trim()) throw new Error('name is required')
    if (typeof d.color !== 'string' || !HEX_COLOR_RE.test(d.color))
      throw new Error('color must be a hex color string')

    const id = randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      'INSERT INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, d.name.trim(), d.color, now)

    return rowToCategory(
      db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow
    )
  })

  ipcMain.handle('categories:update', (_, id: unknown, data: unknown): CategoryOut => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid category id')
    if (!data || typeof data !== 'object') throw new Error('Invalid update payload')
    const d = data as Record<string, unknown>

    const existing = db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .get(id) as CategoryRow | undefined
    if (!existing) throw new Error('Category not found')

    const name =
      typeof d.name === 'string' && d.name.trim() ? d.name.trim() : existing.name
    const color =
      typeof d.color === 'string' && HEX_COLOR_RE.test(d.color) ? d.color : existing.color

    db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(name, color, id)

    return rowToCategory(
      db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow
    )
  })

  ipcMain.handle('categories:delete', (_, id: unknown): void => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid category id')
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  })
}
