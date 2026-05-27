import { useState, useEffect, useCallback } from 'react'
import { Toaster } from 'sonner'
import { useAppStore } from '@/store/appStore'
import { applyAccentColors, DEFAULT_LIGHT_ACCENT, DEFAULT_DARK_ACCENT } from '@/lib/accentColor'
import Dashboard from '@/components/dashboard/Dashboard'
import Editor from '@/components/editor/Editor'
import Welcome from '@/components/onboarding/Welcome'
import SaveLocation from '@/components/onboarding/SaveLocation'
import OllamaInstall from '@/components/onboarding/OllamaInstall'
import ModelDownload from '@/components/onboarding/ModelDownload'
import MigrationOverlay from '@/components/migration/MigrationOverlay'
import type { DownloadStatus, OllamaStatus, MigrationProgress } from '@/types'

type OnboardingStep = 'welcome' | 'save-location' | 'ollama-install' | 'model-download'

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const currentDocumentId = useAppStore((s) => s.currentDocumentId)
  const setCurrentDocumentId = useAppStore((s) => s.setCurrentDocumentId)
  const setOllamaStatus = useAppStore((s) => s.setOllamaStatus)

  // null = still checking
  const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null)
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('welcome')
  const [defaultFolder, setDefaultFolder] = useState('')

  // Migration: null = not yet checked, otherwise current status
  const [migrationStatus, setMigrationStatus] = useState<MigrationProgress['status'] | null>(null)
  const [migrationDone, setMigrationDone] = useState(false)

  useEffect(() => {
    void window.prose.settings.get().then((s) => {
      const appSettings = s as import('@/types').AppSettings
      applyAccentColors(
        appSettings.lightAccentColor ?? DEFAULT_LIGHT_ACCENT,
        appSettings.darkAccentColor  ?? DEFAULT_DARK_ACCENT,
      )
    })
  }, [])

  useEffect(() => {
    async function checkSetup(): Promise<void> {
      const installed = await window.prose.ollama.checkInstalled()
      setOllamaInstalled(installed)
      if (installed) {
        const status = await window.prose.ollama.getDownloadStatus()
        setDownloadStatus(status as DownloadStatus)
      }
      const info = await window.prose.documents.getStorageInfo()
      setDefaultFolder(info.folder)
    }
    void checkSetup()
  }, [])

  useEffect(() => {
    void window.prose.migration.getStatus().then((p) => {
      const s = (p as MigrationProgress).status
      setMigrationStatus(s)
      if (s === 'complete' || s === 'not_needed') setMigrationDone(true)
    })
  }, [])

  // Poll Ollama status until ready
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function poll(): Promise<void> {
      try {
        const status = (await window.prose.ai.getStatus()) as OllamaStatus
        if (!cancelled) {
          setOllamaStatus(status)
          if (status !== 'ready') {
            const delay = status === 'loading' ? 2000 : 5000
            timer = setTimeout(() => { void poll() }, delay)
          }
        }
      } catch {
        if (!cancelled) {
          setOllamaStatus('unavailable')
          timer = setTimeout(() => { void poll() }, 5000)
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [setOllamaStatus])

  // File association — double-click .prose file opens it
  useEffect(() => {
    const unsub = window.prose.app.onOpenFile(async (filePath) => {
      try {
        const doc = await window.prose.documents.openByPath(filePath)
        setCurrentDocumentId(doc.id)
      } catch (err) {
        console.error('Failed to open file:', filePath, err)
      }
    })
    return unsub
  }, [setCurrentDocumentId])

  const handleMigrationComplete = useCallback(() => setMigrationDone(true), [])

  // Still checking
  if (ollamaInstalled === null) {
    return <div className="flex h-screen items-center justify-center bg-background" />
  }

  const showMigration =
    !migrationDone &&
    migrationStatus !== null &&
    migrationStatus !== 'complete' &&
    migrationStatus !== 'not_needed'

  // Ollama not installed — onboarding
  if (!ollamaInstalled) {
    if (onboardingStep === 'welcome') {
      return (
        <>
          {showMigration && <MigrationOverlay onComplete={handleMigrationComplete} />}
          <Welcome onNext={() => setOnboardingStep('save-location')} />
        </>
      )
    }
    if (onboardingStep === 'save-location') {
      return (
        <SaveLocation
          defaultFolder={defaultFolder}
          onNext={() => setOnboardingStep('ollama-install')}
        />
      )
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

  if (downloadStatus === null) {
    return <div className="flex h-screen items-center justify-center bg-background" />
  }

  if (!downloadStatus.downloaded) {
    if (onboardingStep === 'welcome') {
      return (
        <>
          {showMigration && <MigrationOverlay onComplete={handleMigrationComplete} />}
          <Welcome onNext={() => setOnboardingStep('save-location')} />
        </>
      )
    }
    if (onboardingStep === 'save-location') {
      return (
        <SaveLocation
          defaultFolder={defaultFolder}
          onNext={() => setOnboardingStep('model-download')}
        />
      )
    }
    return (
      <ModelDownload
        onComplete={() => setDownloadStatus({ ...downloadStatus, downloaded: true })}
      />
    )
  }

  return (
    <>
      {showMigration && <MigrationOverlay onComplete={handleMigrationComplete} />}
      {currentDocumentId ? (
        <Editor documentId={currentDocumentId} />
      ) : (
        <Dashboard />
      )}
      <Toaster theme={theme} richColors position="bottom-right" offset={32} />
    </>
  )
}
