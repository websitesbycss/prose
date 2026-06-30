import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { TitleBarFrame } from '@/components/TitleBarFrame'

/**
 * Shared title bar for non-document editors (Sheets, Boards).
 * Shows only the tab strip and window controls — all action buttons
 * live in the respective editor's toolbar right section.
 */
export function FileEditorTitleBar(): JSX.Element {
  return (
    <TitleBarFrame>
      <DocumentTabBar />
    </TitleBarFrame>
  )
}
