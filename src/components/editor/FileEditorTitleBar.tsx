import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { WindowControls } from '@/components/WindowControls'

/**
 * Shared title bar for non-document editors (Sheets, Boards).
 * Shows only the tab strip and window controls — all action buttons
 * live in the respective editor's toolbar right section.
 */
export function FileEditorTitleBar(): JSX.Element {
  return (
    <div className="title-bar flex h-10 shrink-0 items-center border-b border-border pl-3 text-foreground">
      <DocumentTabBar />
      <WindowControls />
    </div>
  )
}
