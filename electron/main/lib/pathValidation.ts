import { existsSync, statSync } from 'fs'
import { isAbsolute, extname } from 'path'

export function validateFolderPath(folder: string): void {
  if (!folder || typeof folder !== 'string') throw new Error('Invalid folder path')
  if (!isAbsolute(folder)) throw new Error('Folder path must be absolute')
  if (folder.includes('..')) throw new Error('Path traversal not allowed')
}

export function validateImportFilePath(filePath: string, allowedExts: string[]): void {
  if (!filePath || typeof filePath !== 'string') throw new Error('Invalid file path')
  if (!isAbsolute(filePath)) throw new Error('File path must be absolute')
  if (filePath.includes('..')) throw new Error('Path traversal not allowed')
  if (!existsSync(filePath)) throw new Error('File not found')
  const stat = statSync(filePath)
  if (!stat.isFile()) throw new Error('Path is not a file')
  const ext = extname(filePath).toLowerCase()
  if (!allowedExts.includes(ext)) throw new Error(`Unsupported file type: ${ext}`)
}
