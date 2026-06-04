import { useEffect, useCallback, useState, useRef } from 'react'
import { NodeSelection } from '@tiptap/pm/state'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from '@tiptap/extension-font-family'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { CustomImage } from '@/extensions/imageExtension'
import { SpellcheckExtension, spellKey } from '@/extensions/spellcheckExtension'
import { Link } from '@tiptap/extension-link'
import { CellSelection } from '@tiptap/pm/tables'
import {
  CustomTable,
  CustomTableRow,
  CustomTableHeader,
  CustomTableCell,
  TableCellAttributes,
} from '@/extensions/tableExtensions'
import { useRowResize } from '@/hooks/useRowResize'
import { Placeholder } from '@tiptap/extension-placeholder'
import type { JSONContent } from '@tiptap/core'
import { motion, AnimatePresence } from 'motion/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FontSize } from '@/extensions/fontSize'
import { Indent } from '@/extensions/indent'
import { PageNumberNode } from '@/extensions/pageNumber'
import { PageBreakNode } from '@/extensions/pageBreak'
import { IssueHighlight } from '@/extensions/issueHighlight'
import { AiSelectionHighlight } from '@/extensions/aiSelectionHighlight'
import { LineHeight } from '@/extensions/lineHeight'
import { ExitMarkOnArrowRight } from '@/extensions/exitMarkOnArrowRight'
import { ParagraphRole } from '@/extensions/paragraphRole'
import { FindExtension } from '@/extensions/findExtension'
import { InlineMath, BlockMath } from '@/extensions/mathExtension'
import { useDocument } from '@/hooks/useDocument'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useWordCount } from '@/hooks/useWordCount'
import { useSelectionWordCount } from '@/hooks/useSelectionWordCount'
import { usePomodoro } from '@/hooks/usePomodoro'
import { useSessionStats } from '@/hooks/useSessionStats'
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
import { HeaderFooterEditor, parseHeaderContent, buildMlaHeaderContent, buildApaHeaderContent } from './HeaderFooterEditor'
import OutlinePanel from './OutlinePanel'
import PomodoroPanel from './PomodoroPanel'
import AiPanel, { IssueTooltip } from './AiPanel'
import CitationPanel from './CitationPanel'
import MusicPanel from './MusicPanel'
import { SessionStatsPanel } from './SessionStatsPanel'
import { HistoryPanel } from './HistoryPanel'
import { EditorContextMenu } from './EditorContextMenu'
import { SpellTooltip } from './SpellTooltip'
import MathModal from './MathModal'
import SettingsModal from '@/components/settings/SettingsModal'
import type { AppSettings, Document, PageMargins } from '@/types'
import { List, Timer, BarChart2, History, ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { AI_PANEL_WIDTH, DEFAULT_PAGE_MARGINS } from '@/constants'
import { getDocumentScroll, setDocumentScroll } from '@/lib/documentTabCache'

type SidebarPanel = 'outline' | 'pomodoro' | 'stats' | 'history'

interface EditorProps {
  documentId: string
}

export default function Editor({ documentId }: EditorProps): JSX.Element {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const citationPanelOpen = useAppStore((s) => s.citationPanelOpen)
  const musicPanelOpen = useAppStore((s) => s.musicPanelOpen)
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setMusicPanelTab = useAppStore((s) => s.setMusicPanelTab)
  const focusModeActive = useAppStore((s) => s.focusModeActive)
  const setFocusModeActive = useAppStore((s) => s.setFocusModeActive)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const setSaveActiveDocument = useAppStore((s) => s.setSaveActiveDocument)

  const editorScrollRef = useRef<HTMLDivElement>(null)
  const loadedContentKeyRef = useRef<string | null>(null)
  const typewriterMode = useAppStore((s) => s.typewriterMode)
  const setTypewriterMode = useAppStore((s) => s.setTypewriterMode)
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const v = localStorage.getItem('prose-ai-panel-width')
    return v ? Math.max(240, parseInt(v)) : AI_PANEL_WIDTH
  })
  const dragStartRef = useRef<{ x: number; width: number } | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const v = localStorage.getItem('prose-sidebar-width')
    return v ? Math.max(180, parseInt(v)) : 270
  })
  const sidebarDragRef = useRef<{ x: number; width: number } | null>(null)
  const aiPanelWidthRef = useRef(aiPanelWidth)
  const sidebarWidthRef = useRef(sidebarWidth)

  // Tracks when header/footer content should be forcibly reset in the child editors
  const [headerContentKey, setHeaderContentKey] = useState(() => crypto.randomUUID())
  const [footerContentKey, setFooterContentKey] = useState(() => crypto.randomUUID())

  // When a zone editor (header/footer) is focused, toolbar commands target it instead of the body editor
  const [zoneEditor, setZoneEditor] = useState<import('@tiptap/core').Editor | null>(null)
  const zoneBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleZoneFocus(editor: import('@tiptap/core').Editor): void {
    if (zoneBlurTimer.current) {
      clearTimeout(zoneBlurTimer.current)
      zoneBlurTimer.current = null
    }
    setZoneEditor(editor)
  }

  function handleZoneBlur(): void {
    zoneBlurTimer.current = setTimeout(() => {
      zoneBlurTimer.current = null
      setZoneEditor(null)
    }, 200)
  }

  const { document: doc, saveStatus, saveNow, flushSave, onEditorUpdate, updateTitle, patchDocument, notifySaveStatus } =
    useDocument(documentId)

  const [settings, setSettings] = useState<Pick<AppSettings, 'wordCountExcludesHeader'>>({
    wordCountExcludesHeader: true,
  })
  const [editorFontFamily, setEditorFontFamily] = useState('Calibri')
  const [editorFontSize, setEditorFontSize] = useState(11)
  const [headingFontSizes, setHeadingFontSizes] = useState({ h1: 36, h2: 24, h3: 18 })
  const [pageMargins, setPageMargins] = useState<PageMargins>(DEFAULT_PAGE_MARGINS)
  const [editorZoom, setEditorZoom] = useState(() => {
    const v = localStorage.getItem('prose-editor-zoom')
    return v ? Math.min(200, Math.max(25, parseInt(v))) : 100
  })
  const [findOpen, setFindOpen] = useState(false)
  const [mathModal, setMathModal] = useState<{
    open: boolean
    editPos: number | null
    initialLatex: string
    initialDisplayMode: boolean
  }>({ open: false, editPos: null, initialLatex: '', initialDisplayMode: false })
  const findInputRef = useRef<HTMLInputElement>(null)
  const [formatModalTarget, setFormatModalTarget] = useState<'mla' | 'apa' | null>(null)
  const [activePanel, setActivePanel] = useState<SidebarPanel>('outline')

  const pomodoroControls = usePomodoro()
  const music = useMusic()
  const analysis = useAnalysis()

  useEffect(() => {
    void window.prose.settings.get().then((s) => {
      const appSettings = s as AppSettings
      setSettings({ wordCountExcludesHeader: appSettings.wordCountExcludesHeader })
      setTypewriterMode(appSettings.typewriterMode ?? false)
      if (appSettings.headingFontSizes) setHeadingFontSizes(appSettings.headingFontSizes)
      if (appSettings.editorFontFamily) setEditorFontFamily(appSettings.editorFontFamily)
      if (appSettings.editorFontSize) setEditorFontSize(appSettings.editorFontSize)
    })
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
      Underline,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      CustomImage,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      CustomTable,
      CustomTableRow,
      CustomTableHeader,
      CustomTableCell,
      TableCellAttributes,
      Indent,
      PageNumberNode,
      PageBreakNode,
      IssueHighlight,
      AiSelectionHighlight,
      LineHeight,
      ExitMarkOnArrowRight,
      ParagraphRole,
      FindExtension,
      InlineMath,
      BlockMath,
      SpellcheckExtension,
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: '',
    onUpdate: ({ editor: e }) => onEditorUpdate(e),
    editorProps: {
      attributes: { spellcheck: 'false' },
      handleScrollToSelection: (view) => {
        const scrollEl = editorScrollRef.current
        if (!scrollEl) return false

        const { selection } = view.state

        const stablePos =
          selection instanceof CellSelection ? selection.$anchorCell.pos : selection.from

        let coords: { top: number; bottom: number }
        try {
          coords = view.coordsAtPos(stablePos)
        } catch {
          return false
        }

        const box = scrollEl.getBoundingClientRect()
        const TOP_CLEARANCE = 80
        const BOT_CLEARANCE = 20

        if (coords.top < box.top + TOP_CLEARANCE) {
          scrollEl.scrollTop += coords.top - (box.top + TOP_CLEARANCE)
        } else if (coords.bottom > box.bottom - BOT_CLEARANCE) {
          scrollEl.scrollTop += coords.bottom - (box.bottom - BOT_CLEARANCE)
        }
        return true
      },
    },
  })

  useEffect(() => {
    if (!editor || !doc) return

    const contentKey = `${doc.id}:${doc.updatedAt ?? ''}:${doc.content?.length ?? 0}`
    if (loadedContentKeyRef.current === contentKey) return

    const previousKey = loadedContentKeyRef.current
    if (previousKey && editorScrollRef.current) {
      const previousId = previousKey.split(':')[0]
      if (previousId) setDocumentScroll(previousId, editorScrollRef.current.scrollTop)
    }

    analysis.clearIssues()
    editor.commands.clearAnalysisIssues()
    editor.commands.clearAiSelectionHighlight()
    useAppStore.getState().setAssignmentContext('')
    setPageMargins(doc.pageMargins ?? DEFAULT_PAGE_MARGINS)
    try {
      const parsed = JSON.parse(doc.content || '{}') as object
      editor.commands.setContent(parsed, false)
    } catch {
      editor.commands.setContent('')
    }

    loadedContentKeyRef.current = contentKey
    setHeaderContentKey(crypto.randomUUID())
    setFooterContentKey(crypto.randomUUID())

    const savedScroll = getDocumentScroll(doc.id)
    requestAnimationFrame(() => {
      if (editorScrollRef.current && savedScroll !== undefined) {
        editorScrollRef.current.scrollTop = savedScroll
      }
    })

    void window.prose.spell.getWords(documentId).then((words) => {
      if (!editor.isDestroyed) {
        editor.view.dispatch(editor.state.tr.setMeta(spellKey, { setIgnored: words }))
      }
    })
  }, [doc?.id, doc?.updatedAt, doc?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show/hide issue decorations based on panel visibility and analysis results
  useEffect(() => {
    if (!editor) return
    if (aiPanelOpen) {
      editor.commands.setAnalysisIssues(analysis.issues)
    } else {
      editor.commands.clearAnalysisIssues()
      editor.commands.clearAiSelectionHighlight()
    }
  }, [editor, analysis.issues, aiPanelOpen])

  useEffect(() => {
    if (!editor) return
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void saveNow(editor)
        if (useAppStore.getState().analyzeOnSave) {
          void analysis.analyze(editor.getText(), useAppStore.getState().assignmentContext)
        }
      }
      if (e.key === 'F11') {
        e.preventDefault()
        setFocusModeActive(!useAppStore.getState().focusModeActive)
      }
      if (e.key === 'Escape' && useAppStore.getState().focusModeActive) {
        setFocusModeActive(false)
      }
      // Find
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setFindOpen(true)
        setTimeout(() => findInputRef.current?.focus(), 0)
      }
      // Zoom: Ctrl+- and Ctrl+= (unshifted +)
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault()
        setEditorZoom((z) => { const v = Math.max(25, z - 10); localStorage.setItem('prose-editor-zoom', String(v)); return v })
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setEditorZoom((z) => { const v = Math.min(200, z + 10); localStorage.setItem('prose-editor-zoom', String(v)); return v })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        localStorage.setItem('prose-editor-zoom', '100')
        setEditorZoom(100)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor, saveNow, setFocusModeActive])

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (dragStartRef.current) {
        const delta = dragStartRef.current.x - e.clientX
        const newWidth = Math.min(600, Math.max(180, dragStartRef.current.width + delta))
        setAiPanelWidth(newWidth)
        aiPanelWidthRef.current = newWidth
      }
      if (sidebarDragRef.current) {
        const delta = e.clientX - sidebarDragRef.current.x
        const newWidth = Math.min(480, Math.max(180, sidebarDragRef.current.width + delta))
        setSidebarWidth(newWidth)
        sidebarWidthRef.current = newWidth
      }
    }
    function onMouseUp(): void {
      if (dragStartRef.current) localStorage.setItem('prose-ai-panel-width', String(aiPanelWidthRef.current))
      if (sidebarDragRef.current) localStorage.setItem('prose-sidebar-width', String(sidebarWidthRef.current))
      dragStartRef.current = null
      sidebarDragRef.current = null
      if (globalThis.document?.body) {
        globalThis.document.body.style.cursor = ''
        globalThis.document.body.style.userSelect = ''
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

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

  // Keep caret-color in sync with the active text color (including stored marks
  // set before any character is typed on an empty selection).
  useEffect(() => {
    if (!editor) return
    function syncCaretColor() {
      const storedColor = editor.state.storedMarks
        ?.find((m) => m.type.name === 'textStyle')?.attrs.color as string | undefined
      const color = storedColor ?? (editor.getAttributes('textStyle').color as string | undefined) ?? ''
      ;(editor.view.dom as HTMLElement).style.caretColor = color
    }
    editor.on('transaction', syncCaretColor)
    syncCaretColor()
    return () => { editor.off('transaction', syncCaretColor) }
  }, [editor])

  const wordCount = useWordCount(
    editor,
    settings.wordCountExcludesHeader && (doc?.format === 'mla' || doc?.format === 'apa')
  )
  const selectionWordCount = useSelectionWordCount(editor)

  useRowResize(editor)

  const sessionStats = useSessionStats(wordCount)

  const applyTemplate = useCallback(
    async (format: 'mla' | 'apa', newContent: JSONContent, headerJson: JSONContent): Promise<void> => {
      if (!editor) return
      editor.commands.setContent(newContent, false)
      editor.chain()
        .selectAll()
        .updateAttributes('paragraph', { lineHeight: 2.0 })
        .updateAttributes('heading', { lineHeight: 2.0 })
        .setTextSelection(1)
        .run()
      const contentStr = JSON.stringify(editor.getJSON())
      const headerStr = JSON.stringify(headerJson)
      try {
        await window.prose.documents.update(documentId, {
          format,
          content: contentStr,
          headerContent: headerStr,
          footerContent: null,
        })
        patchDocument({ format, content: contentStr, headerContent: headerStr, footerContent: null })
        setHeaderContentKey(crypto.randomUUID())
        setFooterContentKey(crypto.randomUUID())
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
      const lastName = fields.studentName.trim().split(/\s+/).pop() ?? ''
      const headerJson = buildMlaHeaderContent(lastName)
      void applyTemplate('mla', newContent, headerJson)
    },
    [editor, applyTemplate]
  )

  const handleApplyApa = useCallback(
    (fields: ApaFields): void => {
      if (!editor) return
      const currentJson = editor.getJSON()
      const body = extractBodyNodes(currentJson)
      const newContent = buildApaContent(fields, body)
      const shortTitle = fields.essayTitle.trim().toUpperCase().slice(0, 50)
      const headerJson = buildApaHeaderContent(shortTitle)
      void applyTemplate('apa', newContent, headerJson)
    },
    [editor, applyTemplate]
  )

  const currentJson = editor ? editor.getJSON() : null
  const format = doc?.format ?? 'none'

  const initialMla =
    format === 'mla' && currentJson ? extractMlaFields(currentJson) : undefined
  const initialApa =
    format === 'apa' && currentJson ? extractApaFields(currentJson) : undefined

  const handleSaveNow = useCallback(
    async (): Promise<void> => { if (editor) await saveNow(editor) },
    [editor, saveNow]
  )

  useEffect(() => {
    setSaveActiveDocument(async () => {
      if (editor && !editor.isDestroyed) {
        await flushSave(editor)
      }
    })
    return () => setSaveActiveDocument(null)
  }, [editor, flushSave, setSaveActiveDocument])

  const openMathModal = useCallback((opts?: { editPos: number; latex: string; displayMode: boolean }): void => {
    if (opts) {
      setMathModal({ open: true, editPos: opts.editPos, initialLatex: opts.latex, initialDisplayMode: opts.displayMode })
      return
    }
    // Check if current selection is on a math node (toolbar Sigma click while equation selected)
    const ed = zoneEditor ?? editor
    if (ed) {
      const { selection } = ed.state
      if (selection instanceof NodeSelection) {
        const node = selection.node
        if (node.type.name === 'inlineMath' || node.type.name === 'blockMath') {
          setMathModal({
            open: true,
            editPos: selection.from,
            initialLatex: node.attrs.latex as string,
            initialDisplayMode: node.type.name === 'blockMath',
          })
          return
        }
      }
    }
    setMathModal({ open: true, editPos: null, initialLatex: '', initialDisplayMode: false })
  }, [editor, zoneEditor])

  const handleMathInsert = useCallback((latex: string, displayMode: boolean): void => {
    const ed = zoneEditor ?? editor
    if (!ed) return
    if (mathModal.editPos !== null) {
      const pos = mathModal.editPos
      ed.chain()
        .focus()
        .setNodeSelection(pos)
        .deleteSelection()
        [displayMode ? 'insertBlockMath' : 'insertInlineMath'](latex)
        .run()
    } else {
      if (displayMode) {
        ed.chain().focus().insertBlockMath(latex).run()
      } else {
        ed.chain().focus().insertInlineMath(latex).run()
      }
    }
    setMathModal((s) => ({ ...s, open: false }))
  }, [editor, zoneEditor, mathModal.editPos])

  const handleFindNavigate = useCallback((): void => {
    requestAnimationFrame(() => {
      const scrollEl = editorScrollRef.current
      if (!editor || !scrollEl) return
      const { from } = editor.state.selection
      try {
        const coords = editor.view.coordsAtPos(from)
        const box = scrollEl.getBoundingClientRect()
        const matchMid = (coords.top + coords.bottom) / 2
        const boxMid = (box.top + box.bottom) / 2
        scrollEl.scrollTop += matchMid - boxMid
      } catch {}
    })
  }, [editor])

  function handleSidebarIconClick(panel: SidebarPanel): void {
    if (sidebarOpen && activePanel === panel) {
      setSidebarOpen(false)
    } else {
      setActivePanel(panel)
      setSidebarOpen(true)
    }
  }

  const formatClass = format === 'mla' ? 'format-mla' : format === 'apa' ? 'format-apa' : ''

  const headerContent = parseHeaderContent(doc?.headerContent ?? null)
  const footerContent = parseHeaderContent(doc?.footerContent ?? null)

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        {/* Chrome — hidden in focus mode */}
        <AnimatePresence>
          {!focusModeActive && (
            <div className="shrink-0 overflow-visible">
              <TitleBar
                document={doc}
                editor={editor}
                saveStatus={saveStatus}
                onTitleChange={updateTitle}
                findOpen={findOpen}
                onFindOpenChange={setFindOpen}
                findInputRef={findInputRef}
                onFindNavigate={handleFindNavigate}
              />
              <Toolbar
                editor={zoneEditor ?? editor}
                document={doc}
                onApplyFormat={setFormatModalTarget}
                headingFontSizes={headingFontSizes}
                isZoneEditor={zoneEditor !== null}
                defaultFontFamily={editorFontFamily}
                defaultFontSize={editorFontSize}
                onOpenMathModal={() => openMathModal()}
              />
            </div>
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
              className="relative flex shrink-0 flex-col border-r border-border"
              style={{ width: sidebarOpen ? sidebarWidth : 42 }}
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
                  icon={BarChart2}
                  label="Stats"
                  expanded={sidebarOpen}
                  active={sidebarOpen && activePanel === 'stats'}
                  onClick={() => handleSidebarIconClick('stats')}
                />
                <SidebarIcon
                  icon={History}
                  label="History"
                  expanded={sidebarOpen}
                  active={sidebarOpen && activePanel === 'history'}
                  onClick={() => handleSidebarIconClick('history')}
                />
              </div>

              <div className="flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  {sidebarOpen && (
                    <motion.div
                      key={activePanel}
                      className="h-full overflow-hidden"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                      {activePanel === 'outline' && <OutlinePanel editor={editor} />}
                      {activePanel === 'pomodoro' && <PomodoroPanel controls={pomodoroControls} />}
                      {activePanel === 'stats' && <SessionStatsPanel stats={sessionStats} />}
                      {activePanel === 'history' && (
                        <HistoryPanel
                          documentId={documentId}
                          editor={editor}
                          format={format}
                          pollSnapshots={activePanel === 'history'}
                          onRestore={(hc, fc, content) => {
                            patchDocument({ headerContent: hc, footerContent: fc, content })
                            setHeaderContentKey(crypto.randomUUID())
                            setFooterContentKey(crypto.randomUUID())
                          }}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-col gap-0.5 border-t border-border p-1.5">
                <SidebarIcon
                  icon={Settings}
                  label="Settings"
                  expanded={sidebarOpen}
                  active={false}
                  onClick={() => setSettingsOpen(true)}
                />
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                  {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  {sidebarOpen && <span className="truncate text-xs">Collapse</span>}
                </button>
              </div>

              {/* Drag handle — only when expanded */}
              {sidebarOpen && (
                <div
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
                  onMouseDown={(e) => {
                    sidebarDragRef.current = { x: e.clientX, width: sidebarWidth }
                    globalThis.document.body.style.cursor = 'col-resize'
                    globalThis.document.body.style.userSelect = 'none'
                  }}
                />
              )}
            </aside>
          )}

          {/* Editor canvas */}
          <div
            ref={editorScrollRef}
            className="flex flex-1 overflow-auto bg-editor-canvas"
          >
            <div
              className={cn('mx-auto my-8 w-[816px] self-start', focusModeActive && 'my-16')}
              style={{ zoom: editorZoom / 100 }}
            >
              <div
                className={cn('editor-page relative bg-editor-page', formatClass)}
                style={{
                  '--page-margin-left': `${Math.round(pageMargins.left * 96)}px`,
                  '--page-margin-right': `${Math.round(pageMargins.right * 96)}px`,
                  '--page-margin-top': `${Math.round(pageMargins.top * 96)}px`,
                  '--page-margin-bottom': `${Math.round(pageMargins.bottom * 96)}px`,
                } as React.CSSProperties}
              >
                {/* Header zone — only rendered once document is loaded to prevent blank init on HMR */}
                {doc && (
                  <HeaderFooterEditor
                    zone="header"
                    documentId={documentId}
                    contentKey={headerContentKey}
                    initialContent={headerContent}
                    onZoneFocus={handleZoneFocus}
                    onZoneBlur={handleZoneBlur}
                    onSaveStatusChange={notifySaveStatus}
                  />
                )}
                <div className="border-b border-editor-zone-divider" />

                {/* Body content — padding inherits --page-margin-* */}
                <div
                  className="min-h-[900px]"
                  style={{
                    paddingLeft: 'var(--page-margin-left)',
                    paddingRight: 'var(--page-margin-right)',
                    paddingTop: 'var(--page-margin-top)',
                    paddingBottom: 'var(--page-margin-bottom)',
                    '--prose-editor-font-family': editorFontFamily,
                    '--prose-editor-font-size': `${editorFontSize}pt`,
                  } as React.CSSProperties}
                >
                  <EditorContent
                    editor={editor}
                    className="prose-editor min-h-full outline-none"
                  />
                  <EditorContextMenu
                    editor={editor}
                    documentId={documentId}
                    onEditMath={(pos, latex, displayMode) => openMathModal({ editPos: pos, latex, displayMode })}
                  />
                  <SpellTooltip editor={editor} documentId={documentId} />
                  <IssueTooltip editor={editor} issues={analysis.issues} />
                </div>

                {/* Footer zone — only rendered once document is loaded to prevent blank init on HMR */}
                <div className="border-t border-editor-zone-divider" />
                {doc && (
                  <HeaderFooterEditor
                    zone="footer"
                    documentId={documentId}
                    contentKey={footerContentKey}
                    initialContent={footerContent}
                    onZoneFocus={handleZoneFocus}
                    onZoneBlur={handleZoneBlur}
                    onSaveStatusChange={notifySaveStatus}
                  />
                )}
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
                      globalThis.document.body.style.cursor = 'col-resize'
                      globalThis.document.body.style.userSelect = 'none'
                    }}
                  />
                  {aiPanelOpen && <AiPanel editor={editor} analysis={analysis} />}
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
            document={doc}
            wordCount={wordCount}
            selectionWordCount={selectionWordCount}
            saveStatus={saveStatus}
            zoom={editorZoom}
            onZoomChange={(z) => {
              const clamped = Math.min(200, Math.max(25, z))
              setEditorZoom(clamped)
              localStorage.setItem('prose-editor-zoom', String(clamped))
            }}
            nowPlaying={music.nowPlayingTitle}
            ambientPlaying={(() => {
              const active = AMBIENT_LAYERS.filter((l) => music.ambientEnabled[l.id])
              if (active.length === 0) return null
              if (active.length === 1) return active[0]!.label
              if (active.length === 2) return `${active[0]!.label} + ${active[1]!.label}`
              return `${active.length} Sounds`
            })()}
            onMusicClick={() => {
              setMusicPanelTab('tracks')
              setMusicPanelOpen(true)
            }}
            onAmbientClick={() => {
              setMusicPanelTab('mixer')
              setMusicPanelOpen(true)
            }}
          />
        )}
      </div>

      <AnimatePresence>
        {musicPanelOpen && <MusicPanel music={music} />}
      </AnimatePresence>

      <MathModal
        open={mathModal.open}
        initialLatex={mathModal.initialLatex}
        initialDisplayMode={mathModal.initialDisplayMode}
        onClose={() => setMathModal((s) => ({ ...s, open: false }))}
        onInsert={handleMathInsert}
      />

      <FormatModal
        open={formatModalTarget !== null}
        format={formatModalTarget}
        initialMla={initialMla}
        initialApa={initialApa}
        onClose={() => setFormatModalTarget(null)}
        onApplyMla={handleApplyMla}
        onApplyApa={handleApplyApa}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        documentId={documentId}
        pageMargins={pageMargins}
        onPageMarginsChange={(m) => {
          setPageMargins(m)
          patchDocument({ pageMargins: m })
          void window.prose.documents.update(documentId, { pageMargins: m })
        }}
        onWordListChange={(words) => {
          if (editor && !editor.isDestroyed) {
            editor.view.dispatch(editor.state.tr.setMeta(spellKey, { setIgnored: words }))
          }
        }}
      />
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
