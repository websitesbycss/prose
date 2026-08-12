import { useEffect, useState } from 'react'
import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { TitleBarFrame } from '@/components/TitleBarFrame'
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
    // Deliberately narrowed to the three fields that matter, not the whole
    // `document` object — depending on the object reference would re-run
    // this on every unrelated field change (content, margins, etc).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <TitleBarFrame>
      <DocumentTabBar
        activeDocumentId={document?.id}
        editingTitle={editingTitle}
        draftTitle={draftTitle}
        onDraftTitleChange={setDraftTitle}
        onStartTitleEdit={() => { setDraftTitle(document?.title ?? ''); setEditingTitle(true) }}
        onCommitTitleEdit={() => void commitTitleEdit()}
        onCancelTitleEdit={() => setEditingTitle(false)}
      />
    </TitleBarFrame>
  )
}
