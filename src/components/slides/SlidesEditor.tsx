import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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
import SettingsModal from '@/components/settings/SettingsModal'
import { useMusicContext } from '@/contexts/MusicContext'
import { AMBIENT_LAYERS } from '@/hooks/useMusic'

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
  const [masterSelectedIds, setMasterSelectedIds] = useState<string[]>([])
  const [masterEditingElementId, setMasterEditingElementId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showFindBar, setShowFindBar] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(0) // 0 = fit
  const [fitZoom, setFitZoom] = useState(100) // computed fit % from canvas
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'unsaved'>('saved')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [pendingShapeType, setPendingShapeType] = useState<import('@/types/slides').ShapeType | null>(null)
  const [pendingTableConfig, setPendingTableConfig] = useState<{ cols: number; rows: number } | null>(null)
  const [tableSelectedCells, setTableSelectedCells] = useState<string[]>([])
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setMusicPanelTab = useAppStore((s) => s.setMusicPanelTab)

  const music = useMusicContext()
  const activeAmbient = AMBIENT_LAYERS.filter((l) => music?.ambientEnabled[l.id])
  const ambientPlaying =
    activeAmbient.length === 0 ? null
    : activeAmbient.length === 1 ? activeAmbient[0]!.label
    : activeAmbient.length === 2 ? `${activeAmbient[0]!.label} + ${activeAmbient[1]!.label}`
    : `${activeAmbient.length} Sounds`

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elementClipboard = useRef<SlideElement[]>([])
  const slidesRef = useRef(slides)
  useEffect(() => { slidesRef.current = slides }, [slides])
  const masterRef = useRef<SlideMaster>(master)
  useEffect(() => { masterRef.current = master }, [master])

  const { document: doc, notifySaveStatus } = useDocument(documentId)
  const history = useSlideHistory()

  // Keep canUndo/canRedo in sync — slides changes after every mutation and after undo/redo
  useEffect(() => {
    setCanUndo(history.canUndo())
    setCanRedo(history.canRedo())
  }, [slides, history])

  // Clear pending shape/table type when tool mode changes away from that mode
  useEffect(() => {
    if (toolMode !== 'shape') setPendingShapeType(null)
    if (toolMode !== 'table') setPendingTableConfig(null)
  }, [toolMode])

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
    const prev = history.undo(slidesRef.current, masterRef.current)
    if (prev) { setSlides(prev.slides); setMaster(prev.master); setSelectedIds([]) }
  }, [history])

  const handleRedo = useCallback((): void => {
    const next = history.redo(slidesRef.current, masterRef.current)
    if (next) { setSlides(next.slides); setMaster(next.master); setSelectedIds([]) }
  }, [history])

  // ── Mutation helpers ──────────────────────────────────────────────────────────

  const pushHistory = useCallback((slides: Slide[]): void => {
    history.push(slides, masterRef.current)
  }, [history])

  const changeActiveSlide = useCallback((updater: (s: Slide) => Slide): void => {
    setSlides((prev) => {
      pushHistory(prev)
      return updateSlide(prev, activeSlideIndex, updater)
    })
    scheduleSave()
  }, [activeSlideIndex, pushHistory, scheduleSave])

  const changeMaster = useCallback((updater: (m: SlideMaster) => SlideMaster): void => {
    setMaster((prev) => {
      history.push(slidesRef.current, prev)
      return updater(prev)
    })
    scheduleSave()
  }, [history, scheduleSave])

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
      pushHistory(prev)
      const next = [...prev]
      next.splice(idx + 1, 0, newSlide)
      return next
    })
    setActiveSlideIndex(idx + 1)
    setSelectedIds([])
    scheduleSave()
  }, [theme, pushHistory, scheduleSave])

  const deleteSlide = useCallback((idx?: number): void => {
    const target = idx ?? activeSlideIndex
    setSlides((prev) => {
      if (prev.length <= 1) return prev
      pushHistory(prev)
      return prev.filter((_, i) => i !== target)
    })
    setActiveSlideIndex((i) => Math.max(0, Math.min(i, slides.length - 2)))
    setSelectedIds([])
    scheduleSave()
  }, [activeSlideIndex, pushHistory, scheduleSave, slides.length])

  const duplicateSlide = useCallback((idx: number): void => {
    setSlides((prev) => {
      pushHistory(prev)
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
  }, [pushHistory, scheduleSave])

  const reorderSlides = useCallback((fromIdx: number, toIdx: number): void => {
    setSlides((prev) => {
      pushHistory(prev)
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved!)
      return next
    })
    setActiveSlideIndex(toIdx)
    scheduleSave()
  }, [pushHistory, scheduleSave])

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
      pushHistory(prev)
      return updateSlide(prev, activeSlideIndex, (s) => ({
        ...s,
        elements: s.elements.map((el) => {
          const m = moves.find((mv) => mv.id === el.id)
          return m ? { ...el, x: m.x, y: m.y } : el
        }),
      }))
    })
    scheduleSave()
  }, [activeSlideIndex, pushHistory, scheduleSave])

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
      pushHistory(prev)
      return updateSlide(prev, activeSlideIndex, (s) => ({
        ...s,
        elements: s.elements.map((el) => {
          const u = updates.find((x) => x.id === el.id)
          return u ? { ...el, x: u.x, y: u.y } : el
        }),
      }))
    })
    scheduleSave()
  }, [activeSlideIndex, pushHistory, scheduleSave])

  const handleDoubleClickElement = useCallback((id: string): void => {
    if (!id) { setEditingElementId(null); setTableSelectedCells([]); return }
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
    setTableSelectedCells([])
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
    let el: SlideElement | null = null
    if (_type === 'shape') {
      const shapeType = pendingShapeType ?? 'rect'
      el = {
        id: crypto.randomUUID(), type: 'shape',
        x, y, width, height,
        rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
        shapeType, fill: '#3b82f6',
        border: { color: '#2563eb', width: 2, style: 'solid' },
      }
      setPendingShapeType(null)
    } else if (_type === 'table') {
      const cfg = pendingTableConfig ?? { cols: 2, rows: 2 }
      const colW = Math.floor(100 / cfg.cols)
      const colWidths = Array.from({ length: cfg.cols }, (_, i) =>
        i < cfg.cols - 1 ? colW : 100 - colW * (cfg.cols - 1)
      )
      const makeCell = () => ({ id: crypto.randomUUID(), content: '' })
      const tableRows = Array.from({ length: cfg.rows }, (_, r) =>
        Array.from({ length: cfg.cols }, () => r === 0 ? { ...makeCell(), style: { bold: true } } : makeCell())
      )
      el = {
        id: crypto.randomUUID(), type: 'table',
        x, y, width, height,
        rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
        rows: tableRows, colWidths, hasHeaderRow: true,
      }
      setPendingTableConfig(null)
    } else {
      el = makeDefaultElement(_type, x, y, width, height)
    }
    if (!el) return
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el!] }))
    setSelectedIds([el.id])
    setToolMode('select')
    if (_type === 'text') setEditingElementId(el.id)
  }, [changeActiveSlide, pendingShapeType, pendingTableConfig])

  const handleBackground = useCallback((e: React.MouseEvent): void => {
    setThemePanelAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())
    setShowThemePanel((v) => !v)
  }, [])

  const handleApplyTheme = useCallback((newTheme: PresentationTheme, updatedSlides: Slide[]): void => {
    setTheme(newTheme)
    setSlides((prev) => {
      pushHistory(prev)
      return updatedSlides
    })
    scheduleSave()
  }, [pushHistory, scheduleSave])

  const handleMasterChange = useCallback((m: SlideMaster): void => {
    setMaster(m)
    scheduleSave()
  }, [scheduleSave])

  // ── Master canvas callbacks ───────────────────────────────────────────────────

  const handleMasterSelectElement = useCallback((id: string, add: boolean): void => {
    setMasterSelectedIds((prev) => {
      if (add) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      return prev.includes(id) && prev.length === 1 ? prev : [id]
    })
  }, [])

  const handleMasterDoubleClickElement = useCallback((id: string): void => {
    if (!id) { setMasterEditingElementId(null); return }
    const el = masterRef.current.elements.find((e) => e.id === id)
    if (el && (el.type === 'text' || el.type === 'equation' || el.type === 'code' || el.type === 'table')) {
      setMasterEditingElementId(id)
    }
  }, [])

  const handleMasterMoveElements = useCallback((moves: ElementMove[]): void => {
    changeMaster((m) => ({
      ...m,
      elements: m.elements.map((el) => {
        const mv = moves.find((x) => x.id === el.id)
        return mv ? { ...el, x: mv.x, y: mv.y } : el
      }),
    }))
  }, [changeMaster])

  const handleMasterResizeElement = useCallback((resize: ElementResize): void => {
    changeMaster((m) => ({
      ...m,
      elements: m.elements.map((el) =>
        el.id === resize.id ? { ...el, x: resize.x, y: resize.y, width: resize.width, height: resize.height } : el
      ),
    }))
  }, [changeMaster])

  const handleMasterRotateElement = useCallback((rot: ElementRotate): void => {
    changeMaster((m) => ({
      ...m,
      elements: m.elements.map((el) => (el.id === rot.id ? { ...el, rotate: rot.rotate } : el)),
    }))
  }, [changeMaster])

  const handleMasterUpdateElement = useCallback((id: string, partial: Partial<SlideElement>): void => {
    changeMaster((m) => ({
      ...m,
      elements: m.elements.map((el) => (el.id === id ? { ...el, ...partial } : el)),
    }))
  }, [changeMaster])

  const handleMasterAlignElements = useCallback((updates: { id: string; x: number; y: number }[]): void => {
    changeMaster((m) => ({
      ...m,
      elements: m.elements.map((el) => {
        const u = updates.find((x) => x.id === el.id)
        return u ? { ...el, x: u.x, y: u.y } : el
      }),
    }))
  }, [changeMaster])

  const handleMasterCommitText = useCallback((id: string, content: string): void => {
    setMasterEditingElementId(null)
    changeMaster((m) => ({
      ...m,
      elements: m.elements.map((el) => (el.id === id ? { ...el, content } : el)),
    }))
  }, [changeMaster])

  const handleMasterCommitElement = useCallback((id: string, partial: Partial<SlideElement>): void => {
    setMasterEditingElementId(null)
    changeMaster((m) => ({
      ...m,
      elements: m.elements.map((el) => (el.id === id ? { ...el, ...partial } : el)),
    }))
  }, [changeMaster])

  const handleMasterDrawElement = useCallback((_type: CanvasToolMode, x: number, y: number, width: number, height: number): void => {
    let el: SlideElement | null = null
    if (_type === 'shape') {
      const shapeType = pendingShapeType ?? 'rect'
      el = {
        id: crypto.randomUUID(), type: 'shape',
        x, y, width, height,
        rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
        shapeType, fill: '#3b82f6', border: { color: '#2563eb', width: 2, style: 'solid' },
      }
      setPendingShapeType(null)
    } else {
      el = makeDefaultElement(_type, x, y, width, height)
    }
    if (!el) return
    changeMaster((m) => ({ ...m, elements: [...m.elements, el!] }))
    setMasterSelectedIds([el.id])
    setToolMode('select')
    if (_type === 'text') setMasterEditingElementId(el.id)
  }, [changeMaster, pendingShapeType])

  const handleMasterInsertImage = useCallback(async (): Promise<void> => {
    try {
      const filePath = await window.prose.dialog.openImage()
      if (!filePath) return
      const { w: natW, h: natH } = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new window.Image()
        const timer = setTimeout(() => resolve({ w: 16, h: 9 }), 2000)
        img.onload = () => { clearTimeout(timer); resolve({ w: img.naturalWidth || 16, h: img.naturalHeight || 9 }) }
        img.onerror = () => { clearTimeout(timer); resolve({ w: 16, h: 9 }) }
        img.src = filePath
      })
      const aspect = natW / natH
      const elemWidth = 50
      const elemHeight = Math.min(70, elemWidth / aspect)
      const finalWidth = elemHeight < 70 ? elemWidth : elemHeight * aspect
      const el: SlideElement = {
        id: crypto.randomUUID(), type: 'image',
        x: Math.max(0, (100 - finalWidth) / 2),
        y: Math.max(0, (100 - elemHeight) / 2),
        width: finalWidth, height: elemHeight,
        rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
        src: filePath, altText: '', borderRadius: 0,
        filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
      }
      changeMaster((m) => ({ ...m, elements: [...m.elements, el] }))
      setMasterSelectedIds([el.id])
    } catch { }
  }, [changeMaster])

  const masterSlide = useMemo(() => ({
    id: 'master' as const,
    elements: master.elements,
    background: master.background,
    notes: '',
    animations: [] as never[],
  }), [master])

  const handleSlideBackground = useCallback((color: string): void => {
    if (showMasterEditor) {
      changeMaster((m) => ({ ...m, background: { type: 'solid' as const, color } }))
    } else {
      changeActiveSlide((s) => ({ ...s, background: { type: 'solid' as const, color } }))
    }
  }, [showMasterEditor, changeMaster, changeActiveSlide])

  // ── AI panel callbacks ────────────────────────────────────────────────────────

  const handleInsertElement = useCallback((el: SlideElement): void => {
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedIds([el.id])
  }, [changeActiveSlide])

  const handleInsertSlides = useCallback((newSlides: Slide[], afterIndex: number): void => {
    setSlides((prev) => {
      pushHistory(prev)
      const next = [...prev]
      next.splice(afterIndex + 1, 0, ...newSlides)
      return next
    })
    setActiveSlideIndex(afterIndex + newSlides.length)
    scheduleSave()
  }, [pushHistory, scheduleSave])

  const handleReplaceCurrentSlide = useCallback((replacement: Slide): void => {
    setSlides((prev) => {
      pushHistory(prev)
      return updateSlide(prev, activeSlideIndex, () => replacement)
    })
    scheduleSave()
  }, [activeSlideIndex, pushHistory, scheduleSave])

  // Arm shape tool — user then clicks or drags to place
  const handleInsertShape = useCallback((shapeType: import('@/types/slides').ShapeType): void => {
    setPendingShapeType(shapeType)
    setToolMode('shape')
  }, [])

  // Arm table tool — user then clicks or drags to place
  const handleInsertTable = useCallback((cols: number, rows: number): void => {
    setPendingTableConfig({ cols, rows })
    setToolMode('table')
  }, [])

  const handleInsertImage = useCallback(async (): Promise<void> => {
    try {
      const filePath = await window.prose.dialog.openImage()
      if (!filePath) return

      // Detect aspect ratio from image
      const { w: natW, h: natH } = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new window.Image()
        const timer = setTimeout(() => resolve({ w: 16, h: 9 }), 2000)
        img.onload = () => { clearTimeout(timer); resolve({ w: img.naturalWidth || 16, h: img.naturalHeight || 9 }) }
        img.onerror = () => { clearTimeout(timer); resolve({ w: 16, h: 9 }) }
        img.src = filePath
      })
      const aspect = natW / natH
      const elemWidth = 50
      const elemHeight = Math.min(70, elemWidth / aspect)
      const finalWidth = elemHeight < 70 ? elemWidth : elemHeight * aspect

      const el: SlideElement = {
        id: crypto.randomUUID(), type: 'image',
        x: Math.max(0, (100 - finalWidth) / 2),
        y: Math.max(0, (100 - elemHeight) / 2),
        width: finalWidth, height: elemHeight,
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
    masterRef,
    setMaster,
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
        slide={showMasterEditor ? masterSlide as never : activeSlide}
        selectedIds={showMasterEditor ? masterSelectedIds : selectedIds}
        documentId={documentId}
        documentTitle={doc?.title ?? 'Presentation'}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onBackground={handleBackground}
        onUpdateElement={showMasterEditor ? handleMasterUpdateElement : handleUpdateElement}
        onAlignElements={showMasterEditor ? handleMasterAlignElements : handleAlignElements}
        onInsertShape={handleInsertShape}
        onInsertTable={handleInsertTable}
        onInsertImage={showMasterEditor ? () => void handleMasterInsertImage() : () => void handleInsertImage()}
        onPresent={showMasterEditor ? undefined : enterPresentation}
        onEditMaster={showMasterEditor ? undefined : () => setShowMasterEditor(true)}
        onExport={showMasterEditor ? undefined : () => setShowExportModal(true)}
        onFind={showMasterEditor ? undefined : () => setShowFindBar(true)}
        onToggleGrid={() => setShowGrid((v) => !v)}
        gridActive={showGrid}
        onSettingsOpen={() => setSettingsOpen(true)}
        pendingShapeType={pendingShapeType}
        pendingTableConfig={pendingTableConfig}
        editingElementId={showMasterEditor ? masterEditingElementId : editingElementId}
        tableSelectedCells={showMasterEditor ? [] : tableSelectedCells}
        slideBackgroundColor={showMasterEditor
          ? (master.background?.type === 'solid' ? master.background.color : theme.backgroundColor)
          : (activeSlide.background?.type === 'solid' ? activeSlide.background.color : theme.backgroundColor)
        }
        onSlideBackground={handleSlideBackground}
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
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Find bar */}
          {!showMasterEditor && showFindBar && (
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
            pendingShapeType={pendingShapeType}
            pendingTableConfig={pendingTableConfig}
            onTableCellSelect={setTableSelectedCells}
          />

          <SpeakerNotesPanel
            notes={activeSlide.notes}
            onChange={handleNotesChange}
          />

          {/* Slide master overlay */}
          {showMasterEditor && (
            <SlideMasterEditor
              master={master}
              theme={theme}
              settings={settings}
              toolMode={toolMode}
              selectedIds={masterSelectedIds}
              editingElementId={masterEditingElementId}
              onSelectElement={handleMasterSelectElement}
              onDeselectAll={() => setMasterSelectedIds([])}
              onDoubleClickElement={handleMasterDoubleClickElement}
              onCommitText={handleMasterCommitText}
              onCommitElement={handleMasterCommitElement}
              onMoveElements={handleMasterMoveElements}
              onResizeElement={handleMasterResizeElement}
              onRotateElement={handleMasterRotateElement}
              onMarqueeSelect={setMasterSelectedIds}
              onDrawElement={handleMasterDrawElement}
              onClose={() => { setShowMasterEditor(false); setMasterSelectedIds([]); setMasterEditingElementId(null) }}
              showGrid={showGrid}
              zoom={zoom}
              onFitZoomChange={setFitZoom}
              pendingShapeType={pendingShapeType}
              pendingTableConfig={pendingTableConfig}
              onTableCellSelect={setTableSelectedCells}
            />
          )}
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
        nowPlaying={music?.nowPlayingTitle ?? null}
        ambientPlaying={ambientPlaying}
        onMusicClick={() => { setMusicPanelTab('tracks'); setMusicPanelOpen(true) }}
        onAmbientClick={() => { setMusicPanelTab('mixer'); setMusicPanelOpen(true) }}
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

      {settingsOpen && (
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
    </TooltipProvider>
  )
}
