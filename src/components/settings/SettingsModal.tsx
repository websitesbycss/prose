import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import { applyAccentColors, LIGHT_PRESETS, DARK_PRESETS, DEFAULT_LIGHT_ACCENT, DEFAULT_DARK_ACCENT } from '@/lib/accentColor'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import type { AppSettings, StorageInfo, PageMargins } from '@/types'
import { PAGE_MARGIN_MIN_IN, PAGE_MARGIN_MAX_IN } from '@/constants'
import { Palette, PenLine, Sparkles, Info, ExternalLink, HardDrive, FileText, X, Plus, LayoutTemplate } from 'lucide-react'

type Section = 'page' | 'slides' | 'appearance' | 'writing' | 'ai' | 'storage' | 'about'

const BASE_SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'writing', label: 'Writing', icon: PenLine },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'about', label: 'About', icon: Info },
]

const PAGE_SECTION = { id: 'page' as Section, label: 'Page', icon: FileText }
const SLIDES_SECTION = { id: 'slides' as Section, label: 'Slides', icon: LayoutTemplate }

const FONT_FAMILIES = ['Calibri', 'Times New Roman', 'Georgia', 'Arial', 'Courier New']
const FONT_SIZES = [10, 11, 12, 14, 16, 18, 24]
const FORMATS = [
  { value: 'none', label: 'None' },
  { value: 'mla', label: 'MLA' },
  { value: 'apa', label: 'APA' },
  { value: 'chicago', label: 'Chicago' },
  { value: 'ieee', label: 'IEEE' },
]

interface SettingsModalProps {
  open: boolean
  onClose(): void
  documentId?: string
  pageMargins?: PageMargins
  onPageMarginsChange?: (margins: PageMargins) => void
  onWordListChange?: (words: string[]) => void
  isSlides?: boolean
}

function SettingRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function SettingsModal({ open, onClose, documentId, pageMargins, onPageMarginsChange, onWordListChange, isSlides }: SettingsModalProps): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  const sections = isSlides
    ? [SLIDES_SECTION, ...BASE_SECTIONS]
    : documentId
    ? [PAGE_SECTION, ...BASE_SECTIONS]
    : BASE_SECTIONS
  const [section, setSection] = useState<Section>(() => isSlides ? 'slides' : documentId ? 'page' : 'appearance')

  useEffect(() => {
    if (open) setSection(isSlides ? 'slides' : documentId ? 'page' : 'appearance')
  }, [open, documentId, isSlides])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [changeFolderDialog, setChangeFolderDialog] = useState<{ newPath: string } | null>(null)
  const pickerLayerRef = useRef<HTMLDivElement>(null)

  // Per-document custom word list
  const [spellWords, setSpellWords] = useState<string[]>([])
  const [newWord, setNewWord] = useState('')

  useEffect(() => {
    if (!open) return
    void window.prose.settings.get().then((s) => setSettings(s as AppSettings))
    void window.prose.ollama.listModels().then(setModels)
    void window.prose.documents.getStorageInfo().then((info) => setStorageInfo(info as StorageInfo))
    if (documentId) {
      void window.prose.spell.getWords(documentId).then(setSpellWords)
    }
  }, [open, documentId])

  const setPomodoroState = useAppStore((s) => s.setPomodoroState)

  const save = useCallback(async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings((prev) => prev ? { ...prev, ...patch } : prev)
    if ('pomodoroWorkMinutes' in patch) {
      const { phase } = useAppStore.getState().pomodoroState
      if (phase === 'idle') {
        setPomodoroState({ timeRemaining: (patch.pomodoroWorkMinutes as number) * 60 })
      }
    }
    try {
      await window.prose.settings.set(patch as Record<string, unknown>)
    } catch (err) {
      console.error('Settings save error:', err)
    }
  }, [setPomodoroState])

  // Apply accent colors whenever either value changes; uses fresh state, no stale closures
  useEffect(() => {
    if (!settings) return
    applyAccentColors(
      settings.lightAccentColor ?? DEFAULT_LIGHT_ACCENT,
      settings.darkAccentColor  ?? DEFAULT_DARK_ACCENT,
    )
  }, [settings?.lightAccentColor, settings?.darkAccentColor])

  async function handlePickNewFolder(): Promise<void> {
    const picked = await window.prose.documents.pickFolder()
    if (picked) setChangeFolderDialog({ newPath: picked })
  }

  async function handleConfirmChangeFolder(moveFiles: boolean): Promise<void> {
    if (!changeFolderDialog) return
    setChangeFolderDialog(null)
    try {
      await window.prose.documents.changeFolder(changeFolderDialog.newPath, moveFiles)
      const info = await window.prose.documents.getStorageInfo()
      setStorageInfo(info as StorageInfo)
    } catch (err) {
      console.error('Change folder error:', err)
    }
  }

  if (!settings) return <></>

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex h-[640px] max-h-[90vh] w-[760px] max-w-[95vw] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="text-sm font-semibold">Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <nav className="flex w-[160px] shrink-0 flex-col gap-0.5 border-r border-border p-2">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                  section === id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="flex flex-col px-6 py-4">
              {section === 'page' && pageMargins && onPageMarginsChange && (
                <>
                  <SectionTitle>Page</SectionTitle>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Applies to this document only. Changes take effect immediately.
                  </p>
                  <PageMarginsEditor margins={pageMargins} onChange={onPageMarginsChange} />
                </>
              )}

              {section === 'slides' && settings && (
                <>
                  <SectionTitle>Slides</SectionTitle>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Settings for the Slides editor. Changes apply to all presentations.
                  </p>
                  <div className="mt-1 mb-1">
                    <SectionTitle>Snapping</SectionTitle>
                  </div>
                  <SettingRow
                    label="Enable snapping"
                    description="Smart guides and magnetic alignment while dragging and resizing"
                  >
                    <Switch
                      checked={settings.slidesSnapEnabled ?? true}
                      onCheckedChange={(v) => void save({ slidesSnapEnabled: v })}
                    />
                  </SettingRow>
                  <Separator />
                  <SettingRow
                    label="Snap to slide edges and center"
                    description="Align elements to the slide boundary and its center axes"
                  >
                    <Switch
                      checked={settings.slidesSnapToCanvas ?? true}
                      onCheckedChange={(v) => void save({ slidesSnapToCanvas: v })}
                      disabled={!(settings.slidesSnapEnabled ?? true)}
                    />
                  </SettingRow>
                  <Separator />
                  <SettingRow
                    label="Snap to other elements"
                    description="Align edges and centers of the dragged element to other elements on the slide"
                  >
                    <Switch
                      checked={settings.slidesSnapToElements ?? true}
                      onCheckedChange={(v) => void save({ slidesSnapToElements: v })}
                      disabled={!(settings.slidesSnapEnabled ?? true)}
                    />
                  </SettingRow>
                  <Separator />
                  <SettingRow
                    label="Equal spacing"
                    description="Snap to positions that equalize gaps between elements, with spacing indicators"
                  >
                    <Switch
                      checked={settings.slidesSnapEqualSpacing ?? true}
                      onCheckedChange={(v) => void save({ slidesSnapEqualSpacing: v })}
                      disabled={!(settings.slidesSnapEnabled ?? true)}
                    />
                  </SettingRow>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Hold <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">Alt</kbd> while dragging to temporarily disable snapping.
                  </p>
                </>
              )}

              {section === 'appearance' && (
                <>
                  <SectionTitle>Appearance</SectionTitle>
                  <SettingRow label="Theme">
                    <div className="flex rounded-md border border-border overflow-hidden">
                      {(['dark', 'light'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => { setTheme(t); void save({ theme: t }) }}
                          className={cn(
                            'px-3 py-1 text-xs capitalize transition-colors',
                            theme === t
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                  <Separator />
                  <AccentColorRow
                    label="Light mode accent"
                    presets={LIGHT_PRESETS}
                    value={settings.lightAccentColor ?? DEFAULT_LIGHT_ACCENT}
                    defaultValue={DEFAULT_LIGHT_ACCENT}
                    onChange={(v) => void save({ lightAccentColor: v })}
                    pickerLayer={pickerLayerRef}
                  />
                  <Separator />
                  <AccentColorRow
                    label="Dark mode accent"
                    presets={DARK_PRESETS}
                    value={settings.darkAccentColor ?? DEFAULT_DARK_ACCENT}
                    defaultValue={DEFAULT_DARK_ACCENT}
                    onChange={(v) => void save({ darkAccentColor: v })}
                    pickerLayer={pickerLayerRef}
                  />
                  <Separator />
                  <SettingRow label="Interface scale" description="Scales the app UI. Does not affect document content">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={75}
                        max={125}
                        step={5}
                        value={settings.uiScale ?? 110}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          useAppStore.getState().setUiScale(v)
                          void save({ uiScale: v })
                        }}
                        className="w-28 cursor-pointer accent-primary"
                      />
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {settings.uiScale ?? 110}%
                      </span>
                    </div>
                  </SettingRow>
                </>
              )}

              {section === 'writing' && (
                <>
                  <SectionTitle>Writing</SectionTitle>
                  <SettingRow label="Default font family">
                    <Select
                      value={settings.editorFontFamily}
                      onValueChange={(v) => void save({ editorFontFamily: v })}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_FAMILIES.map((f) => (
                          <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Default font size">
                    <Select
                      value={String(settings.editorFontSize)}
                      onValueChange={(v) => void save({ editorFontSize: parseInt(v) })}
                    >
                      <SelectTrigger className="h-8 w-20 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_SIZES.map((s) => (
                          <SelectItem key={s} value={String(s)} className="text-xs">{s}pt</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Default format">
                    <Select
                      value={settings.defaultFormat}
                      onValueChange={(v) => void save({ defaultFormat: v as AppSettings['defaultFormat'] })}
                    >
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMATS.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <Separator />
                  <SettingRow
                    label="Exclude header from word count"
                    description="MLA/APA header and title lines are not counted"
                  >
                    <Switch
                      checked={settings.wordCountExcludesHeader}
                      onCheckedChange={(v) => void save({ wordCountExcludesHeader: v })}
                    />
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Default word count goal" description="Set to 0 to disable">
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-24 text-xs"
                      value={settings.defaultWordCountGoal ?? 0}
                      onChange={(e) => void save({ defaultWordCountGoal: parseInt(e.target.value) || null })}
                    />
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Typewriter mode" description="Cursor stays vertically centered while typing">
                    <Switch
                      checked={settings.typewriterMode}
                      onCheckedChange={(v) => {
                        useAppStore.getState().setTypewriterMode(v)
                        void save({ typewriterMode: v })
                      }}
                    />
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Heading 1 size">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={8} max={96}
                        className="h-8 w-20 text-xs"
                        value={settings.headingFontSizes?.h1 ?? 36}
                        onChange={(e) => void save({ headingFontSizes: { ...(settings.headingFontSizes ?? { h1: 36, h2: 24, h3: 18 }), h1: parseInt(e.target.value) || 36 } })}
                      />
                      <span className="text-xs text-muted-foreground">pt</span>
                    </div>
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Heading 2 size">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={8} max={96}
                        className="h-8 w-20 text-xs"
                        value={settings.headingFontSizes?.h2 ?? 24}
                        onChange={(e) => void save({ headingFontSizes: { ...(settings.headingFontSizes ?? { h1: 36, h2: 24, h3: 18 }), h2: parseInt(e.target.value) || 24 } })}
                      />
                      <span className="text-xs text-muted-foreground">pt</span>
                    </div>
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Heading 3 size">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={8} max={96}
                        className="h-8 w-20 text-xs"
                        value={settings.headingFontSizes?.h3 ?? 18}
                        onChange={(e) => void save({ headingFontSizes: { ...(settings.headingFontSizes ?? { h1: 36, h2: 24, h3: 18 }), h3: parseInt(e.target.value) || 18 } })}
                      />
                      <span className="text-xs text-muted-foreground">pt</span>
                    </div>
                  </SettingRow>
                  {documentId && (
                    <>
                      <Separator />
                      <div className="pt-3">
                      <SectionTitle>Spellcheck</SectionTitle>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Words added here are treated as correctly spelled in this document.
                      </p>
                      {spellWords.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {spellWords.map((w) => (
                            <span
                              key={w}
                              className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                            >
                              {w}
                              <button
                                className="ml-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => {
                                  void window.prose.spell.removeWord(documentId, w).then((updated) => {
                                    setSpellWords(updated)
                                    onWordListChange?.(updated)
                                  })
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {spellWords.length === 0 && (
                        <p className="mb-3 text-xs text-muted-foreground italic">No custom words yet.</p>
                      )}
                      <div className="flex gap-2">
                        <Input
                          className="h-8 flex-1 text-xs"
                          placeholder="Add a word…"
                          value={newWord}
                          onChange={(e) => setNewWord(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.form?.requestSubmit()
                          }}
                        />
                        <button
                          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
                          disabled={!newWord.trim()}
                          onClick={() => {
                            const word = newWord.trim()
                            if (!word) return
                            void window.prose.spell.addWord(documentId, word).then((updated) => {
                              setSpellWords(updated)
                              onWordListChange?.(updated)
                              setNewWord('')
                            })
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </button>
                      </div>
                      </div>
                    </>
                  )}
                  <Separator />
                  <SectionTitle>Pomodoro</SectionTitle>
                  <SettingRow label="Work duration">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        className="h-8 w-20 text-xs"
                        value={settings.pomodoroWorkMinutes}
                        onChange={(e) => void save({ pomodoroWorkMinutes: Math.max(1, parseInt(e.target.value) || 25) })}
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Break duration">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        className="h-8 w-20 text-xs"
                        value={settings.pomodoroBreakMinutes}
                        onChange={(e) => void save({ pomodoroBreakMinutes: Math.max(1, parseInt(e.target.value) || 5) })}
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </SettingRow>
                  <Separator />
                  <div className="py-3 text-xs text-muted-foreground">
                    Changes take effect on the next timer reset.
                  </div>
                </>
              )}

              {section === 'ai' && (
                <>
                  <SectionTitle>AI</SectionTitle>
                  <SettingRow label="Active model" description="The model used for all AI requests">
                    {models.length > 0 ? (
                      <Select
                        value={settings.ollamaModel}
                        onValueChange={(v) => void save({ ollamaModel: v })}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map((m) => (
                            <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">
                        {settings.ollamaModel}
                      </span>
                    )}
                  </SettingRow>
                  <Separator />
                  <div className="py-3 text-xs text-muted-foreground">
                    To download a different model, run{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">ollama pull &lt;model&gt;</code>{' '}
                    in a terminal, then restart Prose.
                  </div>
                </>
              )}

              {section === 'storage' && (
                <>
                  <SectionTitle>Storage</SectionTitle>
                  <SettingRow label="Documents folder">
                    <span className="max-w-[200px] truncate text-right text-xs text-muted-foreground font-mono" title={storageInfo?.folder}>
                      {storageInfo?.folder ?? '—'}
                    </span>
                  </SettingRow>
                  <Separator />
                  <SettingRow label="Disk usage" description={storageInfo ? `${storageInfo.documentCount} file${storageInfo.documentCount !== 1 ? 's' : ''}` : undefined}>
                    <span className="text-xs text-muted-foreground">
                      {storageInfo ? formatBytes(storageInfo.totalBytes) : '—'}
                    </span>
                  </SettingRow>
                  <Separator />
                  {storageInfo && !storageInfo.accessible && (
                    <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      Folder is not accessible. Documents cannot be saved until a valid folder is set.
                    </div>
                  )}
                  <div className="flex gap-2 py-3">
                    <button
                      onClick={() => void handlePickNewFolder()}
                      className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                    >
                      Change location…
                    </button>
                    <button
                      onClick={() => void window.prose.documents.openFolder()}
                      className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                    >
                      Open in Explorer
                    </button>
                  </div>
                </>
              )}

              {section === 'about' && (
                <>
                  <SectionTitle>About</SectionTitle>
                  <div className="flex flex-col gap-4 py-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">Prose</span>
                      <span className="text-xs text-muted-foreground">Version 0.1.0</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      A focused, fully offline productivity app for Windows. Write documents, crunch numbers in sheets, map ideas on boards, and build presentations. Local AI assistant included. No account, no subscription, no data leaves your machine.
                    </p>
                    <div className="flex flex-col gap-2">
                      <a
                        href="https://github.com/websitesbycss/prose"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        onClick={(e) => {
                          e.preventDefault()
                          window.open('https://github.com/websitesbycss/prose', '_blank')
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        github.com/websitesbycss/prose
                      </a>
                    </div>
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      MIT License. Free to use, modify, and distribute.
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3 flex justify-end">
          <Button size="sm" className="text-xs" onClick={onClose}>Done</Button>
        </div>
        {/* Picker portal layer — inside dialog DOM so it's exempt from Radix's inert marking */}
        <div ref={pickerLayerRef} className="pointer-events-none absolute inset-0 overflow-visible" style={{ zIndex: 100 }} />
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!changeFolderDialog} onOpenChange={(o) => { if (!o) setChangeFolderDialog(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change documents folder?</AlertDialogTitle>
          <AlertDialogDescription>
            Move your existing documents to{' '}
            <span className="font-mono text-xs">{changeFolderDialog?.newPath}</span>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void handleConfirmChangeFolder(false)}>
            Keep files in place
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleConfirmChangeFolder(true)}>
            Move files
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

function AccentColorRow({
  label,
  presets,
  value,
  defaultValue,
  onChange,
  pickerLayer,
}: {
  label: string
  presets: ReadonlyArray<{ label: string; hex: string }>
  value: string
  defaultValue: string
  onChange: (hex: string) => void
  pickerLayer: React.RefObject<HTMLDivElement>
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (pickerRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function handleToggle(): void {
    const btnRect = btnRef.current?.getBoundingClientRect()
    const layerRect = pickerLayer.current?.getBoundingClientRect()
    if (!btnRect || !layerRect) return
    // Position relative to the picker layer (which fills the dialog)
    const top = btnRect.bottom + 6 - layerRect.top
    const left = Math.max(8, btnRect.right - 240) - layerRect.left
    setPos({ top, left })
    setOpen((o) => !o)
  }

  const palette = presets.map((p) => p.hex)
  const layer = pickerLayer.current

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <button
        ref={btnRef}
        className="flex items-center gap-2 rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
        onClick={handleToggle}
      >
        <div
          className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono text-muted-foreground">{value.toUpperCase()}</span>
      </button>
      {open && layer && createPortal(
        <div
          ref={pickerRef}
          style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 10, pointerEvents: 'auto' }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ChromeColorPicker
            color={value}
            current={value}
            palette={palette}
            onChange={onChange}
            onPaletteSelect={(c) => { onChange(c); setOpen(false) }}
            onReset={() => { onChange(defaultValue); setOpen(false) }}
            resetLabel="Reset to default"
          />
        </div>,
        layer
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

function PageMarginsEditor({
  margins,
  onChange,
}: {
  margins: PageMargins
  onChange: (m: PageMargins) => void
}): JSX.Element {
  function clamp(v: number): number {
    return Math.min(PAGE_MARGIN_MAX_IN, Math.max(PAGE_MARGIN_MIN_IN, v))
  }

  function handleChange(side: keyof PageMargins, raw: string): void {
    const v = parseFloat(raw)
    if (isNaN(v)) return
    onChange({ ...margins, [side]: clamp(v) })
  }

  const fields: { key: keyof PageMargins; label: string }[] = [
    { key: 'top', label: 'Top' },
    { key: 'bottom', label: 'Bottom' },
    { key: 'left', label: 'Left' },
    { key: 'right', label: 'Right' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{label}</label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              step={0.25}
              min={PAGE_MARGIN_MIN_IN}
              max={PAGE_MARGIN_MAX_IN}
              className="h-8 w-20 text-xs"
              value={margins[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              onBlur={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) onChange({ ...margins, [key]: clamp(v) })
              }}
            />
            <span className="text-xs text-muted-foreground">in</span>
          </div>
        </div>
      ))}
      <p className="col-span-2 text-[10px] text-muted-foreground">
        Min {PAGE_MARGIN_MIN_IN} in · Max {PAGE_MARGIN_MAX_IN} in
      </p>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
