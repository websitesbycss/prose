import { motion } from 'motion/react'
import { BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingScreenProps {
  /** Optional status line under the wordmark (e.g. "Checking for AI model…"). */
  label?: string
  /** False to fill the parent's height instead of the full viewport — used when
   * a persistent chrome (e.g. the editor tab bar) stays mounted above this. */
  fullScreen?: boolean
}

/**
 * Branded loading state used for the gaps between the static boot splash
 * (index.html, before React mounts) and real content — startup checks in
 * App.tsx, and the Suspense fallback while a heavy editor chunk loads.
 * Visually matches #boot-splash in index.html so there's no jump on handoff.
 *
 * The icon mark is a placeholder — swap for the real Prose logo once it's
 * added to public/.
 */
export function LoadingScreen({ label, fullScreen = true }: LoadingScreenProps): JSX.Element {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-4 bg-background text-foreground',
      fullScreen ? 'h-screen' : 'h-full',
    )}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex flex-col items-center gap-4"
      >
        <motion.div
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"
          animate={{ scale: [1, 1.06, 1], opacity: [1, 0.85, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BookOpen className="h-7 w-7 text-primary" />
        </motion.div>
        <div className="text-[17px] font-semibold tracking-tight">Prose</div>
      </motion.div>

      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
          />
        ))}
      </div>

      {label && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.2 }}
          className="text-xs text-muted-foreground"
        >
          {label}
        </motion.p>
      )}
    </div>
  )
}
