import { Sun, Moon, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { WindowControls } from '@/components/WindowControls'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'

/** Minimal title bar for the Sheet editor — tab strip + AI panel toggle + theme. */
export function SheetTitleBar(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
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

      <div className="flex shrink-0 items-center gap-0.5 pr-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', aiPanelOpen && 'bg-accent text-accent-foreground')}
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          title={aiPanelOpen ? 'Hide AI panel' : 'Show AI panel'}
          disabled={ollamaStatus === 'unavailable'}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <WindowControls />
    </div>
  )
}
