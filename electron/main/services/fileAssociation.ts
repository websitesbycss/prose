import { app } from 'electron'
import { execFileSync } from 'child_process'

function reg(...args: string[]): void {
  execFileSync('reg', args, { windowsHide: true, stdio: 'ignore' })
}

/**
 * Registers .prose → Prose.exe in HKCU so double-click works without an
 * admin-level installer. Only runs in packaged builds — in dev mode the exe
 * path is the Electron binary, which would produce a wrong association.
 */
export function registerFileAssociation(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return

  try {
    const exePath = app.getPath('exe')

    reg('add', 'HKCU\\Software\\Classes\\.prose', '/ve', '/d', 'ProseDocument', '/f')
    reg('add', 'HKCU\\Software\\Classes\\ProseDocument', '/ve', '/d', 'Prose Document', '/f')
    reg('add', 'HKCU\\Software\\Classes\\ProseDocument\\DefaultIcon', '/ve', '/d', `"${exePath}",0`, '/f')
    reg('add', 'HKCU\\Software\\Classes\\ProseDocument\\shell\\open\\command', '/ve', '/d', `"${exePath}" "%1"`, '/f')
  } catch (err) {
    console.error('Failed to register file association:', err)
  }
}
