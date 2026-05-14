import { useState, useEffect, useRef, useCallback } from 'react'
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
    async (content: string): Promise<void> => {
      setSaveStatus('saving')
      try {
        await window.prose.documents.update(id, { content })
        setSaveStatus('saved')
        if (savedTimer.current) clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
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
      await persistContent(JSON.stringify(editor.getJSON()))
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
        console.error('Title save error:', err)
      }
    },
    [id]
  )

  const patchDocument = useCallback((updates: Partial<Document>): void => {
    setDocument((prev) => (prev ? { ...prev, ...updates } : null))
  }, [])

  return { document, saveStatus, saveNow, onEditorUpdate, updateTitle, patchDocument }
}
