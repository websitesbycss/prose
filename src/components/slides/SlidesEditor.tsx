import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
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
import { SlidesStatusBar } from './SlidesStatusBar'
import { SlideFindBar } from './SlideFindBar'
import { SlidesAIPanel } from './ai/SlidesAIPanel'
import { AnimationsPanel } from './animations/AnimationsPanel'
import { SLIDE_LAYOUTS } from './layouts/slideLayouts'
import type { LayoutId } from './layouts/slideLayouts'
import type { SlideToolMode } from './toolbar/DefaultToolbar'
import type { Slide, SlideElement, TextElement, SlidesContent, PresentationTheme, PresentationSettings, ElementAnimation, TransitionType, TransitionDirection } from '@/types/slides'
import { deserializeSlides, createInitialSlidesContent, SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT, getSlideBaseSize } from '@/types/slides'
import type { ElementMove, ElementResize, ElementRotate } from './canvas/types'
import type { CanvasToolMode } from './canvas/SlideCanvas'
import type { SnapSettings } from './canvas/snapUtils'
import type { AppSettings } from '@/types'
import { cloneSlide } from './slideClone'
import { PresentationMode } from './presentation/PresentationMode'
import { SlidesExportModal } from './export/SlidesExportModal'
import { TooltipProvider } from '@/components/ui/tooltip'
import SettingsModal from '@/components/settings/SettingsModal'
import { useMusicContext } from '@/contexts/MusicContext'
import { AMBIENT_LAYERS } from '@/hooks/useMusic'
import { useIsActiveTab } from '@/hooks/useIsActiveTab'
import { useForceRepaintOnMount } from '@/hooks/useForceRepaintOnMount'
import { AUTO_SAVE_DEBOUNCE_MS } from '@/constants'
import { ChartPickerDialog } from '@/components/shared/ChartPickerDialog'
import type { ChartSnapshot } from '@/lib/chartSnapshot'
import { runThumbnailGenerationOnce, downscaleToThumbnail } from '@/lib/thumbnailGeneration'
import { rasterizeSlide } from './export/slideRasterizer'
import { SlidesContextMenu } from './SlidesContextMenu'
import type { SlideContextMenuCtx, AlignKind } from './SlidesContextMenu'
import { bumpZIndex, rotateElementsBy, flipElements, setLocked, groupElements, ungroupElements } from './slideElementOps'
import type { OrderDirection } from './slideElementOps'
import { SlideBackgroundLayer } from './canvas/SlideBackground'
import { getAnimationName } from './presentation/SlideTransition'
import { renderSlideElement } from './elements/renderSlideElement'
import { AnimatedSlideElements } from './animations/AnimatedSlideElements'
import { useSlideAnimationPlayback } from '@/lib/slideAnimationPlayback'
import { clampAnimationDelay, clampAnimationDuration } from '@/types/slides'

interface Props {
  documentId: string
}

function updateSlide(slides: Slide[], idx: number, updater: (s: Slide) => Slide): Slide[] {
  return slides.map((s, i) => (i === idx ? updater(s) : s))
}

function makeTextElement(x: number, y: number, w: number, h: number): TextElement {
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
        [{ id: crypto.randomUUID(), content: '' }, { id: crypto.randomUUID(), content: '' }],
        [{ id: crypto.randomUUID(), content: '' }, { id: crypto.randomUUID(), content: '' }],
      ],
      colWidths: [50, 50],
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
  const isActive = useIsActiveTab(documentId)
  const setSaveActiveDocument = useAppStore((s) => s.setSaveActiveDocument)
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
  const [showExportModal, setShowExportModal] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [showFindBar, setShowFindBar] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(0) // 0 = fit
  const [fitZoom, setFitZoom] = useState(100) // computed fit % from canvas
  const [canvasRect, setCanvasRect] = useState<{ width: number; height: number; top: number; left: number } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({ enabled: true, toCanvas: true, toElements: true, equalSpacing: true })
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'unsaved'>('saved')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [pendingShapeType, setPendingShapeType] = useState<import('@/types/slides').ShapeType | null>(null)
  const [pendingTableConfig, setPendingTableConfig] = useState<{ cols: number; rows: number } | null>(null)
  const [tableSelectedCells, setTableSelectedCells] = useState<string[]>([])
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const slidesAnimationsPanelOpen = useAppStore((s) => s.slidesAnimationsPanelOpen)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const setSlidesAnimationsPanelOpen = useAppStore((s) => s.setSlidesAnimationsPanelOpen)
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setMusicPanelTab = useAppStore((s) => s.setMusicPanelTab)
  const [rightPanelWidth, setRightPanelWidth] = useState(340)
  // Width normally animates on open/close (see the motion.div below), but
  // that transition must be suppressed while actively drag-resizing — else
  // every mousemove retargets a 0.2s eased animation and the panel edge lags
  // behind the cursor instead of tracking it 1:1.
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false)
  const rightPanelDragRef = useRef<{ x: number; width: number } | null>(null)
  const rightPanelWidthRef = useRef(340)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  useForceRepaintOnMount(rightPanelRef)
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(null)
  const [previewNonce, setPreviewNonce] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)

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
  const themeRef = useRef(theme)
  useEffect(() => { themeRef.current = theme }, [theme])
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { rightPanelWidthRef.current = rightPanelWidth }, [rightPanelWidth])

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

  // ── Snap settings ─────────────────────────────────────────────────────────────

  const loadSnapSettings = useCallback((): void => {
    void window.prose.settings.get().then((s) => {
      const appSettings = s as AppSettings
      setSnapSettings({
        enabled: appSettings.slidesSnapEnabled ?? true,
        toCanvas: appSettings.slidesSnapToCanvas ?? true,
        toElements: appSettings.slidesSnapToElements ?? true,
        equalSpacing: appSettings.slidesSnapEqualSpacing ?? true,
      })
      const width = appSettings.slidesRightPanelWidth
      if (typeof width === 'number' && Number.isFinite(width)) {
        const clamped = Math.max(260, Math.min(560, Math.round(width)))
        setRightPanelWidth(clamped)
        rightPanelWidthRef.current = clamped
      }
    })
  }, [])

  useEffect(() => { loadSnapSettings() }, [loadSnapSettings])

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (!rightPanelDragRef.current) return
      const delta = rightPanelDragRef.current.x - e.clientX
      const width = Math.max(260, Math.min(560, rightPanelDragRef.current.width + delta))
      setRightPanelWidth(width)
      rightPanelWidthRef.current = width
    }
    function onMouseUp(): void {
      if (!rightPanelDragRef.current) return
      rightPanelDragRef.current = null
      setIsResizingRightPanel(false)
      void window.prose.settings.set({ slidesRightPanelWidth: rightPanelWidthRef.current })
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

  // ── Auto-save ─────────────────────────────────────────────────────────────────

  const flushAndSave = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    notifySaveStatus('saving')
    setSaveStatus('saving')
    try {
      const content: SlidesContent = {
        version: 1,
        slides: slidesRef.current,
        theme: themeRef.current,
        settings: settingsRef.current,
      }
      await window.prose.documents.update(documentId, { content: JSON.stringify(content) })
      notifySaveStatus('saved')
      setSaveStatus('saved')
    } catch {
      notifySaveStatus('error')
      setSaveStatus('error')
    }
  }, [documentId, notifySaveStatus])

  const scheduleSave = useCallback((): void => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void flushAndSave(), AUTO_SAVE_DEBOUNCE_MS)
  }, [flushAndSave])

  useEffect(() => {
    if (!isActive) return
    setSaveActiveDocument(async () => { await flushAndSave() })
    return () => setSaveActiveDocument(null)
  }, [isActive, flushAndSave, setSaveActiveDocument])

  useEffect(() => () => {
    if (saveTimerRef.current) void flushAndSave()
  }, [flushAndSave])

  // Thumbnail generation — fired by the main process after every successful
  // content auto-save. Always rasterizes slide 0, never the currently active
  // slide, via the same offscreen html2canvas pipeline already used for
  // PNG/PPTX export, then downscales the 1920x1080 capture to the standard
  // 560x315 thumbnail size.
  useEffect(() => {
    return window.prose.thumbnails.onGenerate((fileId) => {
      if (fileId !== documentId) return
      void runThumbnailGenerationOnce(fileId, async () => {
        const firstSlide = slidesRef.current[0]
        if (!firstSlide) return
        if (firstSlide.elements.length === 0 && !firstSlide.background) return

        const dataUrl = await rasterizeSlide(firstSlide, themeRef.current)
        const base64 = await downscaleToThumbnail(dataUrl)
        await window.prose.thumbnails.save(fileId, base64)
      })
    })
  }, [documentId])

  const handleUndo = useCallback((): void => {
    const prev = history.undo(slidesRef.current)
    if (prev) {
      setSlides(prev.slides)
      setSelectedIds([])
      scheduleSave()
    }
  }, [history, scheduleSave])

  const handleRedo = useCallback((): void => {
    const next = history.redo(slidesRef.current)
    if (next) {
      setSlides(next.slides)
      setSelectedIds([])
      scheduleSave()
    }
  }, [history, scheduleSave])

  // ── Mutation helpers ──────────────────────────────────────────────────────────

  const pushHistory = useCallback((slides: Slide[]): void => {
    history.push(slides)
  }, [history])

  const changeActiveSlide = useCallback((updater: (s: Slide) => Slide): void => {
    setSlides((prev) => {
      pushHistory(prev)
      return updateSlide(prev, activeSlideIndex, updater)
    })
    scheduleSave()
  }, [activeSlideIndex, pushHistory, scheduleSave])

  const pendingAddIndexRef = useRef<number>(0)

  const addSlide = useCallback((afterIndex?: number): void => {
    pendingAddIndexRef.current = afterIndex ?? activeSlideIndex
    setShowLayoutPicker(true)
  }, [activeSlideIndex])

  const insertBlankSlide = useCallback((afterIndex: number): void => {
    const blankLayout = SLIDE_LAYOUTS.find((l) => l.id === 'blank')
    const elements = blankLayout ? blankLayout.createElement(theme) : []
    const newSlide: Slide = { id: crypto.randomUUID(), elements, notes: '', animations: [] }
    setSlides((prev) => {
      pushHistory(prev)
      const next = [...prev]
      next.splice(afterIndex + 1, 0, newSlide)
      return next
    })
    setActiveSlideIndex(afterIndex + 1)
    setSelectedIds([])
    scheduleSave()
  }, [theme, pushHistory, scheduleSave])

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
      pushHistory(prev)
      if (prev.length <= 1) {
        return [{
          id: prev[0]!.id,
          elements: [],
          notes: '',
          animations: [],
          background: undefined,
          transition: undefined,
        }]
      }
      return prev.filter((_, i) => i !== target)
    })
    setActiveSlideIndex((i) => {
      if (slides.length <= 1) return 0
      if (target < i) return i - 1
      if (target === i) return Math.max(0, Math.min(i, slides.length - 2))
      return i
    })
    setSelectedIds([])
    scheduleSave()
  }, [activeSlideIndex, pushHistory, scheduleSave, slides.length])

  const duplicateSlide = useCallback((idx: number): void => {
    setSlides((prev) => {
      pushHistory(prev)
      const clone = cloneSlide(prev[idx]!)
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

  const addAnimation = useCallback((elementId: string): void => {
    changeActiveSlide((s) => ({
      ...s,
      animations: [
        ...s.animations,
        {
          id: crypto.randomUUID(),
          elementId,
          category: 'entrance',
          effect: 'fade-in',
          duration: 500,
          delay: 0,
          trigger: 'click',
        },
      ],
    }))
  }, [changeActiveSlide])

  const updateAnimation = useCallback((id: string, patch: Partial<ElementAnimation>): void => {
    changeActiveSlide((s) => ({
      ...s,
      animations: s.animations.map((animation) => (
        animation.id !== id
          ? animation
          : {
            ...animation,
            ...patch,
            duration: patch.duration !== undefined ? clampAnimationDuration(patch.duration) : animation.duration,
            delay: patch.delay !== undefined ? clampAnimationDelay(patch.delay) : animation.delay,
          }
      )),
    }))
  }, [changeActiveSlide])

  const removeAnimation = useCallback((id: string): void => {
    changeActiveSlide((s) => ({ ...s, animations: s.animations.filter((animation) => animation.id !== id) }))
    setSelectedAnimationId((current) => (current === id ? null : current))
  }, [changeActiveSlide])

  const reorderAnimations = useCallback((fromIdx: number, toIdx: number): void => {
    if (fromIdx === toIdx) return
    changeActiveSlide((s) => {
      const next = [...s.animations]
      const [moved] = next.splice(fromIdx, 1)
      if (!moved) return s
      next.splice(toIdx, 0, moved)
      return { ...s, animations: next }
    })
  }, [changeActiveSlide])

  const updateSlideTransition = useCallback((patch: { type?: TransitionType; direction?: TransitionDirection; duration?: number }): void => {
    changeActiveSlide((s) => ({
      ...s,
      transition: {
        type: patch.type ?? s.transition?.type ?? 'none',
        direction: patch.direction ?? s.transition?.direction,
        duration: patch.duration ?? s.transition?.duration ?? 500,
      },
    }))
  }, [changeActiveSlide])

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
      elements: s.elements.map((el) => (el.id === id ? ({ ...el, ...partial } as SlideElement) : el)),
    }))
  }, [changeActiveSlide])

  const handleBatchUpdateElements = useCallback((ids: string[], partial: Partial<SlideElement>): void => {
    changeActiveSlide((s) => ({
      ...s,
      elements: s.elements.map((el) => (ids.includes(el.id) ? ({ ...el, ...partial } as SlideElement) : el)),
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
      elements: s.elements.map((el) => (el.id === id ? ({ ...el, ...partial } as SlideElement) : el)),
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
      const makeCell = (): { id: string; content: string } => ({ id: crypto.randomUUID(), content: '' })
      const tableRows = Array.from({ length: cfg.rows }, () =>
        Array.from({ length: cfg.cols }, () => makeCell())
      )
      el = {
        id: crypto.randomUUID(), type: 'table',
        x, y, width, height,
        rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
        rows: tableRows, colWidths,
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

  // ── Context menu ──────────────────────────────────────────────────────────────

  const [slideCtxMenu, setSlideCtxMenu] = useState<SlideContextMenuCtx | null>(null)

  // Each slide tab keeps its own mounted SlidesEditor (hidden via CSS, not
  // unmounted) — but the context menu portals straight to document.body, which
  // escapes that hidden ancestor. Without this it would stay visible, floating
  // over whatever tab you switch to.
  useEffect(() => { if (!isActive) setSlideCtxMenu(null) }, [isActive])

  const handleElementContextMenu = useCallback((e: React.MouseEvent, id: string): void => {
    const slide = slidesRef.current[activeSlideIndex]
    const el = slide?.elements.find((x) => x.id === id)
    if (slide && el) {
      if (el.groupId) {
        setSelectedIds(slide.elements.filter((x) => x.groupId === el.groupId).map((x) => x.id))
      } else if (!(selectedIds.includes(id) && selectedIds.length > 1)) {
        setSelectedIds([id])
      }
    }
    setSlideCtxMenu({ x: e.clientX, y: e.clientY, targetKind: 'element' })
  }, [activeSlideIndex, selectedIds])

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent): void => {
    setSelectedIds([])
    setSlideCtxMenu({ x: e.clientX, y: e.clientY, targetKind: 'canvas' })
  }, [])

  const handleSelectAllElements = useCallback((): void => {
    const slide = slidesRef.current[activeSlideIndex]
    if (!slide) return
    setSelectedIds(slide.elements.filter((el) => !el.locked && !el.hidden).map((el) => el.id))
  }, [activeSlideIndex])

  const handleCopySelected = useCallback((): void => {
    const slide = slidesRef.current[activeSlideIndex]
    if (!slide) return
    elementClipboard.current = slide.elements.filter((el) => selectedIds.includes(el.id)).map((el) => ({ ...el }))
  }, [activeSlideIndex, selectedIds])

  const handleCutSelected = useCallback((): void => {
    handleCopySelected()
    changeActiveSlide((s) => ({ ...s, elements: s.elements.filter((el) => !selectedIds.includes(el.id)) }))
    setSelectedIds([])
  }, [handleCopySelected, changeActiveSlide, selectedIds])

  const handlePasteClipboard = useCallback((): void => {
    if (elementClipboard.current.length === 0) return
    const pasted = elementClipboard.current.map((el) => ({ ...el, id: crypto.randomUUID(), x: el.x + 2, y: el.y + 2, zIndex: el.zIndex + 1 }))
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, ...pasted] }))
    setSelectedIds(pasted.map((el) => el.id))
  }, [changeActiveSlide])

  const handlePasteWithoutFormatting = useCallback(async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      const el = makeTextElement(10, 10, 50, 20)
      el.content = escaped
      changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }))
      setSelectedIds([el.id])
    } catch {
      toast.error('Cannot read clipboard')
    }
  }, [changeActiveSlide])

  const handleDuplicateSelected = useCallback((): void => {
    const slide = slidesRef.current[activeSlideIndex]
    if (!slide) return
    const duped = slide.elements
      .filter((el) => selectedIds.includes(el.id))
      .map((el) => ({ ...el, id: crypto.randomUUID(), x: el.x + 2, y: el.y + 2, zIndex: el.zIndex + 1 }))
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, ...duped] }))
    setSelectedIds(duped.map((el) => el.id))
  }, [activeSlideIndex, selectedIds, changeActiveSlide])

  const handleDeleteSelected = useCallback((): void => {
    changeActiveSlide((s) => ({ ...s, elements: s.elements.filter((el) => !selectedIds.includes(el.id)) }))
    setSelectedIds([])
  }, [changeActiveSlide, selectedIds])

  const handleToggleLockSelected = useCallback((): void => {
    const slide = slidesRef.current[activeSlideIndex]
    if (!slide) return
    const els = slide.elements.filter((el) => selectedIds.includes(el.id))
    const allLocked = els.length > 0 && els.every((el) => el.locked)
    changeActiveSlide((s) => ({ ...s, elements: setLocked(s.elements, selectedIds, !allLocked) }))
  }, [activeSlideIndex, selectedIds, changeActiveSlide])

  const handleGroupSelected = useCallback((): void => {
    changeActiveSlide((s) => ({ ...s, elements: groupElements(s.elements, selectedIds) }))
  }, [changeActiveSlide, selectedIds])

  const handleUngroupSelected = useCallback((): void => {
    changeActiveSlide((s) => ({ ...s, elements: ungroupElements(s.elements, selectedIds) }))
  }, [changeActiveSlide, selectedIds])

  const handleOrderSelected = useCallback((direction: OrderDirection): void => {
    changeActiveSlide((s) => ({ ...s, elements: bumpZIndex(s.elements, selectedIds, direction) }))
  }, [changeActiveSlide, selectedIds])

  const handleRotateSelectedBy = useCallback((deg: number): void => {
    changeActiveSlide((s) => ({ ...s, elements: rotateElementsBy(s.elements, selectedIds, deg) }))
  }, [changeActiveSlide, selectedIds])

  const handleFlipSelected = useCallback((axis: 'h' | 'v'): void => {
    changeActiveSlide((s) => ({ ...s, elements: flipElements(s.elements, selectedIds, axis) }))
  }, [changeActiveSlide, selectedIds])

  const handleContextAlign = useCallback((type: AlignKind): void => {
    const slide = slidesRef.current[activeSlideIndex]
    if (!slide) return
    const els = slide.elements.filter((e) => selectedIds.includes(e.id))
    if (els.length === 0) return
    const allSameGroup = els.length > 1 && els.every((e) => e.groupId && e.groupId === els[0]!.groupId)

    if (els.length === 1 || allSameGroup) {
      const minX = Math.min(...els.map((e) => e.x))
      const maxX = Math.max(...els.map((e) => e.x + e.width))
      const minY = Math.min(...els.map((e) => e.y))
      const maxY = Math.max(...els.map((e) => e.y + e.height))
      const w = maxX - minX
      const h = maxY - minY
      let targetX = minX
      let targetY = minY
      if (type === 'left') targetX = 0
      else if (type === 'center-h') targetX = 50 - w / 2
      else if (type === 'right') targetX = 100 - w
      else if (type === 'top') targetY = 0
      else if (type === 'center-v') targetY = 50 - h / 2
      else if (type === 'bottom') targetY = 100 - h
      const dx = targetX - minX
      const dy = targetY - minY
      handleAlignElements(els.map((e) => ({ id: e.id, x: e.x + dx, y: e.y + dy })))
      return
    }

    // Multiple ungrouped elements: align relative to the selection's bounding box, or distribute.
    const minX = Math.min(...els.map((e) => e.x))
    const maxX = Math.max(...els.map((e) => e.x + e.width))
    const minY = Math.min(...els.map((e) => e.y))
    const maxY = Math.max(...els.map((e) => e.y + e.height))

    if (type === 'dist-h') {
      const sorted = [...els].sort((a, b) => a.x - b.x)
      const totalW = sorted.reduce((s, e) => s + e.width, 0)
      const gap = (maxX - minX - totalW) / (sorted.length - 1)
      let cursor = minX
      const updates = sorted.map((e) => { const u = { id: e.id, x: cursor, y: e.y }; cursor += e.width + gap; return u })
      handleAlignElements(updates)
      return
    }
    if (type === 'dist-v') {
      const sorted = [...els].sort((a, b) => a.y - b.y)
      const totalH = sorted.reduce((s, e) => s + e.height, 0)
      const gap = (maxY - minY - totalH) / (sorted.length - 1)
      let cursor = minY
      const updates = sorted.map((e) => { const u = { id: e.id, x: e.x, y: cursor }; cursor += e.height + gap; return u })
      handleAlignElements(updates)
      return
    }

    const updates = els.map((e) => {
      if (type === 'left') return { id: e.id, x: minX, y: e.y }
      if (type === 'center-h') return { id: e.id, x: (minX + maxX) / 2 - e.width / 2, y: e.y }
      if (type === 'right') return { id: e.id, x: maxX - e.width, y: e.y }
      if (type === 'top') return { id: e.id, x: e.x, y: minY }
      if (type === 'center-v') return { id: e.id, x: e.x, y: (minY + maxY) / 2 - e.height / 2 }
      return { id: e.id, x: e.x, y: maxY - e.height } // bottom
    })
    handleAlignElements(updates)
  }, [activeSlideIndex, selectedIds, handleAlignElements])

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

  const handleSlideBackground = useCallback((color: string): void => {
    changeActiveSlide((s) => ({ ...s, background: { type: 'solid' as const, color } }))
  }, [changeActiveSlide])

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

  const [chartPickerOpen, setChartPickerOpen] = useState(false)

  const handleChartSnapshotSelected = useCallback((snapshot: ChartSnapshot): void => {
    // Slide x/y/width/height are percentages of SLIDE_BASE_WIDTH and
    // SLIDE_BASE_HEIGHT independently — those aren't equal (16:9), so the chart's
    // true pixel aspect ratio must be corrected by the slide's aspect ratio,
    // not applied directly to the width%/height% pair.
    const imgAspect = snapshot.width / snapshot.height
    const slideAspect = SLIDE_BASE_WIDTH / SLIDE_BASE_HEIGHT
    let elemWidth = 50
    let elemHeight = (elemWidth * slideAspect) / imgAspect
    if (elemHeight > 70) {
      elemHeight = 70
      elemWidth = (elemHeight * imgAspect) / slideAspect
    }

    const el: SlideElement = {
      id: crypto.randomUUID(), type: 'image',
      x: Math.max(0, (100 - elemWidth) / 2),
      y: Math.max(0, (100 - elemHeight) / 2),
      width: elemWidth, height: elemHeight,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      src: snapshot.dataUrl, altText: '', borderRadius: 0,
      filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
    }
    changeActiveSlide((s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedIds([el.id])
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
    // Every open Slides tab stays mounted (hidden via CSS), so each instance's
    // own `window` keydown listener would otherwise fire even while a
    // different tab is the one actually focused — gate on tab-active state,
    // not just the preview overlay.
    disabled: previewOpen || !isActive,
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
        const img = new window.Image()
        const finish = (natW: number, natH: number): void => {
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
            src, altText: 'Pasted image', borderRadius: 0,
            filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
          }
          changeActiveSlideRef.current((s) => ({ ...s, elements: [...s.elements, el] }))
          setSelectedIds([el.id])
        }
        img.onload = () => finish(img.naturalWidth || 16, img.naturalHeight || 9)
        img.onerror = () => finish(16, 9)
        img.src = src
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
    if (presenting) return
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.key === 'F5') { e.preventDefault(); enterPresentation(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setShowFindBar(true); return }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setZoom(0); return }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); setZoom(100); return }
      if ((e.ctrlKey || e.metaKey) && e.key === "'") { e.preventDefault(); setShowGrid((v) => !v); return }
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
  }, [presenting, enterPresentation])

  useEffect(() => {
    const current = slides[activeSlideIndex]
    if (!current) return
    if (selectedAnimationId && !current.animations.some((animation) => animation.id === selectedAnimationId)) {
      setSelectedAnimationId(null)
    }
  }, [activeSlideIndex, selectedAnimationId, slides])

  // ── Loading state ─────────────────────────────────────────────────────────────
  // Presentation mode renders as an overlay below (not an early return here) —
  // an early return would unmount the whole editor tree, including the AI
  // panel, wiping its chat/generate state every time someone presents. Instead
  // the normal editor stays mounted underneath, just hidden via CSS.

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

  const selectedElementId = selectedIds.length === 1 ? selectedIds[0]! : null
  const rightPanelOpen = aiPanelOpen || slidesAnimationsPanelOpen

  return (
    <TooltipProvider delayDuration={400}>
    {presenting && slides.length > 0 && (
      <PresentationMode
        slides={slides}
        theme={theme}
        settings={settings}
        startIndex={activeSlideIndex}
        onExit={(idx) => {
          setPresenting(false)
          setActiveSlideIndex(idx)
        }}
      />
    )}
    <div className={cn('flex h-screen flex-col bg-background text-foreground', presenting && 'hidden')}>
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
        onBatchUpdateElements={handleBatchUpdateElements}
        onAlignElements={handleAlignElements}
        onInsertShape={handleInsertShape}
        onInsertTable={handleInsertTable}
        onInsertImage={() => void handleInsertImage()}
        onInsertChart={() => setChartPickerOpen(true)}
        onPresent={enterPresentation}
        onToggleAnimations={() => setSlidesAnimationsPanelOpen(!slidesAnimationsPanelOpen)}
        animationsPanelOpen={slidesAnimationsPanelOpen}
        onExport={() => setShowExportModal(true)}
        onFind={() => setShowFindBar(true)}
        onToggleGrid={() => setShowGrid((v) => !v)}
        gridActive={showGrid}
        onSettingsOpen={() => setSettingsOpen(true)}
        pendingShapeType={pendingShapeType}
        pendingTableConfig={pendingTableConfig}
        editingElementId={editingElementId}
        tableSelectedCells={tableSelectedCells}
        slideBackgroundColor={activeSlide.background?.type === 'solid' ? activeSlide.background.color : theme.backgroundColor}
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
          onAddSlide={() => addSlide(activeSlideIndex)}
          onInsertBlankSlide={insertBlankSlide}
          onDeleteSlide={deleteSlide}
          onDuplicateSlide={duplicateSlide}
          onReorderSlides={reorderSlides}
        />

        {/* Center: canvas + speaker notes */}
        <div className="relative flex min-w-0 flex-1 flex-col">
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
            onElementContextMenu={handleElementContextMenu}
            onCanvasContextMenu={handleCanvasContextMenu}
            showGrid={showGrid}
            zoom={zoom}
            onFitZoomChange={setFitZoom}
            onCanvasRectChange={setCanvasRect}
            pendingShapeType={pendingShapeType}
            pendingTableConfig={pendingTableConfig}
            onTableCellSelect={setTableSelectedCells}
            snapSettings={snapSettings}
          />

          {previewOpen && canvasRect && (
            <SlidePreviewOverlay
              key={`${activeSlide.id}:${previewNonce}`}
              slide={activeSlide}
              theme={theme}
              settings={settings}
              canvasRect={canvasRect}
              onClose={() => setPreviewOpen(false)}
            />
          )}

          <SpeakerNotesPanel
            notes={activeSlide.notes}
            onChange={handleNotesChange}
          />

        </div>

        {/* Right: shared AI / animations panel. Both panels stay mounted at
            all times — width/opacity/position animate instead of anything
            mounting or unmounting — so switching between them, closing this
            panel, or presenting never wipes the AI panel's chat/generate
            state. It only ever resets when this SlidesEditor instance itself
            unmounts (file closed) or the app restarts. Quick 0.12s slide from
            the right, same feel as the music panel's tab crossfade. */}
        <motion.div
          ref={rightPanelRef}
          className="relative shrink-0 overflow-hidden border-l border-border"
          initial={false}
          animate={{ width: rightPanelOpen ? rightPanelWidth : 0 }}
          transition={{ duration: isResizingRightPanel ? 0 : 0.12, ease: 'easeOut' }}
          style={{ pointerEvents: rightPanelOpen ? 'auto' : 'none' }}
        >
          <div
            className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/30"
            onMouseDown={(e) => {
              rightPanelDragRef.current = { x: e.clientX, width: rightPanelWidth }
              setIsResizingRightPanel(true)
              globalThis.document.body.style.cursor = 'col-resize'
              globalThis.document.body.style.userSelect = 'none'
            }}
          />
          <motion.div
            className="absolute inset-0"
            style={{ pointerEvents: aiPanelOpen ? 'auto' : 'none' }}
            initial={false}
            animate={{ opacity: aiPanelOpen ? 1 : 0, x: aiPanelOpen ? 0 : 16 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
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
              onUpdateCurrentSlide={changeActiveSlide}
            />
          </motion.div>
          <motion.div
            className="absolute inset-0"
            style={{ pointerEvents: slidesAnimationsPanelOpen ? 'auto' : 'none' }}
            initial={false}
            animate={{ opacity: slidesAnimationsPanelOpen ? 1 : 0, x: slidesAnimationsPanelOpen ? 0 : 16 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <AnimationsPanel
              slide={activeSlide}
              selectedElementId={selectedElementId}
              selectedAnimationId={selectedAnimationId}
              onSelectAnimation={setSelectedAnimationId}
              onAddAnimation={addAnimation}
              onRemoveAnimation={removeAnimation}
              onUpdateAnimation={updateAnimation}
              onReorderAnimations={reorderAnimations}
              onUpdateTransition={updateSlideTransition}
              onPreview={() => {
                setPreviewNonce((value) => value + 1)
                setPreviewOpen(true)
              }}
            />
          </motion.div>
        </motion.div>
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
          content={{ version: 1, slides, theme, settings }}
          title={doc?.title ?? 'Presentation'}
          activeSlideIndex={activeSlideIndex}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {chartPickerOpen && (
        <ChartPickerDialog
          open={chartPickerOpen}
          onClose={() => setChartPickerOpen(false)}
          onSelect={handleChartSnapshotSelected}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => { setSettingsOpen(false); loadSnapSettings() }}
          isSlides
        />
      )}

      <SlidesContextMenu
        ctx={slideCtxMenu}
        onDismiss={() => setSlideCtxMenu(null)}
        elements={activeSlide.elements}
        selectedIds={selectedIds}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSelectAll={handleSelectAllElements}
        onPaste={handlePasteClipboard}
        onPasteWithoutFormatting={() => void handlePasteWithoutFormatting()}
        onCut={handleCutSelected}
        onCopy={handleCopySelected}
        onDuplicate={handleDuplicateSelected}
        onDelete={handleDeleteSelected}
        onAlign={handleContextAlign}
        onOrder={handleOrderSelected}
        onRotateBy={handleRotateSelectedBy}
        onFlip={handleFlipSelected}
        onToggleLock={handleToggleLockSelected}
        onGroup={handleGroupSelected}
        onUngroup={handleUngroupSelected}
      />
    </div>
    </TooltipProvider>
  )
}

function SlidePreviewOverlay({
  slide,
  theme,
  settings,
  canvasRect,
  onClose,
}: {
  slide: Slide
  theme: PresentationTheme
  settings: PresentationSettings
  canvasRect: { width: number; height: number; top: number; left: number }
  onClose: () => void
}): JSX.Element {
  const hasTransition = !!slide.transition && slide.transition.type !== 'none'
  const [phase, setPhase] = useState<'transition' | 'animations'>(hasTransition ? 'transition' : 'animations')
  // mode:'preview' auto-advances "on click" steps after a short pause so the
  // whole sequence plays without requiring clicks — startPaused holds it
  // until the transition (played separately, below) finishes first.
  const playback = useSlideAnimationPlayback(slide, { mode: 'preview', startPaused: phase === 'transition' })
  const scale = canvasRect.width / getSlideBaseSize(settings).baseW
  const sortedElements = useMemo(() => [...slide.elements].sort((a, b) => a.zIndex - b.zIndex), [slide.elements])
  const transitionDuration = slide.transition?.duration ?? 400

  useEffect(() => {
    if (phase !== 'transition') return
    const t = setTimeout(() => setPhase('animations'), transitionDuration)
    return () => clearTimeout(t)
  }, [phase, transitionDuration])

  useEffect(() => {
    if (!playback.isComplete) return
    const timer = setTimeout(() => onClose(), 450)
    return () => clearTimeout(timer)
  }, [onClose, playback.isComplete])

  // Click anywhere on the preview, or the usual "advance" keys, move things
  // along — skip straight past the transition if it's still playing,
  // otherwise advance the animation sequence.
  function handleAdvance(): void {
    if (phase === 'transition') { setPhase('animations'); return }
    playback.advance()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!['ArrowRight', 'ArrowDown', 'Enter', ' '].includes(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      handleAdvance()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const slideContent = (
    <>
      <SlideBackgroundLayer background={slide.background} theme={theme} />
      <div className="absolute inset-0">
        <AnimatedSlideElements
          elements={sortedElements.filter((element) => !element.hidden)}
          visibleElementIds={playback.visibleElementIds}
          activeAnimationByElement={playback.activeAnimationByElement}
          onElementAnimationEnd={playback.onElementAnimationEnd}
          renderElement={(element) => renderSlideElement(element, scale, true)}
        />
      </div>
    </>
  )

  return (
    <div
      className="fixed z-20 overflow-hidden"
      style={{
        top: canvasRect.top,
        left: canvasRect.left,
        width: canvasRect.width,
        height: canvasRect.height,
        boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
      }}
      onClick={handleAdvance}
    >
      <div
        className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span>Preview playing</span>
        <button className="rounded px-1.5 py-0.5 text-foreground hover:bg-accent" onClick={onClose}>Stop</button>
      </div>
      {phase === 'transition' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            animation: `${getAnimationName(slide.transition?.type ?? 'none', slide.transition?.direction, 'forward')} ${transitionDuration}ms ease-out forwards`,
          }}
        >
          {slideContent}
        </div>
      ) : slideContent}
    </div>
  )
}
