import { useEffect, useState } from 'react'
import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { WindowControls } from '@/components/WindowControls'
import { useAppStore } from '@/store/appStore'
import type { Document } from '@/types'

interface TitleBarProps {
  document: Document | null
  onTitleChange: (title: string) => Promise<void>
}

export default function TitleBar({ document, onTitleChange }: TitleBarProps): JSX.Element {
  const updateDocumentTab = useAppStore((s) => s.updateDocumentTab)

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  useEffect(() => {
    if (document) {
      updateDocumentTab(document.id, { title: document.title, format: document.format })
    }
  }, [document?.id, document?.title, document?.format, updateDocumentTab])

  async function commitTitleEdit(): Promise<void> {
    setEditingTitle(false)
    if (draftTitle.trim() && draftTitle !== document?.title) {
      await onTitleChange(draftTitle.trim())
      if (document) {
        updateDocumentTab(document.id, { title: draftTitle.trim() })
      }
    }
  }

  return (
    <div className="title-bar flex h-10 shrink-0 items-center border-b border-border pl-3 text-foreground">
      <DocumentTabBar
        activeDocumentId={document?.id}
        editingTitle={editingTitle}
        draftTitle={draftTitle}
        onDraftTitleChange={setDraftTitle}
        onStartTitleEdit={() => { setDraftTitle(document?.title ?? ''); setEditingTitle(true) }}
        onCommitTitleEdit={() => void commitTitleEdit()}
        onCancelTitleEdit={() => setEditingTitle(false)}
      />
      <WindowControls />
    </div>
  )
}
