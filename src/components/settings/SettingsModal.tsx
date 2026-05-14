import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { AppSettings } from '@/types'
import { Palette, PenLine, Sparkles, Timer, Info, ExternalLink } from 'lucide-react'

type Section = 'appearance' | 'writing' | 'ai' | 'pomodoro' | 'about'

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'writing', label: 'Writing', icon: PenLine },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'pomodoro', label: 'Pomodoro', icon: Timer },
  { id: 'about', label: 'About', icon: Info },
]

const FONT_FAMILIES = ['Times New Roman', 'Georgia', 'Arial', 'Helvetica', 'Courier New']
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

export default function SettingsModal({ open, onClose }: SettingsModalProps): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  const [section, setSection] = useState<Section>('appearance')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [models, setModels] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    void window.prose.settings.get().then((s) => setSettings(s as AppSettings))
    void window.prose.ollama.listModels().then(setModels)
  }, [open])

  const save = useCallback(async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings((prev) => prev ? { ...prev, ...patch } : prev)
    try {
      await window.prose.settings.set(patch as Record<string, unknown>)
    } catch (err) {
      console.error('Settings save error:', err)
    }
  }, [])

  if (!settings) return <></>

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex h-[540px] max-h-[90vh] w-[680px] max-w-[95vw] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="text-sm font-semibold">Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <nav className="flex w-[160px] shrink-0 flex-col gap-0.5 border-r border-border p-2">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
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
                </>
              )}

              {section === 'writing' && (
                <>
                  <SectionTitle>Writing</SectionTitle>
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
                      onCheckedChange={(v) => void save({ typewriterMode: v })}
                    />
                  </SettingRow>
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

              {section === 'pomodoro' && (
                <>
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

              {section === 'about' && (
                <>
                  <SectionTitle>About</SectionTitle>
                  <div className="flex flex-col gap-4 py-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">Prose</span>
                      <span className="text-xs text-muted-foreground">Version 0.1.0</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      A focused, fully offline essay writing app for Windows with a built-in AI assistant.
                      No account, no subscription, no data leaves your machine.
                    </p>
                    <div className="flex flex-col gap-2">
                      <a
                        href="https://github.com/websitesbycss/prose"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        onClick={(e) => {
                          e.preventDefault()
                          // Links open in system browser via Electron webContents handler
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        github.com/websitesbycss/prose
                      </a>
                    </div>
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      MIT License — free to use, modify, and distribute
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
      </DialogContent>
    </Dialog>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}
