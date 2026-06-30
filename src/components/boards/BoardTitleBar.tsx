import { Sun, Moon, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { TitleBarFrame } from '@/components/TitleBarFrame'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'

/** Minimal title bar for the Board editor — tab strip + AI panel toggle + theme. */
export function BoardTitleBar(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const openTabs = useAppStore((s) => s.openTabs)

  const trailing = (
    <div className="title-bar__actions flex shrink-0 items-center gap-0.5 pl-1">
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
  )

  return (
    <TitleBarFrame trailing={openTabs.length > 0 ? trailing : undefined}>
      {openTabs.length > 0 ? (
        <DocumentTabBar />
      ) : (
        <div className="min-w-0 flex-1" />
      )}
    </TitleBarFrame>
  )
}
