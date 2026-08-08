import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { UpdateStatusPayload } from '@/types'

/**
 * Minimal bottom-left update prompt (Cursor-style). One toast box that walks
 * through the update lifecycle in place:
 *   available  — "Prose X.Y.Z is available."      Update / Remind me later / No thanks
 *   downloading — "Downloading Prose X.Y.Z…"       (no buttons, just status)
 *   downloaded — "Prose X.Y.Z will install on restart."  Restart to update / Later / No thanks
 * Nothing downloads until the user clicks Update — the silent startup check
 * only ever announces availability. If the app isn't open when a release goes
 * out, the next launch's startup check surfaces this same toast then.
 * Manual checks from Settings → About reuse the same pipeline but render
 * their status inline there, not here.
 */
export function UpdateToast(): JSX.Element {
  const [payload, setPayload] = useState<UpdateStatusPayload | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    const consider = (s: UpdateStatusPayload): void => {
      if (disposed) return
      if (s.state !== 'available' && s.state !== 'downloading' && s.state !== 'downloaded') return
      if (!s.version) return
      if (s.skippedVersion && s.skippedVersion === s.version) return
      setPayload(s)
    }

    // Catch a status that arrived before this component mounted
    void window.prose.updates.getState().then(consider).catch(() => {})
    const unsub = window.prose.updates.onStatus(consider)
    return () => { disposed = true; unsub() }
  }, [])

  const version = payload?.version ?? null
  const visible = payload !== null && version !== null && version !== dismissedVersion

  if (!visible || !payload || !version) {
    return <AnimatePresence>{null}</AnimatePresence>
  }

  const state = payload.state

  let title = ''
  let subtitle = ''
  if (state === 'available') {
    title = 'Update available'
    subtitle = `Prose ${version} is available.`
  } else if (state === 'downloading') {
    title = 'Downloading update'
    subtitle = `Getting Prose ${version}… ${payload.percent ?? 0}%`
  } else {
    title = 'Update ready'
    subtitle = `Prose ${version} will install on restart.`
  }

  return (
    <AnimatePresence>
      <motion.div
        key={version}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="fixed bottom-4 left-4 z-[200] w-[260px] rounded-lg border border-border bg-background p-3 shadow-lg"
      >
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>

        {state === 'downloading' ? (
          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${payload.percent ?? 0}%` }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>
        ) : (
          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (state === 'available') void window.prose.updates.startDownload()
                else void window.prose.updates.install()
              }}
            >
              {state === 'available' ? 'Update' : 'Restart to update'}
            </button>
            <button
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setDismissedVersion(version)}
            >
              {state === 'available' ? 'Remind me later' : 'Later'}
            </button>
            <button
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                void window.prose.updates.skipVersion(version)
                setDismissedVersion(version)
              }}
            >
              No thanks
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
