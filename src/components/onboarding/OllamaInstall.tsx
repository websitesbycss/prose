import { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import type { InstallProgress } from '@/types'
import { cn } from '@/lib/utils'

type Phase = 'installing' | 'done' | 'error'

interface OllamaInstallProps {
  onComplete: () => void
  /** npm run dev:onboarding — simulates the progress bar instead of really
   * downloading/running the ~150MB installer, so onboarding can be previewed
   * repeatedly without redownloading anything already on the machine. */
  mock?: boolean
  /** Rendered inside a Settings dialog instead of full-screen onboarding —
   * drops the fixed h-screen wrapper so it fits its container. */
  embedded?: boolean
}

export default function OllamaInstall({ onComplete, mock, embedded }: OllamaInstallProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('installing')
  const [progress, setProgress] = useState(0)
  const [statusLabel, setStatusLabel] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const startInstall = useCallback(async (): Promise<void> => {
    setPhase('installing')
    setProgress(0)

    if (mock) {
      setStatusLabel('Downloading Ollama…')
      await new Promise<void>((resolve) => {
        let pct = 0
        const timer = setInterval(() => {
          pct = Math.min(100, pct + 6 + Math.random() * 10)
          setProgress(Math.round(pct))
          if (pct >= 92) setStatusLabel('Installing…')
          if (pct >= 100) { clearInterval(timer); resolve() }
        }, 150)
      })
      setPhase('done')
      setTimeout(onComplete, 1200)
      return
    }

    const cleanup = window.prose.ollama.onInstallProgress((raw) => {
      const p = raw as InstallProgress
      if (p.percent === -1) {
        cleanup()
        setErrorMsg('Installation failed. Please install Ollama manually from ollama.com, then restart Prose.')
        setPhase('error')
        return
      }
      setProgress(p.percent)
      setStatusLabel(p.status ?? '')
      if (p.percent >= 100) {
        cleanup()
        setPhase('done')
        setTimeout(onComplete, 1200)
      }
    })

    try {
      await window.prose.ollama.installOllama()
    } catch (err) {
      cleanup()
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setPhase('error')
    }
  }, [onComplete, mock])

  // Starts automatically — the preceding screen (AiSetupChoice, or the
  // Settings "set up Ollama" CTA) is the confirmation step now. Guarded
  // against React StrictMode's dev double-invoke with a ref, not just an
  // empty dep array, so this never fires the real installer twice.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void startInstall()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const content = (
    <motion.div
      className={cn('flex flex-col gap-6', embedded ? 'w-full' : 'w-[480px]')}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {mock && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-center text-[11px] font-medium text-amber-600 dark:text-amber-400">
          🧪 Onboarding preview — simulated, nothing is really downloaded or installed
        </div>
      )}

      {phase === 'installing' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Installing Ollama…</h2>
            <p className="text-sm text-muted-foreground capitalize">
              {statusLabel || 'Starting…'}
            </p>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>

          <p className="text-right text-xs text-muted-foreground">{progress}%</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div>
            <p className="font-semibold">Ollama installed</p>
            <p className="text-sm text-muted-foreground">Setting up your AI model next…</p>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Installation failed</p>
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
            </div>
          </div>
          <Button onClick={() => void startInstall()}>Retry</Button>
        </div>
      )}
    </motion.div>
  )

  if (embedded) return content

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      {content}
    </div>
  )
}
