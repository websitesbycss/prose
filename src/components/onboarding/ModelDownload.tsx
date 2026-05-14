import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle, Download } from 'lucide-react'
import type { DownloadProgress } from '@/types'
import { cn } from '@/lib/utils'

interface RamOption {
  label: string
  description: string
  model: string
  size: string
}

const RAM_OPTIONS: RamOption[] = [
  {
    label: '4 GB or less',
    description: 'Basic AI feedback, fast responses',
    model: 'llama3.2:3b',
    size: '~2 GB download',
  },
  {
    label: '8 GB',
    description: 'Best quality for writing tasks',
    model: 'mistral:7b',
    size: '~4 GB download',
  },
  {
    label: '16 GB or more',
    description: 'Best quality, runs comfortably',
    model: 'mistral:7b',
    size: '~4 GB download',
  },
]

type Phase = 'pick' | 'confirm' | 'downloading' | 'done' | 'error'

interface ModelDownloadProps {
  onComplete: () => void
}

export default function ModelDownload({ onComplete }: ModelDownloadProps): JSX.Element {
  const [selected, setSelected] = useState(0)
  const [phase, setPhase] = useState<Phase>('pick')
  const [progress, setProgress] = useState(0)
  const [statusLabel, setStatusLabel] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const option = RAM_OPTIONS[selected]

  const startDownload = useCallback(async (): Promise<void> => {
    setPhase('downloading')
    setProgress(0)

    try {
      await window.prose.settings.set({ ollamaModel: option.model })
    } catch (err) {
      console.error('Failed to save model setting:', err)
    }

    const cleanup = window.prose.ollama.onDownloadProgress((raw) => {
      const p = raw as DownloadProgress & { status?: string }
      if (p.percent === -1) {
        cleanup()
        setErrorMsg('Download failed. Check that Ollama is installed and try again.')
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
      await window.prose.ollama.startDownload()
    } catch (err) {
      cleanup()
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setPhase('error')
    }
  }, [option.model, onComplete])

  useEffect(() => {
    return () => {
      // cleanup handled inside startDownload via the returned unsubscribe fn
    }
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <motion.div
        className="flex w-[480px] flex-col gap-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {phase === 'pick' && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Choose your AI model</h2>
              <p className="text-sm text-muted-foreground">
                Select based on how much RAM your computer has. This is a one-time download.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {RAM_OPTIONS.map((opt, i) => (
                <button
                  key={opt.label}
                  onClick={() => setSelected(i)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                    selected === i
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border/80 hover:bg-accent/40'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2',
                      selected === i ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    )}
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                    <span className="text-xs text-muted-foreground/60">
                      {opt.model} · {opt.size}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <Button className="w-full" onClick={() => setPhase('confirm')}>
              Continue
            </Button>
          </>
        )}

        {phase === 'confirm' && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Ready to download</h2>
              <p className="text-sm text-muted-foreground">
                This downloads <strong>{option.model}</strong> ({option.size}). It only happens
                once — the model is stored locally and never leaves your machine.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPhase('pick')}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => void startDownload()}>
                <Download className="mr-2 h-4 w-4" />
                Download now
              </Button>
            </div>
          </>
        )}

        {phase === 'downloading' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Downloading {option.model}…</h2>
              <p className="text-sm text-muted-foreground capitalize">
                {statusLabel || 'Connecting…'}
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
              <p className="font-semibold">Model ready</p>
              <p className="text-sm text-muted-foreground">Taking you to your workspace…</p>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Download failed</p>
                <p className="text-xs text-muted-foreground">{errorMsg}</p>
              </div>
            </div>
            <Button onClick={() => void startDownload()}>Retry</Button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
