import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// getBoundingClientRect()/getClientRects() are computed in Chromium BEFORE any
// ancestor's CSS `zoom` is applied, so a rect from inside a zoomed container
// (e.g. the document editor's page-zoom control) reports coordinates in that
// container's un-zoomed local space, not real viewport pixels — anything
// positioned with `position: fixed` off those raw numbers ends up increasingly
// offset the further the rect is from the zoom container's origin. Walk up
// from `startEl` for the nearest ancestor with an inline `style.zoom` and
// rescale the rect relative to that container's own (correct) viewport rect.
export function zoomCorrectedRect(
  startEl: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  let el: HTMLElement | null = startEl
  while (el) {
    const zoomStr = el.style.zoom
    if (zoomStr) {
      const zoom = parseFloat(zoomStr)
      if (!isNaN(zoom) && zoom !== 1) {
        const c = el.getBoundingClientRect()
        return {
          left: c.left + (rect.left - c.left) * zoom,
          top: c.top + (rect.top - c.top) * zoom,
          width: rect.width * zoom,
          height: rect.height * zoom,
        }
      }
    }
    el = el.parentElement
  }
  return rect
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

/** Extracts plain text from a document's stored TipTap/ProseMirror JSON (not HTML). */
export function extractPlainText(tiptapJson: string): string {
  try {
    const doc = JSON.parse(tiptapJson) as { content?: unknown[] }
    if (!doc.content) return ''
    return extractText(doc.content).trim()
  } catch {
    return ''
  }
}

function extractText(nodes: unknown[]): string {
  // Join inline siblings (all text nodes) with '' so character-level text nodes
  // from old markdown imports concatenate into real words rather than
  // "h e l l o" (which would count as 5 words instead of 1).
  const allInline = nodes.every((n) => (n as { type?: string }).type === 'text')
  return nodes
    .map((node) => {
      const n = node as { type?: string; text?: string; content?: unknown[] }
      if (n.type === 'text') return n.text ?? ''
      if (n.content) return extractText(n.content)
      return ''
    })
    .join(allInline ? '' : ' ')
}
