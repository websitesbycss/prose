import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export function extractWordCount(tiptapJson: string): number {
  try {
    const doc = JSON.parse(tiptapJson) as { content?: unknown[] }
    if (!doc.content) return 0
    const text = extractText(doc.content)
    return text.trim() ? text.trim().split(/\s+/).length : 0
  } catch {
    return 0
  }
}

function extractText(nodes: unknown[]): string {
  return nodes
    .map((node) => {
      const n = node as { type?: string; text?: string; content?: unknown[] }
      if (n.type === 'text') return n.text ?? ''
      if (n.content) return extractText(n.content)
      return ''
    })
    .join(' ')
}
