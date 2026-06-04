import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { useAppStore } from '@/store/appStore'

/** Tab bar shown above the dashboard when documents are open in the background. */
export function DashboardTabBar(): JSX.Element | null {
  const openTabs = useAppStore((s) => s.openTabs)
  if (openTabs.length === 0) return null

  return (
    <div className="flex h-11 shrink-0 items-end overflow-visible border-b border-border px-3">
      <DocumentTabBar />
    </div>
  )
}
