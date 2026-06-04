import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { MigrationProgress } from '@/types'

interface MigrationOverlayProps {
  onComplete: () => void
}

export default function MigrationOverlay({ onComplete }: MigrationOverlayProps): JSX.Element {
  const [progress, setProgress] = useState<MigrationProgress | null>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = []
    const scheduleComplete = (): void => {
      const t1 = setTimeout(() => {
        setVisible(false)
        const t2 = setTimeout(onComplete, 300)
        timeouts.push(t2)
      }, 800)
      timeouts.push(t1)
    }

    void window.prose.migration.getStatus().then((p) => {
      setProgress(p as MigrationProgress)
      if (p.status === 'complete') scheduleComplete()
    })

    const unsub = window.prose.migration.onProgress((p) => {
      setProgress(p as MigrationProgress)
      if ((p as MigrationProgress).status === 'complete') scheduleComplete()
    })
    return () => {
      unsub()
      for (const t of timeouts) clearTimeout(t)
    }
  }, [onComplete])

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="migration"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background text-foreground"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex flex-col items-center gap-5 text-center max-w-xs">
            <div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />

            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Updating your documents</p>
              <p className="text-xs text-muted-foreground">
                {progress?.label ?? 'Preparing…'}
              </p>
            </div>

            {pct !== null && (
              <div className="w-full max-w-[200px]">
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{pct}%</p>
              </div>
            )}

            {progress?.status === 'error' && (
              <p className="text-xs text-destructive">
                Migration failed. Check the developer console for details.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
