import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import { useAppStore } from '@/store/appStore'
import Dashboard from '@/components/dashboard/Dashboard'
import Editor from '@/components/editor/Editor'
import Welcome from '@/components/onboarding/Welcome'
import OllamaInstall from '@/components/onboarding/OllamaInstall'
import ModelDownload from '@/components/onboarding/ModelDownload'
import type { DownloadStatus, OllamaStatus } from '@/types'

type OnboardingStep = 'welcome' | 'ollama-install' | 'model-download'

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const currentDocumentId = useAppStore((s) => s.currentDocumentId)
  const setOllamaStatus = useAppStore((s) => s.setOllamaStatus)

  // null = still loading
  const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null)
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('welcome')

  useEffect(() => {
    async function checkSetup(): Promise<void> {
      const installed = await window.prose.ollama.checkInstalled()
      setOllamaInstalled(installed)
      if (installed) {
        const status = await window.prose.ollama.getDownloadStatus()
        setDownloadStatus(status as DownloadStatus)
      }
    }
    void checkSetup()
  }, [])

  // Poll Ollama status until ready or unavailable
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function poll(): Promise<void> {
      try {
        const status = (await window.prose.ai.getStatus()) as OllamaStatus
        if (!cancelled) {
          setOllamaStatus(status)
          if (status === 'loading') {
            timer = setTimeout(() => { void poll() }, 2000)
          }
        }
      } catch {
        if (!cancelled) setOllamaStatus('unavailable')
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [setOllamaStatus])

  // Still checking
  if (ollamaInstalled === null) {
    return <div className="flex h-screen items-center justify-center bg-background" />
  }

  // Ollama not installed — run install onboarding
  if (!ollamaInstalled) {
    if (onboardingStep === 'welcome') {
      return <Welcome onNext={() => setOnboardingStep('ollama-install')} />
    }
    if (onboardingStep === 'ollama-install') {
      return (
        <OllamaInstall
          onComplete={async () => {
            setOllamaInstalled(true)
            const status = await window.prose.ollama.getDownloadStatus()
            setDownloadStatus(status as DownloadStatus)
            setOnboardingStep('model-download')
          }}
        />
      )
    }
  }

  // Ollama installed but model not downloaded yet
  if (downloadStatus === null) {
    return <div className="flex h-screen items-center justify-center bg-background" />
  }

  if (!downloadStatus.downloaded) {
    if (onboardingStep === 'welcome') {
      return <Welcome onNext={() => setOnboardingStep('model-download')} />
    }
    return (
      <ModelDownload
        onComplete={() => setDownloadStatus({ ...downloadStatus, downloaded: true })}
      />
    )
  }

  return (
    <>
      {currentDocumentId ? (
        <Editor documentId={currentDocumentId} />
      ) : (
        <Dashboard />
      )}
      <Toaster theme={theme} richColors />
    </>
  )
}
