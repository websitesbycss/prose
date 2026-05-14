import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import { useAppStore } from '@/store/appStore'
import Dashboard from '@/components/dashboard/Dashboard'
import Editor from '@/components/editor/Editor'
import Welcome from '@/components/onboarding/Welcome'
import ModelDownload from '@/components/onboarding/ModelDownload'
import type { DownloadStatus, OllamaStatus } from '@/types'

type OnboardingStep = 'welcome' | 'download'

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const currentDocumentId = useAppStore((s) => s.currentDocumentId)
  const setOllamaStatus = useAppStore((s) => s.setOllamaStatus)

  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null)
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('welcome')

  useEffect(() => {
    void window.prose.ollama.getDownloadStatus().then((status) => {
      setDownloadStatus(status as DownloadStatus)
    })
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
        if (!cancelled) {
          setOllamaStatus('unavailable')
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [setOllamaStatus])

  // Loading state while we check download status
  if (!downloadStatus) {
    return <div className="flex h-screen items-center justify-center bg-background" />
  }

  // Onboarding — model not yet downloaded
  if (!downloadStatus.downloaded) {
    if (onboardingStep === 'welcome') {
      return <Welcome onNext={() => setOnboardingStep('download')} />
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
