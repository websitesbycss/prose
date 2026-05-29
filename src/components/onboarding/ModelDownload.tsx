import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, AlertCircle, Download } from 'lucide-react'
import type { DownloadProgress } from '@/types'
import { cn } from '@/lib/utils'

interface SuggestedModel {
  label: string
  description: string
  model: string
  size: string
}

const SUGGESTED_MODELS: SuggestedModel[] = [
  {
    label: '4 GB RAM or less',
    description: 'Fast, lightweight',
    model: 'llama3.2:3b',
    size: '~2 GB',
  },
  {
    label: '8 GB RAM',
    description: 'Balanced quality and speed',
    model: 'mistral:7b',
    size: '~4 GB',
  },
  {
    label: '16 GB RAM or more',
    description: 'Best writing quality',
    model: 'mistral:latest',
    size: '~4 GB',
  },
]

type Phase = 'pick' | 'confirm' | 'downloading' | 'done' | 'error'

interface ModelDownloadProps {
  onComplete: () => void
}

export default function ModelDownload({ onComplete }: ModelDownloadProps): JSX.Element {
  const [installedModels, setInstalledModels] = useState<string[]>([])
  const [selectedInstalled, setSelectedInstalled] = useState<string | null>(null)
  const [selectedSuggested, setSelectedSuggested] = useState(0)
  const [customModel, setCustomModel] = useState('')
  const [phase, setPhase] = useState<Phase>('pick')
  const [progress, setProgress] = useState(0)
  const [statusLabel, setStatusLabel] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    void window.prose.ollama.listModels().then((models) => {
      setInstalledModels(models)
      if (models.length > 0) setSelectedInstalled(models[0]!)
    })
  }, [])

  // The model that will actually be used/downloaded
  const activeModel: string = selectedInstalled
    ? selectedInstalled
    : customModel.trim()
      ? customModel.trim()
      : (SUGGESTED_MODELS[selectedSuggested]?.model ?? 'llama3.2:3b')

  const useInstalled = useCallback(async (): Promise<void> => {
    if (!selectedInstalled) return
    await window.prose.settings.set({ ollamaModel: selectedInstalled })
    onComplete()
  }, [selectedInstalled, onComplete])

  const startDownload = useCallback(async (): Promise<void> => {
    setPhase('downloading')
    setProgress(0)
    try {
      await window.prose.settings.set({ ollamaModel: activeModel })
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
  }, [activeModel, onComplete])

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
                {installedModels.length > 0
                  ? 'Use a model you already have, or download a new one.'
                  : 'Select based on how much RAM your computer has. This is a one-time download.'}
              </p>
            </div>

            {/* Already-installed models */}
            {installedModels.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Installed on this machine
                </p>
                {installedModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => { setSelectedInstalled(m); setCustomModel('') }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      selectedInstalled === m
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border/80 hover:bg-accent/40'
                    )}
                  >
                    <div className={cn(
                      'h-4 w-4 shrink-0 rounded-full border-2',
                      selectedInstalled === m ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    )} />
                    <span className="text-sm font-medium font-mono">{m}</span>
                  </button>
                ))}
                <Button
                  className="w-full"
                  onClick={() => void useInstalled()}
                  disabled={!selectedInstalled}
                >
                  Use {selectedInstalled ?? 'selected model'}
                </Button>
                <div className="relative my-1 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or download a different model</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
            )}

            {/* Suggested models to download */}
            <div className="flex flex-col gap-2">
              {installedModels.length === 0 && (
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Recommended
                </p>
              )}
              {SUGGESTED_MODELS.map((opt, i) => (
                <button
                  key={opt.label}
                  onClick={() => { setSelectedSuggested(i); setSelectedInstalled(null); setCustomModel('') }}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                    !selectedInstalled && !customModel.trim() && selectedSuggested === i
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border/80 hover:bg-accent/40'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2',
                    !selectedInstalled && !customModel.trim() && selectedSuggested === i
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40'
                  )} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                    <span className="text-xs text-muted-foreground/60 font-mono">
                      {opt.model} · {opt.size}
                    </span>
                  </div>
                </button>
              ))}

              {/* Custom model name */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  Or enter any model name from{' '}
                  <span className="font-mono">ollama.com/library</span>
                </p>
                <Input
                  className="h-9 font-mono text-sm"
                  placeholder="e.g. llama3.3, gemma3:12b, phi4…"
                  value={customModel}
                  onChange={(e) => {
                    setCustomModel(e.target.value)
                    if (e.target.value.trim()) setSelectedInstalled(null)
                  }}
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => setPhase('confirm')}
              disabled={!activeModel || (!!selectedInstalled)}
            >
              Continue
            </Button>
          </>
        )}

        {phase === 'confirm' && (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Ready to download</h2>
              <p className="text-sm text-muted-foreground">
                This will download <strong className="font-mono">{activeModel}</strong>. It only
                happens once — the model is stored locally and never leaves your machine.
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
              <h2 className="text-xl font-semibold">Downloading {activeModel}…</h2>
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
