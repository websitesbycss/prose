import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import type { Editor } from '@tiptap/react'
import type { Document } from '@/types'
import { AUTO_SAVE_DEBOUNCE_MS } from '@/constants'

export type SaveStatus = 'idle' | 'saving' | 'saved'

interface UseDocumentReturn {
  document: Document | null
  saveStatus: SaveStatus
  saveNow: (editor: Editor) => Promise<void>
  onEditorUpdate: (editor: Editor) => void
  updateTitle: (title: string) => Promise<void>
  patchDocument: (updates: Partial<Document>) => void
  notifySaveStatus: (status: SaveStatus) => void
}

export function useDocument(id: string): UseDocumentReturn {
  const [document, setDocument] = useState<Document | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDocument(null)
    void window.prose.documents.getById(id).then((doc) => {
      setDocument(doc as Document | null)
    })
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [id])

  const persistContent = useCallback(
    async (content: string, options?: { forceSnapshot?: boolean; snapshotLabel?: string | null }): Promise<void> => {
      setSaveStatus('saving')
      try {
        await window.prose.documents.update(id, {
          content,
          ...(options?.forceSnapshot ? { forceSnapshot: true, snapshotLabel: options.snapshotLabel ?? 'manual' } : {}),
        })
        setSaveStatus('saved')
        if (savedTimer.current) clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
        if (options?.forceSnapshot) {
          window.dispatchEvent(new CustomEvent('prose-snapshot-created'))
        }
      } catch (err) {
        console.error('Auto-save error:', err)
        setSaveStatus('idle')
      }
    },
    [id]
  )

  const saveNow = useCallback(
    async (editor: Editor): Promise<void> => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      await persistContent(JSON.stringify(editor.getJSON()), { forceSnapshot: true, snapshotLabel: 'manual' })
    },
    [persistContent]
  )

  const onEditorUpdate = useCallback(
    (editor: Editor): void => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        void persistContent(JSON.stringify(editor.getJSON()))
      }, AUTO_SAVE_DEBOUNCE_MS)
    },
    [persistContent]
  )

  const updateTitle = useCallback(
    async (title: string): Promise<void> => {
      if (!title.trim()) return
      try {
        const updated = await window.prose.documents.update(id, { title: title.trim() })
        setDocument(updated as Document)
      } catch (err) {
        if ((err as Error).message?.includes('DUPLICATE_TITLE')) {
          toast.error('A document with that name already exists')
        } else {
          console.error('Title save error:', err)
        }
      }
    },
    [id]
  )

  const patchDocument = useCallback((updates: Partial<Document>): void => {
    setDocument((prev) => (prev ? { ...prev, ...updates } : null))
  }, [])

  const notifySaveStatus = useCallback((status: SaveStatus): void => {
    setSaveStatus(status)
    if (status === 'saved') {
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [])

  return { document, saveStatus, saveNow, onEditorUpdate, updateTitle, patchDocument, notifySaveStatus }
}
