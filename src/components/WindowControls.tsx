import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

// ── Snap layout definitions ───────────────────────────────────────────────────

interface Zone { x: number; y: number; w: number; h: number; active: boolean }
interface SnapLayout { id: string; label: string; zones: Zone[] }

const T = 1 / 3
const Q = 1 / 4

const SNAP_LAYOUTS: SnapLayout[] = [
  // Row 1: halves + maximize
  { id: 'left-half',        label: 'Left half',       zones: [{ x: 0, y: 0, w: 0.5, h: 1, active: true  }, { x: 0.5, y: 0, w: 0.5,   h: 1, active: false }] },
  { id: 'right-half',       label: 'Right half',      zones: [{ x: 0, y: 0, w: 0.5, h: 1, active: false }, { x: 0.5, y: 0, w: 0.5,   h: 1, active: true  }] },
  { id: 'maximize',         label: 'Maximize',        zones: [{ x: 0, y: 0, w: 1,   h: 1, active: true  }] },
  // Row 2: two-thirds and center-half
  { id: 'left-two-thirds',  label: 'Left ⅔',          zones: [{ x: 0,     y: 0, w: T * 2, h: 1, active: true  }, { x: T * 2, y: 0, w: T,     h: 1, active: false }] },
  { id: 'center-half',      label: 'Center ½',        zones: [{ x: 0, y: 0, w: Q, h: 1, active: false }, { x: Q, y: 0, w: 0.5, h: 1, active: true }, { x: Q + 0.5, y: 0, w: Q, h: 1, active: false }] },
  { id: 'right-two-thirds', label: 'Right ⅔',         zones: [{ x: 0,     y: 0, w: T,     h: 1, active: false }, { x: T,     y: 0, w: T * 2, h: 1, active: true  }] },
  // Row 3: thirds
  { id: 'left-third',       label: 'Left ⅓',          zones: [{ x: 0,     y: 0, w: T, h: 1, active: true  }, { x: T,     y: 0, w: T, h: 1, active: false }, { x: T * 2, y: 0, w: T, h: 1, active: false }] },
  { id: 'center-third',     label: 'Center ⅓',        zones: [{ x: 0,     y: 0, w: T, h: 1, active: false }, { x: T,     y: 0, w: T, h: 1, active: true  }, { x: T * 2, y: 0, w: T, h: 1, active: false }] },
  { id: 'right-third',      label: 'Right ⅓',         zones: [{ x: 0,     y: 0, w: T, h: 1, active: false }, { x: T,     y: 0, w: T, h: 1, active: false }, { x: T * 2, y: 0, w: T, h: 1, active: true  }] },
]

function LayoutPreview({ zones }: { zones: Zone[] }): JSX.Element {
  const W = 44, H = 28, P = 3
  const iw = W - 2 * P, ih = H - 2 * P
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      {zones.map((z, i) => (
        <rect
          key={i}
          x={P + z.x * iw + 0.75}
          y={P + z.y * ih + 0.75}
          width={z.w * iw - 1.5}
          height={z.h * ih - 1.5}
          rx={1.5}
          fill={z.active ? 'hsl(var(--primary))' : 'currentColor'}
          fillOpacity={z.active ? 0.85 : 0.13}
        />
      ))}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/** Native-style window minimize / restore / close buttons for the custom title bar. */
export function WindowControls(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)
  const [showSnap, setShowSnap] = useState(false)

  useEffect(() => {
    void window.prose.win.isMaximized().then(setIsMaximized)
    const unsub = window.prose.win.subscribeMaximize(setIsMaximized)
    return unsub
  }, [])

  function handleSnapLayout(id: string): void {
    setShowSnap(false)
    void window.prose.win.setSnapLayout(id)
  }

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

      {/* Maximize / Restore — with snap layouts popup on hover */}
      <div
        className="relative flex items-stretch"
        onMouseEnter={() => setShowSnap(true)}
        onMouseLeave={() => setShowSnap(false)}
      >
        <button
          type="button"
          className={cn(btnBase)}
          onClick={() => isMaximized ? window.prose.win.unmaximize() : window.prose.win.maximize()}
          title={isMaximized ? 'Restore' : 'Maximize'}
          tabIndex={-1}
        >
          {isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="2.5" y="0.5" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
              <rect x="0.5" y="2.5" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.3" fill="hsl(var(--background))" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="0.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
          )}
        </button>

        {/* Snap layouts popup */}
        {showSnap && (
          <div className="absolute right-0 top-full z-[9999] mt-0.5 rounded-lg border border-border bg-popover p-2 shadow-xl">
            <div className="grid grid-cols-3 gap-1">
              {SNAP_LAYOUTS.map((layout) => (
                <button
                  key={layout.id}
                  title={layout.label}
                  className="rounded p-1 text-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => handleSnapLayout(layout.id)}
                >
                  <LayoutPreview zones={layout.zones} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
