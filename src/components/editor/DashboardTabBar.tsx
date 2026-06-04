import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { WindowControls } from '@/components/WindowControls'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'

/** Title bar shown above the dashboard — always rendered so the frameless window is always draggable. */
export function DashboardTabBar(): JSX.Element {
  const openTabs = useAppStore((s) => s.openTabs)
  const globalAiOpen = useAppStore((s) => s.globalAiOpen)
  const setGlobalAiOpen = useAppStore((s) => s.setGlobalAiOpen)

  return (
    <div className="title-bar flex h-10 shrink-0 items-center border-b border-border pl-3 text-foreground">
      {openTabs.length > 0 ? (
        <>
          <DocumentTabBar />
          {/* ~1 inch drag buffer between tab strip and global AI button */}
          <div className="shrink-0" style={{ minWidth: '5rem' }} />
        </>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      <Button
        variant="ghost"
        size="icon"
        className={cn('h-7 w-7 shrink-0 mr-1', globalAiOpen && 'bg-accent text-accent-foreground')}
        onClick={() => setGlobalAiOpen(!globalAiOpen)}
        title="Global AI chat (Ctrl+Shift+Space)"
      >
        <Bot className="h-3.5 w-3.5" />
      </Button>

      <WindowControls />
    </div>
  )
}
