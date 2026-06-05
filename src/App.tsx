import { useState, useEffect, useCallback } from 'react'
import { Toaster } from 'sonner'
import { AlertCircle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { applyAccentColors, DEFAULT_LIGHT_ACCENT, DEFAULT_DARK_ACCENT } from '@/lib/accentColor'
import Dashboard from '@/components/dashboard/Dashboard'
import Editor from '@/components/editor/Editor'
import { GlobalNewDocumentModal } from '@/components/GlobalNewDocumentModal'
import { GlobalAiChat } from '@/components/GlobalAiChat'
import { DashboardTabBar } from '@/components/editor/DashboardTabBar'
import Welcome from '@/components/onboarding/Welcome'
import SaveLocation from '@/components/onboarding/SaveLocation'
import OllamaInstall from '@/components/onboarding/OllamaInstall'
import ModelDownload from '@/components/onboarding/ModelDownload'
import MigrationOverlay from '@/components/migration/MigrationOverlay'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SheetsEditor } from '@/components/sheets/SheetsEditor'
import { BoardEditor } from '@/components/boards/BoardEditor'
import type { DownloadStatus, OllamaStatus, MigrationProgress, FileType } from '@/types'

function FileTypePlaceholder({ fileType }: { fileType: FileType }): JSX.Element {
  const Icon = AlertCircle
  return (
    <div className="flex h-screen flex-col bg-background">
      <DashboardTabBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-border/60">
          <Icon className="h-7 w-7 text-muted-foreground/30" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">Unable to open {fileType} file</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            This file could not be loaded. Try reopening it from the dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}

type OnboardingStep = 'welcome' | 'save-location' | 'ollama-install' | 'model-download'

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const openTabs = useAppStore((s) => s.openTabs)
  const activeDocumentId = useAppStore((s) => s.activeDocumentId)
  const showDashboard = useAppStore((s) => s.showDashboard)
  const openDocumentTab = useAppStore((s) => s.openDocumentTab)
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
      const scale = appSettings.uiScale ?? 110
      document.documentElement.style.fontSize = `${scale}%`
      useAppStore.getState().setUiScale(scale)
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

  // When Ollama transitions to ready, re-check whether a model is now available.
  // On first launch the download-status check races against Ollama starting up,
  // so a user who already has a model installed might see the download screen
  // briefly until Ollama is ready and we can detect their installed models.
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  useEffect(() => {
    if (ollamaStatus === 'ready' && downloadStatus !== null && !downloadStatus.downloaded) {
      void window.prose.ollama.getDownloadStatus().then((s) => {
        setDownloadStatus(s as import('@/types').DownloadStatus)
      })
    }
  }, [ollamaStatus, downloadStatus])

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
        openDocumentTab({ id: doc.id, title: doc.title, format: doc.format })
      } catch (err) {
        console.error('Failed to open file:', filePath, err)
      }
    })
    return unsub
  }, [openDocumentTab])

  // Detached window: URL hash #open=DOC_ID → open that document immediately.
  useEffect(() => {
    const hash = window.location.hash.slice(1) // strip leading #
    if (!hash.startsWith('open=')) return
    const docId = decodeURIComponent(hash.slice(5))
    if (!docId) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    void window.prose.documents.getById(docId).then((doc) => {
      if (doc) openDocumentTab({ id: doc.id, title: doc.title, format: doc.format })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const activeTab = openTabs.find((t) => t.id === activeDocumentId) ?? null
  const inEditor = !showDashboard && activeDocumentId !== null && activeTab !== null
  const activeFileType = activeTab?.fileType ?? 'document'

  return (
    <>
      {showMigration && <MigrationOverlay onComplete={handleMigrationComplete} />}
      {inEditor ? (
        activeFileType === 'document' ? (
          <ErrorBoundary label="Editor">
            <Editor documentId={activeDocumentId!} />
          </ErrorBoundary>
        ) : activeFileType === 'sheet' ? (
          <ErrorBoundary label="SheetsEditor">
            <SheetsEditor documentId={activeDocumentId!} />
          </ErrorBoundary>
        ) : activeFileType === 'board' ? (
          <ErrorBoundary label="BoardEditor">
            <BoardEditor documentId={activeDocumentId!} />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary label="FileEditor">
            <FileTypePlaceholder fileType={activeFileType} />
          </ErrorBoundary>
        )
      ) : (
        <ErrorBoundary label="Dashboard">
          <div className="flex h-screen flex-col bg-background">
            <DashboardTabBar />
            <div className="min-h-0 flex-1">
              <Dashboard embedded={openTabs.length > 0} />
            </div>
          </div>
        </ErrorBoundary>
      )}
      <Toaster theme={theme} richColors position="bottom-right" offset={32} />
      <GlobalNewDocumentModal />
      <GlobalAiChat />
    </>
  )
}
