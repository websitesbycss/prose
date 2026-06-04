import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

/** Native-style window minimize / restore / close buttons for the custom title bar. */
export function WindowControls(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    void window.prose.win.isMaximized().then(setIsMaximized)
    const unsub = window.prose.win.subscribeMaximize(setIsMaximized)
    return unsub
  }, [])

  const btnBase =
    'flex h-full items-center justify-center px-4 transition-colors outline-none ' +
    'text-foreground/50 hover:bg-muted/70 hover:text-foreground'

  return (
    <div className="flex shrink-0 items-stretch self-stretch">
      {/* Divider */}
      <div className="my-2 mx-1.5 w-px bg-border" />

      {/* Minimize */}
      <button
        type="button"
        className={cn(btnBase)}
        onClick={() => window.prose.win.minimize()}
        title="Minimize"
        tabIndex={-1}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>

      {/* Maximize / Restore */}
      <button
        type="button"
        className={cn(btnBase)}
        onClick={() => isMaximized ? window.prose.win.unmaximize() : window.prose.win.maximize()}
        title={isMaximized ? 'Restore' : 'Maximize'}
        tabIndex={-1}
      >
        {isMaximized ? (
          // Two overlapping squares: back square offset up-right, front square filled
          // to occlude the back square's bottom-left corner (standard Windows restore icon).
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            {/* Back square — top-right */}
            <rect x="2.5" y="0.5" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
            {/* Front square — bottom-left; fill occludes the back square's overlap area */}
            <rect x="0.5" y="2.5" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.3" fill="hsl(var(--background))" />
          </svg>
        ) : (
          // Single square — maximize
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="0.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
          </svg>
        )}
      </button>

      {/* Close */}
      <button
        type="button"
        className={cn(btnBase, 'win-close')}
        onClick={() => window.prose.win.close()}
        title="Close"
        tabIndex={-1}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
