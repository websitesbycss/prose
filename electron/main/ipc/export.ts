import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { exportToDocx, exportToPdf, exportToMarkdown, exportToPlainText } from '../services/exporter'

export function registerExportHandlers(db: Database.Database): void {
  ipcMain.handle('export:toDocx', async (_event, id: string) => {
    await exportToDocx(db, id)
  })

  ipcMain.handle('export:toPdf', async (_event, id: string) => {
    await exportToPdf(db, id)
  })

  ipcMain.handle('export:toMarkdown', async (_event, id: string) => {
    await exportToMarkdown(db, id)
  })

  ipcMain.handle('export:toPlainText', async (_event, id: string) => {
    await exportToPlainText(db, id)
  })
}
