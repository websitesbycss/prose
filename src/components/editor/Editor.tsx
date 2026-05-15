import { useEffect, useCallback, useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from '@tiptap/extension-font-family'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { Link } from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Placeholder } from '@tiptap/extension-placeholder'
import type { JSONContent } from '@tiptap/core'
import { motion, AnimatePresence } from 'motion/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FontSize } from '@/extensions/fontSize'
import { Indent } from '@/extensions/indent'
import { ParagraphRole } from '@/extensions/paragraphRole'
import { PageBreakNode } from '@/extensions/PageBreakNode'
import { useDocument } from '@/hooks/useDocument'
import { useWordCount } from '@/hooks/useWordCount'
import { usePageBreaks } from '@/hooks/usePageBreaks'
import { usePomodoro } from '@/hooks/usePomodoro'
import { useMusic, AMBIENT_LAYERS } from '@/hooks/useMusic'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import {
  buildMlaContent,
  buildApaContent,
  extractBodyNodes,
  extractMlaFields,
  extractApaFields,
} from '@/lib/templates'
import type { MlaFields, ApaFields } from '@/lib/templates'
import TitleBar from './TitleBar'
import Toolbar from './Toolbar'
import StatusBar from './StatusBar'
import FocusBar from './FocusBar'
import FormatModal from './FormatModal'
import PageHeader from './PageHeader'
import OutlinePanel from './OutlinePanel'
import PomodoroPanel from './PomodoroPanel'
import AiPanel from './AiPanel'
import CitationPanel from './CitationPanel'
import MusicPanel from './MusicPanel'
import SettingsModal from '@/components/settings/SettingsModal'
import type { AppSettings, Document } from '@/types'
import { List, Timer, MessageSquare, ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { AI_PANEL_WIDTH } from '@/constants'

type SidebarPanel = 'outline' | 'pomodoro' | 'comments'

interface EditorProps {
  documentId: string
}

export default function Editor({ documentId }: EditorProps): JSX.Element {
  const setCurrentDocumentId = useAppStore((s) => s.setCurrentDocumentId)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const citationPanelOpen = useAppStore((s) => s.citationPanelOpen)
  const musicPanelOpen = useAppStore((s) => s.musicPanelOpen)
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const focusModeActive = useAppStore((s) => s.focusModeActive)
  const setFocusModeActive = useAppStore((s) => s.setFocusModeActive)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  const editorScrollRef = useRef<HTMLDivElement>(null)
  const [typewriterMode, setTypewriterMode] = useState(false)
  const [aiPanelWidth, setAiPanelWidth] = useState(AI_PANEL_WIDTH)
  const dragStartRef = useRef<{ x: number; width: number } | null>(null)

  const { document, saveStatus, saveNow, onEditorUpdate, updateTitle, patchDocument } =
    useDocument(documentId)

  const [settings, setSettings] = useState<Pick<AppSettings, 'wordCountExcludesHeader'>>({
    wordCountExcludesHeader: true,
  })
  const [headingFontSizes, setHeadingFontSizes] = useState({ h1: 36, h2: 24, h3: 18 })
  const [formatModalTarget, setFormatModalTarget] = useState<'mla' | 'apa' | null>(null)
  const [activePanel, setActivePanel] = useState<SidebarPanel>('outline')

  const pomodoroControls = usePomodoro()
  const music = useMusic()

  useEffect(() => {
    void window.prose.settings.get().then((s) => {
      const appSettings = s as AppSettings
      setSettings({ wordCountExcludesHeader: appSettings.wordCountExcludesHeader })
      setTypewriterMode(appSettings.typewriterMode ?? false)
      if (appSettings.headingFontSizes) setHeadingFontSizes(appSettings.headingFontSizes)
    })
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Indent,
      ParagraphRole,
      PageBreakNode,
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: '',
    onUpdate: ({ editor: e }) => onEditorUpdate(e),
  })

  useEffect(() => {
    if (!editor || !document) return
    try {
      const parsed = JSON.parse(document.content || '{}') as object
      editor.commands.setContent(parsed, false)
    } catch {
      editor.commands.setContent('')
    }
  }, [document?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editor) return
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void saveNow(editor)
      }
      if (e.key === 'F11') {
        e.preventDefault()
        setFocusModeActive(!useAppStore.getState().focusModeActive)
      }
      if (e.key === 'Escape' && useAppStore.getState().focusModeActive) {
        setFocusModeActive(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor, saveNow, setFocusModeActive])

  // Resize handler for AI/Citations panel drag
  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (!dragStartRef.current) return
      const delta = dragStartRef.current.x - e.clientX
      const newWidth = Math.min(400, Math.max(180, dragStartRef.current.width + delta))
      setAiPanelWidth(newWidth)
    }
    function onMouseUp(): void {
      dragStartRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Typewriter mode: keep cursor vertically centered in the scroll container
  useEffect(() => {
    if (!editor || !typewriterMode) return

    function scrollToCursor(): void {
      const container = editorScrollRef.current
      if (!container) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (!rect.height) return
      const containerRect = container.getBoundingClientRect()
      const targetScrollTop =
        container.scrollTop + rect.top - containerRect.top - containerRect.height / 2
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
    }

    editor.on('selectionUpdate', scrollToCursor)
    return () => { editor.off('selectionUpdate', scrollToCursor) }
  }, [editor, typewriterMode])

  const wordCount = useWordCount(
    editor,
    settings.wordCountExcludesHeader && (document?.format === 'mla' || document?.format === 'apa')
  )

  usePageBreaks(editor)

  const applyTemplate = useCallback(
    async (format: 'mla' | 'apa', newContent: JSONContent): Promise<void> => {
      if (!editor) return
      editor.commands.setContent(newContent, false)
      const contentStr = JSON.stringify(newContent)
      try {
        await window.prose.documents.update(documentId, { format, content: contentStr })
        patchDocument({ format, content: contentStr })
      } catch (err) {
        console.error('Template apply error:', err)
      }
      setFormatModalTarget(null)
    },
    [editor, documentId, patchDocument]
  )

  const handleApplyMla = useCallback(
    (fields: MlaFields): void => {
      if (!editor) return
      const currentJson = editor.getJSON()
      const body = extractBodyNodes(currentJson)
      const newContent = buildMlaContent(fields, body)
      void applyTemplate('mla', newContent)
    },
    [editor, applyTemplate]
  )

  const handleApplyApa = useCallback(
    (fields: ApaFields): void => {
      if (!editor) return
      const currentJson = editor.getJSON()
      const body = extractBodyNodes(currentJson)
      const newContent = buildApaContent(fields, body)
      void applyTemplate('apa', newContent)
    },
    [editor, applyTemplate]
  )

  const currentJson = editor ? editor.getJSON() : null
  const format = document?.format ?? 'none'

  const initialMla =
    format === 'mla' && currentJson ? extractMlaFields(currentJson) : undefined
  const initialApa =
    format === 'apa' && currentJson ? extractApaFields(currentJson) : undefined

  const handleBack = useCallback((): void => setCurrentDocumentId(null), [setCurrentDocumentId])
  const handleSaveNow = useCallback(
    async (): Promise<void> => { if (editor) await saveNow(editor) },
    [editor, saveNow]
  )

  function handleSidebarIconClick(panel: SidebarPanel): void {
    if (sidebarOpen && activePanel === panel) {
      setSidebarOpen(false)
    } else {
      setActivePanel(panel)
      setSidebarOpen(true)
    }
  }

  const formatClass = format === 'mla' ? 'format-mla' : format === 'apa' ? 'format-apa' : ''
  const editorFontFamily =
    (editor?.getAttributes('textStyle').fontFamily as string | undefined) ?? 'Times New Roman'

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        {/* Chrome — hidden in focus mode */}
        <AnimatePresence>
          {!focusModeActive && (
            <motion.div
              key="chrome-top"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="shrink-0"
            >
              <TitleBar
                document={document}
                editor={editor}
                saveStatus={saveStatus}
                onBack={handleBack}
                onSaveNow={handleSaveNow}
                onTitleChange={updateTitle}
              />
              <Toolbar
                editor={editor}
                document={document}
                onApplyFormat={setFormatModalTarget}
                headingFontSizes={headingFontSizes}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Focus bar — only in focus mode */}
        <AnimatePresence>
          {focusModeActive && (
            <motion.div
              key="focus-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="shrink-0"
            >
              <FocusBar nowPlaying={music.nowPlayingTitle} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — hidden in focus mode */}
          {!focusModeActive && (
            <aside
              className={cn(
                'flex shrink-0 flex-col border-r border-border transition-all duration-200',
                sidebarOpen ? 'w-[220px]' : 'w-[42px]'
              )}
            >
              <div className="flex flex-col gap-0.5 p-1.5">
                <SidebarIcon
                  icon={List}
                  label="Outline"
                  expanded={sidebarOpen}
                  active={sidebarOpen && activePanel === 'outline'}
                  onClick={() => handleSidebarIconClick('outline')}
                />
                <SidebarIcon
                  icon={Timer}
                  label="Pomodoro"
                  expanded={sidebarOpen}
                  active={sidebarOpen && activePanel === 'pomodoro'}
                  onClick={() => handleSidebarIconClick('pomodoro')}
                />
                <SidebarIcon
                  icon={MessageSquare}
                  label="Comments"
                  expanded={sidebarOpen}
                  active={sidebarOpen && activePanel === 'comments'}
                  onClick={() => handleSidebarIconClick('comments')}
                />
              </div>

              <AnimatePresence mode="wait">
                {sidebarOpen && (
                  <motion.div
                    key={activePanel}
                    className="flex-1 overflow-hidden"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    {activePanel === 'outline' && <OutlinePanel editor={editor} />}
                    {activePanel === 'pomodoro' && <PomodoroPanel controls={pomodoroControls} />}
                    {activePanel === 'comments' && (
                      <p className="px-3 py-4 text-xs text-muted-foreground">
                        Comments arrive in a later phase.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                className="flex items-center justify-center border-t border-border p-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <button
                className="flex items-center justify-center p-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </aside>
          )}

          {/* Editor canvas */}
          <div
            ref={editorScrollRef}
            className="flex flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-900"
          >
            <div className={cn('mx-auto my-8 w-[816px] self-start', focusModeActive && 'my-16')}>
              <div className={cn('editor-page relative min-h-[1056px] bg-white dark:bg-zinc-800 px-24 py-24', formatClass)}>
                <PageHeader format={format} content={currentJson} fontFamily={editorFontFamily} />
                <EditorContent
                  editor={editor}
                  className="prose-editor min-h-full outline-none"
                />
              </div>
            </div>
          </div>

          {/* Right panel — AI or Citations (hidden in focus mode) */}
          {!focusModeActive && (
            <AnimatePresence mode="wait">
              {(aiPanelOpen || citationPanelOpen) && (
                <motion.div
                  key={aiPanelOpen ? 'ai' : 'citations'}
                  className="relative shrink-0 overflow-hidden"
                  style={{ width: aiPanelWidth }}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {/* Drag handle */}
                  <div
                    className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
                    onMouseDown={(e) => {
                      dragStartRef.current = { x: e.clientX, width: aiPanelWidth }
                      document.body.style.cursor = 'col-resize'
                      document.body.style.userSelect = 'none'
                    }}
                  />
                  {aiPanelOpen && <AiPanel editor={editor} />}
                  {citationPanelOpen && (
                    <CitationPanel documentId={documentId} format={format} editor={editor} />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Status bar — hidden in focus mode */}
        {!focusModeActive && (
          <StatusBar
            document={document}
            wordCount={wordCount}
            saveStatus={saveStatus}
            nowPlaying={music.nowPlayingTitle}
            ambientPlaying={(() => {
              const active = AMBIENT_LAYERS.filter((l) => music.ambientEnabled[l.id])
              if (active.length === 0) return null
              if (active.length === 1) return active[0]!.label
              if (active.length === 2) return `${active[0]!.label} + ${active[1]!.label}`
              return `${active.length} Sounds`
            })()}
            onMusicClick={() => setMusicPanelOpen(true)}
          />
        )}
      </div>

      <AnimatePresence>
        {musicPanelOpen && <MusicPanel music={music} />}
      </AnimatePresence>

      <FormatModal
        open={formatModalTarget !== null}
        format={formatModalTarget}
        initialMla={initialMla}
        initialApa={initialApa}
        onClose={() => setFormatModalTarget(null)}
        onApplyMla={handleApplyMla}
        onApplyApa={handleApplyApa}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </TooltipProvider>
  )
}

interface SidebarIconProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  expanded: boolean
  active: boolean
  onClick: () => void
}

function SidebarIcon({ icon: Icon, label, expanded, active, onClick }: SidebarIconProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-muted-foreground transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent hover:text-accent-foreground',
      )}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {expanded && <span className="truncate text-xs">{label}</span>}
    </button>
  )
}
