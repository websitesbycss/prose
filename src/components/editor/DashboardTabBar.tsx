import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { TitleBarFrame } from '@/components/TitleBarFrame'
import { useAppStore } from '@/store/appStore'

/** Title bar shown above the dashboard — always rendered so the frameless window is always draggable. */
export function DashboardTabBar(): JSX.Element {
  const openTabs = useAppStore((s) => s.openTabs)

  return (
    <TitleBarFrame>
      {openTabs.length > 0 ? (
        <DocumentTabBar />
      ) : (
        <div className="min-w-0 flex-1" />
      )}
    </TitleBarFrame>
  )
}
