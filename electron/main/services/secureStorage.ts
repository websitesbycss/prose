import { safeStorage } from 'electron'
import { getSetting, setSetting } from './settingsDb'

// Encrypts secrets (API keys) at rest using the OS's own credential store —
// Windows DPAPI, macOS Keychain, or Linux Secret Service/kwallet via
// safeStorage — so a key never sits in the sqlite settings file as plain
// text. safeStorage ties the ciphertext to the current OS user account, so
// it can only be decrypted on this machine, by this user.
//
// Falls back to storing the plain value (clearly tagged, never silently) if
// the OS provides no secure backend at all — better an honest fallback than
// a stored secret the app quietly treats as encrypted when it isn't.

const ENCRYPTED_PREFIX = 'enc:'
const PLAIN_PREFIX = 'plain:'

export function isSecureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Encrypts (when possible) and persists `value` under `key`. Pass '' to clear. */
export function storeSecret(key: string, value: string): void {
  if (!value) {
    setSetting(key, '')
    return
  }
  if (isSecureStorageAvailable()) {
    const encrypted = safeStorage.encryptString(value)
    setSetting(key, ENCRYPTED_PREFIX + encrypted.toString('base64'))
  } else {
    setSetting(key, PLAIN_PREFIX + value)
  }
}

/** Reads and decrypts the secret stored under `key`, or null if unset/unreadable. */
export function readSecret(key: string): string | null {
  const raw = getSetting(key)
  if (!raw) return null
  if (raw.startsWith(ENCRYPTED_PREFIX)) {
    try {
      const buf = Buffer.from(raw.slice(ENCRYPTED_PREFIX.length), 'base64')
      return safeStorage.decryptString(buf)
    } catch {
      return null // decryption key changed (different OS user/machine) — treat as unset
    }
  }
  if (raw.startsWith(PLAIN_PREFIX)) return raw.slice(PLAIN_PREFIX.length)
  return null
}

export function hasSecret(key: string): boolean {
  const raw = getSetting(key)
  return !!raw && (raw.startsWith(ENCRYPTED_PREFIX) ? raw.length > ENCRYPTED_PREFIX.length : raw.startsWith(PLAIN_PREFIX))
}

export function clearSecret(key: string): void {
  setSetting(key, '')
}
