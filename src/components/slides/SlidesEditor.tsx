import { useEffect, useState, useCallback, useRef } from 'react'
import { DashboardTabBar } from '@/components/editor/DashboardTabBar'
import { useDocument } from '@/hooks/useDocument'
import { useAppStore } from '@/store/appStore'
import { useSlideHistory } from '@/hooks/useSlideHistory'
import { useSlideKeyboardShortcuts } from '@/hooks/useSlideKeyboardShortcuts'
import { SlideCanvas } from './canvas/SlideCanvas'
import { SlidePanel } from './panel/SlidePanel'
import { SpeakerNotesPanel } from './panel/SpeakerNotesPanel'
import { SlidesToolbar } from './toolbar/SlidesToolbar'
import { ThemePanel } from './themes/ThemePanel'
import { LayoutPicker } from './layouts/LayoutPicker'
import { SlideMasterEditor } from './master/SlideMasterEditor'
import { SlidesStatusBar } from './SlidesStatusBar'
import { SlideFindBar } from './SlideFindBar'
import { SlidesAIPanel } from './ai/SlidesAIPanel'
import { SLIDE_LAYOUTS } from './layouts/slideLayouts'
import type { LayoutId } from './layouts/slideLayouts'
import type { SlideToolMode } from './toolbar/DefaultToolbar'
import type { Slide, SlideElement, SlidesContent, PresentationTheme, PresentationSettings, SlideMaster } from '@/types/slides'
import { deserializeSlides, createInitialSlidesContent, SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import type { ElementMove, ElementResize, ElementRotate } from './canvas/types'
import type { CanvasToolMode } from './canvas/SlideCanvas'
import { PresentationMode } from './presentation/PresentationMode'
import { SlidesExportModal } from './export/SlidesExportModal'
import { TooltipProvider } from '@/components/ui/tooltip'

interface Props {
  documentId: string
}

function updateSlide(slides: Slide[], idx: number, updater: (s: Slide) => Slide): Slide[] {
  return slides.map((s, i) => (i === idx ? updater(s) : s))
}

function makeTextElement(x: number, y: number, w: number, h: number): SlideElement {
  return {
    id: crypto.randomUUID(), type: 'text',
    x, y, width: w, height: h,
    rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
    content: '', fontFamily: 'Inter', fontSize: 32,
    color: '#1a1a1a', align: 'left', verticalAlign: 'top',
    lineHeight: 1.4, letterSpacing: 0, overflow: 'auto-fit',
  }
}

function makeShapeElement(x: number, y: number, w: number, h: number): SlideElement {
  return {
    id: crypto.randomUUID(), type: 'shape',
    x, y, width: w, height: h,
    rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
    shapeType: 'rect', fill: '#3b82f6',
    border: { color: '#2563eb', width: 2, style: 'solid' },
  }
}

function makeDefaultElement(type: CanvasToolMode, x: number, y: number, w: number, h: number): SlideElement | null {
  switch (type) {
    case 'text':  return makeTextElement(x, y, w, h)
    case 'shape': return makeShapeElement(x, y, w, h)
    case 'image': return {
      id: crypto.randomUUID(), type: 'image',
      x, y, width: w, height: h,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      src: '', altText: '', borderRadius: 0, filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
    }
    case 'table': return {
      id: crypto.randomUUID(), type: 'table',
      x, y, width: w, height: h,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      rows: [
        [{ id: crypto.randomUUID(), content: 'Header 1' }, { id: crypto.randomUUID(), content: 'Header 2' }],
        [{ id: crypto.randomUUID(), content: '' }, { id: crypto.randomUUID(), content: '' }],
      ],
      colWidths: [50, 50], hasHeaderRow: true,
    }
    case 'equation': return {
      id: crypto.randomUUID(), type: 'equation',
      x, y, width: w, height: h,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      latex: 'E = mc^2', fontSize: 32, color: '#1a1a1a',
    }
    case 'code': return {
      id: crypto.randomUUID(), type: 'code',
      x, y, width: w, height: h,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      code: '// your code here', language: 'javascript', theme: 'dark', fontSize: 14,
    }
    case 'video': return {
      id: crypto.randomUUID(), type: 'video',
      x, y, width: w, height: h,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      src: '', autoPlay: false, loop: false, muted: false,
    }
    default: return null
  }
}

export function SlidesEditor({ documentId }: Props): JSX.Element {
  const [slides, setSlides] = useState<Slide[]>([])
  const [theme, setTheme] = useState<PresentationTheme>(createInitialSlidesContent().theme)
  const [settings, setSettings] = useState<PresentationSettings>(createInitialSlidesContent().settings)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [toolMode, setToolMode] = useState<SlideToolMode>('select')
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [showThemePanel, setShowThemePanel] = useState(false)
  const [themePanelAnchor, setThemePanelAnchor] = useState<DOMRect | null>(null)
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const [showMasterEditor, setShowMasterEditor] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [master, setMaster] = useState<SlideMaster>({ elements: [] })
  const [loaded, setLoaded] = useState(false)
  const [showFindBar, setShowFindBar] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(0) // 0 = fit
  const [fitZoom, setFitZoom] = useState(100) // computed fit % from canvas
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'unsaved'>('saved')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elementClipboard = useRef<SlideElement[]>([])
  const slidesRef = useRef(slides)
  useEffect(() => { slidesRef.current = slides }, [slides])

  const { document: doc, notifySaveStatus } = useDocument(documentId)
  const history = useSlideHistory()

  // Keep canUndo/canRedo in sync — slides changes after every mutation and after undo/redo
  useEffect(() => {
    setCanUndo(history.canUndo())
    setCanRedo(history.canRedo())
  }, [slides, history])

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!doc) return
    try {
      const parsed = JSON.parse(doc.content || '{}') as unknown
      const content = deserializeSlides(parsed)
      setSlides(content.slides)
      setTheme(content.theme)
      setSettings(content.settings)
      setMaster(content.master ?? { elements: [] })
    } catch {
      const initial = createInitialSlidesContent()
      setSlides(initial.slides)
      setTheme(initial.theme)
      setSettings(initial.settings)
    }
    setLoaded(true)
    history.clear()
    setSelectedIds([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // ── Auto-save ─────────────────────────────────────────────────────────────────

  const scheduleSave = useCallback((): void => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void flushAndSave(), 1000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const flushAndSave = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    notifySaveStatus('saving')
    setSaveStatus('saving')
    try {
      const content: SlidesContent = { version: 1, slides: slidesRef.current, theme, settings, master }
      await window.prose.documents.update(documentId, { content: JSON.stringify(content) })
      notifySaveStatus('saved')
      setSaveStatus('saved')
    } catch {
      notifySaveStatus('error')
      setSaveStatus('error')
    }
  }, [documentId, theme, settings, notifySaveStatus])

  useEffect(() => {
    const setSave = useAppStore.getState().setSaveActiveDocument
    setSave(() => flushAndSave())
    return () => setSave(null)
  }, [flushAndSave])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  const handleUndo = useCallback((): void => {
    const prev = history.undo(slidesRef.current)
    if (prev) { setSlides(prev); setSelectedIds([]) }
  }, [history])

  const handleRedo = useCallback((): void => {
    const next = history.redo(slidesRef.current)
    if (next) { setSlides(next); setSelectedIds([]) }
  }, [history])

  // ── Mutation helpers ──────────────────────────────────────────────────────────

  const changeActiveSlide = useCallback((updater: (s: Slide) => Slide): void => {
    setSlides((prev) => {
      history.push(prev)
      return updateSlide(prev, activeSlideIndex, updater)
    })
    scheduleSave()
  }, [activeSlideIndex, history, scheduleSave])

  const pendingAddIndexRef = useRef<number>(0)

  const addSlide = useCallback((afterIndex?: number): void => {
    pendingAddIndexRef.current = afterIndex ?? activeSlideIndex
    setShowLayoutPicker(true)
  }, [activeSlideIndex])

  const handleLayoutSelect = useCallback((layoutId: LayoutId): void => {
    const idx = pendingAddIndexRef.current
    const layout = SLIDE_LAYOUTS.find((l) => l.id === layoutId)
    const elements = layout ? layout.createElement(theme) : []
    const newSlide: Slide = { id: crypto.randomUUID(), elements, notes: '', animations: [] }
    setSlides((prev) => {
      history.push(prev)
      const next = [...prev]
      next.splice(idx + 1, 0, newSlide)
      return next
    })
    setActiveSlideIndex(idx + 1)
    setSelectedIds([])
    scheduleSave()
  }, [theme, history, scheduleSave])

  const deleteSlide = useCallback((idx?: number): void => {
    const target = idx ?? activeSlideIndex
    setSlides((prev) => {
      if (prev.length <= 1) return prev
      history.push(prev)
      return prev.filter((_, i) => i !== target)
    })
    setActiveSlideIndex((i) => Math.max(0, Math.min(i, slides.length - 2)))
    setSelectedIds([])
    scheduleSave()
  }, [activeSlideIndex, history, scheduleSave, slides.length])

  const duplicateSlide = useCallback((idx: number): void => {
    setSlides((prev) => {
      history.push(prev)
      const clone: Slide = {
        ...prev[idx]!,
        id: crypto.randomUUID(),
        elements: prev[idx]!.elements.map((e) => ({ ...e, id: crypto.randomUUID() })),
      }
      const next = [...prev]
      next.splice(idx + 1, 0, clone)
      return next
    })
    setActiveSlideIndex(idx + 1)
    setSelectedIds([])
    scheduleSave()
  }, [history, scheduleSave])

  const reorderSlides = useCallback((fromIdx: number, toIdx: number): void => {
    setSlides((prev) => {
      history.push(prev)
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved!)
      return next
    })
    setActiveSlideIndex(toIdx)
    scheduleSave()
  }, [history, scheduleSave])

  // ── Canvas callbacks ──────────────────────────────────────────────────────────

  const handleSelectElement = useCallback((id: string, addToSelection: boolean): void => {
    setSelectedIds((prev) => {
      if (addToSelection) {
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      }
      return prev.includes(id) && prev.length === 1 ? prev : [id]
    })
  }, [])

  const handleMoveElements = useCallback((moves: ElementMove[]): void => {
    setSlides((prev) => {
      history.push(prev)
      return updateSlide(prev, activeSlideIndex, (s) => ({
        ...s,
        elements: s.elements.map((el) => {
          const m = moves.find((mv) => mv.id === el.id)
          return m ? { ...el, x: m.x, y: m.y } : el
        }),
      }))
    })
    scheduleSave()
  }, [activeSlideIndex, history, scheduleSave])

  const handleResizeElement = useCallback((resize: ElementResize): void => {
    changeActiveSlide((s) => ({
      ...s,
      elements: s.elements.map((el) =>
        el.id === resize.id ? { ...el, x: resize.x, y: resize.y, width: resize.width, height: resize.height } : el,
      ),
    }))
  }, [changeActiveSlide])

  const handleRotateElement = useCallback((rot: ElementRotate): void => {
    changeActiveSlide((s) => ({
      ...s,
      elements: s.elements.map((el) => (el.id === rot.id ? { ...el, rotate: rot.rotate } : el)),
    }))
  }, [changeActiveSlide])

  const handleUpdateElement = useCallback((id: string, partial: Partial<SlideElement>): void => {
    changeActiveSlide((s) => ({
      ...s,
      elements: s.elements.map((el) => (el.id === id ? { ...el, ...partial } : el)),
    }))
  }, [changeActiveSlide])

  const handleAlignElements = useCallback((updates: { id: string; x: number; y: number }[]): void => {
    setSlides((prev) => {
      history.push(prev)
      return updateSlide(prev, activeSlideIndex, (s) => ({
        ...s,
        elements: s.elements.map((el) => {
          const u = updates.find((x) => x.id === el.id)
          return u ? { ...el, x: u.x, y: u.y } : el
        }),
      }))
    })
    scheduleSave()
  }, [activeSlideIndex, history, scheduleSave])

  const handleDoubleClickElement = useCallback((id: string): void => {
    if (!id) { setEditingElementId(null); return }
    const el = slides[activeSlideIndex]?.elements.find((e) => e.id === id)
    if (el && (el.type === 'text' || el.type === 'equation' || el.type === 'code' || el.type === 'table')) {
      setEditingElementId(id)
    }
  }, [slides, activeSlideIndex])

  const handleCommitText = useCallback((id: string, content: string): void => {
    setEditingElementId(null)
    changeActiveSlide((s) => ({
      ...s,
      elements: s.elements.map((el) => (el.id === id ? { ...el, content } : el)),
    }))
  }, [changeActiveSlide])

  const handleCommitElement = useCallback((id: string, partial: Partial<SlideElement>): void => {
    setEditingElementId(null)
    changeActiveSlide((s) => ({
      ...s,
      elements: s.elements.map((el) => (el.id === id ? { ...el, ...partial } : el)),
    }))
  }, [changeActiveSlide])

  const handleNotesChange = useCallback((text: string): void => {
    setSlides((prev) => updateSlide(prev, activeSlideIndex, (s) => ({ ...s, notes: text })))
    scheduleSave()
  }, [activeSlideIndex, scheduleSave])

  const handleDrawElement = useCallback((_type: CanvasToolMode, x: number, y: number, width: number, height: number): void => {
    const el = makeDefaultElement(_type, x, y, width, height)
    if (!el) return
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedIds([el.id])
    setToolMode('select')
    if (_type === 'text') setEditingElementId(el.id)
  }, [changeActiveSlide])

  const handleBackground = useCallback((e: React.MouseEvent): void => {
    setThemePanelAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())
    setShowThemePanel((v) => !v)
  }, [])

  const handleApplyTheme = useCallback((newTheme: PresentationTheme, updatedSlides: Slide[]): void => {
    setTheme(newTheme)
    setSlides((prev) => {
      history.push(prev)
      return updatedSlides
    })
    scheduleSave()
  }, [history, scheduleSave])

  const handleMasterChange = useCallback((m: SlideMaster): void => {
    setMaster(m)
    scheduleSave()
  }, [scheduleSave])

  // ── AI panel callbacks ────────────────────────────────────────────────────────

  const handleInsertElement = useCallback((el: SlideElement): void => {
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedIds([el.id])
  }, [changeActiveSlide])

  const handleInsertSlides = useCallback((newSlides: Slide[], afterIndex: number): void => {
    setSlides((prev) => {
      history.push(prev)
      const next = [...prev]
      next.splice(afterIndex + 1, 0, ...newSlides)
      return next
    })
    setActiveSlideIndex(afterIndex + newSlides.length)
    scheduleSave()
  }, [history, scheduleSave])

  const handleReplaceCurrentSlide = useCallback((replacement: Slide): void => {
    setSlides((prev) => {
      history.push(prev)
      return updateSlide(prev, activeSlideIndex, () => replacement)
    })
    scheduleSave()
  }, [activeSlideIndex, history, scheduleSave])

  // Insert shape at center of slide with default size
  const handleInsertShape = useCallback((shapeType: import('@/types/slides').ShapeType): void => {
    const el: SlideElement = {
      id: crypto.randomUUID(), type: 'shape',
      x: 35, y: 35, width: 30, height: 30,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      shapeType, fill: '#3b82f6',
      border: { color: '#2563eb', width: 2, style: 'solid' },
    }
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedIds([el.id])
  }, [changeActiveSlide])

  const handleInsertTable = useCallback((cols: number, rows: number): void => {
    const colWidth = Math.round(100 / cols)
    const colWidths = Array(cols).fill(colWidth)
    const makeCell = () => ({ id: crypto.randomUUID(), content: '' })
    const tableRows = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, () => r === 0 ? { ...makeCell(), style: { bold: true } } : makeCell())
    )
    const el: SlideElement = {
      id: crypto.randomUUID(), type: 'table',
      x: 20, y: 25, width: 60, height: Math.min(50, rows * 8),
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      rows: tableRows, colWidths, hasHeaderRow: true,
    }
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedIds([el.id])
  }, [changeActiveSlide])

  const handleInsertImage = useCallback(async (): Promise<void> => {
    try {
      const filePath = await window.prose.dialog.openImage()
      if (!filePath) return
      const el: SlideElement = {
        id: crypto.randomUUID(), type: 'image',
        x: 25, y: 20, width: 50, height: 60,
        rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
        src: filePath, altText: '', borderRadius: 0,
        filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
      }
      changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }))
      setSelectedIds([el.id])
    } catch {
      // User cancelled or dialog unavailable — silently ignore
    }
  }, [changeActiveSlide])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useSlideKeyboardShortcuts({
    slides,
    activeSlideIndex,
    selectedIds,
    history,
    elementClipboard,
    setSlides,
    setSelectedIds,
    scheduleSave,
    onSave: flushAndSave,
  })

  // ── Clipboard paste (images) ─────────────────────────────────────────────────

  const changeActiveSlideRef = useRef(changeActiveSlide)
  useEffect(() => { changeActiveSlideRef.current = changeActiveSlide }, [changeActiveSlide])

  useEffect(() => {
    function onPaste(e: ClipboardEvent): void {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      const items = Array.from(e.clipboardData?.items ?? [])
      const imageItem = items.find((item) => item.type.startsWith('image/'))
      if (!imageItem) return

      const blob = imageItem.getAsFile()
      if (!blob) return

      const reader = new FileReader()
      reader.onload = () => {
        const src = reader.result as string
        const el: SlideElement = {
          id: crypto.randomUUID(), type: 'image',
          x: 25, y: 20, width: 50, height: 56,
          rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
          src, altText: 'Pasted image', borderRadius: 0,
          filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
        }
        changeActiveSlideRef.current((s) => ({ ...s, elements: [...s.elements, el] }))
        setSelectedIds([el.id])
      }
      reader.readAsDataURL(blob)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // Ctrl+scroll zoom
  useEffect(() => {
    function onWheel(e: WheelEvent): void {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((prev) => {
        const current = prev === 0 ? 90 : prev  // treat fit as ~90%
        const delta = e.deltaY > 0 ? -10 : 10
        const next = Math.max(25, Math.min(400, current + delta))
        return next
      })
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  const enterPresentation = useCallback((): void => {
    setPresenting(true)
  }, [])

  // ── Keyboard tool shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.key === 'F5') { e.preventDefault(); enterPresentation(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setShowFindBar(true); return }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setZoom(0); return }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); setZoom(100); return }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'v': case 'V': setToolMode('select'); break
        case 't': case 'T': setToolMode('text'); break
        case 's': case 'S': setToolMode('shape'); break
        case 'i': case 'I': setToolMode('image'); break
        case 'Escape': setToolMode('select'); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enterPresentation])

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (presenting && slides.length > 0) {
    return (
      <PresentationMode
        slides={slides}
        theme={theme}
        settings={settings}
        master={master}
        startIndex={activeSlideIndex}
        onExit={(idx) => {
          setPresenting(false)
          setActiveSlideIndex(idx)
        }}
      />
    )
  }

  if (!loaded) {
    return (
      <TooltipProvider delayDuration={400}>
        <div className="flex h-screen flex-col bg-background">
          <DashboardTabBar />
          <div className="flex flex-1 items-center justify-center">
            <span className="text-xs text-muted-foreground">Loading…</span>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  const activeSlide = slides[activeSlideIndex] ?? slides[0]
  if (!activeSlide) return <TooltipProvider delayDuration={400}><div className="flex h-screen flex-col bg-background"><DashboardTabBar /></div></TooltipProvider>

  return (
    <TooltipProvider delayDuration={400}>
    <div className="flex h-screen flex-col bg-background text-foreground">
      <DashboardTabBar />

      {/* Toolbar */}
      <SlidesToolbar
        toolMode={toolMode}
        onToolMode={setToolMode}
        slide={activeSlide}
        selectedIds={selectedIds}
        documentId={documentId}
        documentTitle={doc?.title ?? 'Presentation'}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onBackground={handleBackground}
        onUpdateElement={handleUpdateElement}
        onAlignElements={handleAlignElements}
        onInsertShape={handleInsertShape}
        onInsertTable={handleInsertTable}
        onInsertImage={() => void handleInsertImage()}
        onPresent={enterPresentation}
        onEditMaster={() => setShowMasterEditor(true)}
        onExport={() => setShowExportModal(true)}
        onFind={() => setShowFindBar(true)}
        onToggleGrid={() => setShowGrid((v) => !v)}
        gridActive={showGrid}
      />

      {/* Main area */}
      <div className="relative flex min-h-0 flex-1">
        {/* Left panel: slide list */}
        <SlidePanel
          slides={slides}
          theme={theme}
          settings={settings}
          activeIndex={activeSlideIndex}
          onNavigate={(idx) => { setActiveSlideIndex(idx); setSelectedIds([]) }}
          onAddSlide={() => addSlide()}
          onDeleteSlide={deleteSlide}
          onDuplicateSlide={duplicateSlide}
          onReorderSlides={reorderSlides}
        />

        {/* Center: canvas + speaker notes */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Find bar */}
          {showFindBar && (
            <div className="relative h-0">
              <SlideFindBar
                slides={slides}
                onNavigate={(idx) => { setActiveSlideIndex(idx); setSelectedIds([]) }}
                onClose={() => setShowFindBar(false)}
              />
            </div>
          )}
          <SlideCanvas
            slide={activeSlide}
            theme={theme}
            settings={settings}
            selectedIds={selectedIds}
            toolMode={toolMode}
            onSelectElement={handleSelectElement}
            onDeselectAll={() => setSelectedIds([])}
            editingElementId={editingElementId}
            onDoubleClickElement={handleDoubleClickElement}
            onCommitText={handleCommitText}
            onCommitElement={handleCommitElement}
            onMoveElements={handleMoveElements}
            onResizeElement={handleResizeElement}
            onRotateElement={handleRotateElement}
            onMarqueeSelect={setSelectedIds}
            onDrawElement={handleDrawElement}
            master={master}
            showGrid={showGrid}
            zoom={zoom}
            onFitZoomChange={setFitZoom}
          />

          <SpeakerNotesPanel
            notes={activeSlide.notes}
            onChange={handleNotesChange}
          />
        </div>

        {/* Right: AI panel */}
        {aiPanelOpen && (
          <SlidesAIPanel
            slide={activeSlide}
            slides={slides}
            activeSlideIndex={activeSlideIndex}
            theme={theme}
            settings={settings}
            onClose={() => setAiPanelOpen(false)}
            onUpdateNotes={handleNotesChange}
            onUpdateElement={handleUpdateElement}
            onInsertElement={handleInsertElement}
            onInsertSlides={handleInsertSlides}
            onReplaceCurrentSlide={handleReplaceCurrentSlide}
          />
        )}
      </div>

      {/* Status bar */}
      <SlidesStatusBar
        activeSlideIndex={activeSlideIndex}
        totalSlides={slides.length}
        activeSlide={activeSlide}
        zoom={zoom}
        fitZoom={fitZoom}
        saveStatus={saveStatus}
        onZoomChange={setZoom}
      />

      {/* Theme panel */}
      {showThemePanel && themePanelAnchor && (
        <ThemePanel
          theme={theme}
          slides={slides}
          onApplyTheme={handleApplyTheme}
          onClose={() => setShowThemePanel(false)}
          anchorRect={themePanelAnchor}
        />
      )}

      {/* Layout picker */}
      {showLayoutPicker && (
        <LayoutPicker
          theme={theme}
          onSelect={handleLayoutSelect}
          onClose={() => setShowLayoutPicker(false)}
        />
      )}

      {/* Export modal */}
      {showExportModal && (
        <SlidesExportModal
          content={{ version: 1, slides, theme, settings, master }}
          title={doc?.title ?? 'Presentation'}
          activeSlideIndex={activeSlideIndex}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Slide master editor */}
      {showMasterEditor && (
        <SlideMasterEditor
          master={master}
          theme={theme}
          onChange={handleMasterChange}
          onClose={() => setShowMasterEditor(false)}
        />
      )}
    </div>
    </TooltipProvider>
  )
}
