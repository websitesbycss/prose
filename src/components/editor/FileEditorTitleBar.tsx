import { Sun, Moon, Sparkles, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { WindowControls } from '@/components/WindowControls'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'

/**
 * Shared title bar for non-document editors (Sheets, Boards).
 * Shows the tab strip, AI panel toggle, theme toggle, global AI button, and window controls.
 * Requires no props — reads all state from appStore.
 */
export function FileEditorTitleBar(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const globalAiOpen = useAppStore((s) => s.globalAiOpen)
  const setGlobalAiOpen = useAppStore((s) => s.setGlobalAiOpen)
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)

  return (
    <div className="title-bar flex h-10 shrink-0 items-center border-b border-border pl-3 text-foreground">
      <DocumentTabBar />
      {/* Spacer so buttons are never obscured by the drag region of the tab strip */}
      <div className="shrink-0" style={{ minWidth: '5rem' }} />

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

        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', globalAiOpen && 'bg-accent text-accent-foreground')}
          onClick={() => setGlobalAiOpen(!globalAiOpen)}
          title="Global AI chat (Ctrl+Shift+Space)"
        >
          <Bot className="h-3.5 w-3.5" />
        </Button>
      </div>

      <WindowControls />
    </div>
  )
}
