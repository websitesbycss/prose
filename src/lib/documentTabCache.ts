import type { Document } from '@/types'

const documentCache = new Map<string, Document>()

export function getCachedDocument(id: string): Document | undefined {
  return documentCache.get(id)
}

export function setCachedDocument(doc: Document): void {
  documentCache.set(doc.id, doc)
}

export function removeCachedDocument(id: string): void {
  documentCache.delete(id)
}

/** Per-document editor scroll positions for instant tab restore. */
const scrollPositions = new Map<string, number>()

export function getDocumentScroll(id: string): number | undefined {
  return scrollPositions.get(id)
}

export function setDocumentScroll(id: string, scrollTop: number): void {
  scrollPositions.set(id, scrollTop)
}

export function clearDocumentScroll(id: string): void {
  scrollPositions.delete(id)
}
