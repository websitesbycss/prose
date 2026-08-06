import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { UpdateStatusPayload } from '@/types'

/**
 * Minimal bottom-left update prompt (Cursor-style). Appears only once an
 * update has fully downloaded in the background:
 *   Restart to update — installs immediately
 *   Later             — dismisses until the next app launch
 *   No thanks         — never prompts again for this version
 * Manual checks from Settings → About reuse the same pipeline but render
 * their status inline there, not here.
 */
export function UpdateToast(): JSX.Element {
  const [version, setVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let disposed = false

    const consider = (s: UpdateStatusPayload): void => {
      if (disposed) return
      if (s.state !== 'downloaded' || !s.version) return
      if (s.skippedVersion && s.skippedVersion === s.version) return
      setVersion(s.version)
    }

    // Catch a download that finished before this component mounted
    void window.prose.updates.getState().then(consider).catch(() => {})
    const unsub = window.prose.updates.onStatus(consider)
    return () => { disposed = true; unsub() }
  }, [])

  const visible = version !== null && !dismissed

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed bottom-4 left-4 z-[200] w-[260px] rounded-lg border border-border bg-background p-3 shadow-lg"
        >
          <p className="text-xs font-medium text-foreground">Update ready</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Prose {version} will install on restart.
          </p>
          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              onClick={() => void window.prose.updates.install()}
            >
              Restart to update
            </button>
            <button
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setDismissed(true)}
            >
              Later
            </button>
            <button
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                if (version) void window.prose.updates.skipVersion(version)
                setDismissed(true)
              }}
            >
              No thanks
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
