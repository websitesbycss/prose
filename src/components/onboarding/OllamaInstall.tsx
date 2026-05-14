import { useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle, Download } from 'lucide-react'
import type { InstallProgress } from '@/types'

type Phase = 'confirm' | 'installing' | 'done' | 'error'

interface OllamaInstallProps {
  onComplete: () => void
}

export default function OllamaInstall({ onComplete }: OllamaInstallProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [progress, setProgress] = useState(0)
  const [statusLabel, setStatusLabel] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const startInstall = useCallback(async (): Promise<void> => {
    setPhase('installing')
    setProgress(0)

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
  }, [onComplete])

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <motion.div
        className="flex w-[480px] flex-col gap-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {phase === 'confirm' && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">One more thing</h2>
              <p className="text-sm text-muted-foreground">
                Prose uses Ollama to run AI models locally on your machine. It needs to be
                installed once — it's free, open-source, and nothing leaves your computer.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
              <p>• ~150 MB download from github.com/ollama/ollama</p>
              <p>• Installs to your user profile — no admin required</p>
              <p>• Runs as a background service while Prose is open</p>
            </div>

            <Button className="w-full" onClick={() => void startInstall()}>
              <Download className="mr-2 h-4 w-4" />
              Install Ollama
            </Button>
          </>
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
    </div>
  )
}
