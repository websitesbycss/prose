import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { WindowControls } from '@/components/WindowControls'
import { useAppStore } from '@/store/appStore'

/** Title bar shown above the dashboard — always rendered so the frameless window is always draggable. */
export function DashboardTabBar(): JSX.Element {
  const openTabs = useAppStore((s) => s.openTabs)

  return (
    <div className="title-bar flex h-10 shrink-0 items-center border-b border-border pl-3 text-foreground">
      {openTabs.length > 0 ? (
        <>
          <DocumentTabBar />
          <div className="shrink-0" style={{ minWidth: '5rem' }} />
        </>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      <WindowControls />
    </div>
  )
}
