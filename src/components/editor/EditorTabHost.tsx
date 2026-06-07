import { useRef, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Editor from '@/components/editor/Editor'
import { SheetsEditor } from '@/components/sheets/SheetsEditor'
import { BoardEditor } from '@/components/boards/BoardEditor'
import { SlidesEditor } from '@/components/slides/SlidesEditor'
import { cn } from '@/lib/utils'
import type { FileType } from '@/types'

function FileTypePlaceholder({ fileType }: { fileType: FileType }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-border/60">
        <AlertCircle className="h-7 w-7 text-muted-foreground/30" />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">Unable to open {fileType} file</p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          This file could not be loaded. Try reopening it from the dashboard.
        </p>
      </div>
    </div>
  )
}

function HiddenTabPane({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col bg-background',
        !active && 'pointer-events-none invisible',
      )}
      aria-hidden={!active}
    >
      {children}
    </div>
  )
}

/**
 * Keeps sheet and board editors mounted while their tabs are open so switching
 * file types does not tear down heavy runtimes (FortuneSheet, Excalidraw).
 * Document tabs share one Editor instance — same as before.
 */
export function EditorTabHost(): JSX.Element | null {
  const openTabs = useAppStore((s) => s.openTabs)
  const activeDocumentId = useAppStore((s) => s.activeDocumentId)
  const showDashboard = useAppStore((s) => s.showDashboard)

  const lastDocumentIdRef = useRef<string | null>(null)

  if (showDashboard || !activeDocumentId) return null

  const activeTab = openTabs.find((t) => t.id === activeDocumentId) ?? null
  const activeFileType = activeTab?.fileType ?? 'document'

  const documentTabs = openTabs.filter((t) => (t.fileType ?? 'document') === 'document')
  const sheetTabs = openTabs.filter((t) => t.fileType === 'sheet')
  const boardTabs = openTabs.filter((t) => t.fileType === 'board')
  const slidesTabs = openTabs.filter((t) => t.fileType === 'slides')
  const otherTabs = openTabs.filter(
    (t) => t.fileType && t.fileType !== 'document' && t.fileType !== 'sheet' && t.fileType !== 'board' && t.fileType !== 'slides',
  )

  if (activeFileType === 'document') {
    lastDocumentIdRef.current = activeDocumentId
  }

  const editorDocumentId: string =
    activeFileType === 'document'
      ? activeDocumentId
      : (lastDocumentIdRef.current ?? documentTabs[0]?.id ?? activeDocumentId)

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {documentTabs.length > 0 && (
        <HiddenTabPane active={activeFileType === 'document'}>
          <ErrorBoundary label="Editor">
            <Editor documentId={editorDocumentId} />
          </ErrorBoundary>
        </HiddenTabPane>
      )}

      {sheetTabs.map((tab) => (
        <HiddenTabPane key={tab.id} active={tab.id === activeDocumentId}>
          <ErrorBoundary label="SheetsEditor">
            <SheetsEditor documentId={tab.id} />
          </ErrorBoundary>
        </HiddenTabPane>
      ))}

      {boardTabs.map((tab) => (
        <HiddenTabPane key={tab.id} active={tab.id === activeDocumentId}>
          <ErrorBoundary label="BoardEditor">
            <BoardEditor documentId={tab.id} />
          </ErrorBoundary>
        </HiddenTabPane>
      ))}

      {slidesTabs.map((tab) => (
        <HiddenTabPane key={tab.id} active={tab.id === activeDocumentId}>
          <ErrorBoundary label="SlidesEditor">
            <SlidesEditor documentId={tab.id} />
          </ErrorBoundary>
        </HiddenTabPane>
      ))}

      {otherTabs.map((tab) => (
        <HiddenTabPane key={tab.id} active={tab.id === activeDocumentId}>
          <ErrorBoundary label="FileEditor">
            <FileTypePlaceholder fileType={tab.fileType!} />
          </ErrorBoundary>
        </HiddenTabPane>
      ))}
    </div>
  )
}
