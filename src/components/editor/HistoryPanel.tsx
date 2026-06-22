import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
import { Link } from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import {
  CustomTableRow,
  CustomTableHeader,
  CustomTableCell,
  TableCellAttributes,
} from '@/extensions/tableExtensions'
import { FontSize } from '@/extensions/fontSize'
import { Indent } from '@/extensions/indent'
import { PageNumberNode } from '@/extensions/pageNumber'
import { LineHeight } from '@/extensions/lineHeight'
import { ParagraphRole } from '@/extensions/paragraphRole'
import { RightTab, TabToRightAlign } from '@/extensions/rightTab'
import type { Editor } from '@tiptap/react'
import type { Snapshot, AppSettings } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DEFAULT_PAGE_MARGINS } from '@/constants'

const PAGE_WIDTH_PX = 816   // 8.5" at 96 dpi

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fmtTime(d: Date): string {
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${m}${ampm}`
}

function fmtDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} hour${diffH === 1 ? '' : 's'} ago`
  const d = new Date(dateStr)
  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return `Yesterday ${fmtTime(d)}`
  return `${fmtDate(d)} ${fmtTime(d)}`
}

// ---------------------------------------------------------------------------
// Read-only Tiptap preview
// ---------------------------------------------------------------------------

const ZONE_EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

function hasZoneContent(content: string | null): boolean {
  if (!content) return false
  try {
    const doc = JSON.parse(content) as { content?: Array<{ type: string; content?: unknown[] }> }
    const nodes = doc.content ?? []
    if (nodes.length === 0) return false
    if (nodes.length === 1 && nodes[0]?.type === 'paragraph' && !nodes[0]?.content?.length) return false
    return true
  } catch {
    return false
  }
}

function ZonePreview({ content, fontFamily, fontSize }: {
  content: string | null
  fontFamily: string
  fontSize: number
}): JSX.Element {
  const parsed = (() => {
    if (!content) return null
    try { return JSON.parse(content) as object } catch { return null }
  })()

  const zoneEditor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, bulletList: false, orderedList: false, listItem: false, link: false, underline: false }),
      Underline, Subscript, Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle, FontFamily, FontSize, Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Indent, LineHeight,
      RightTab, TabToRightAlign,
      PageNumberNode,
    ],
    content: parsed ?? ZONE_EMPTY_DOC,
    editable: false,
    immediatelyRender: true,
  })

  if (!parsed) return <></>

  return (
    <EditorContent
      editor={zoneEditor}
      className="header-footer-editor pb-1.5 outline-none pointer-events-none"
      style={{
        paddingLeft: 'var(--page-margin-left, var(--page-margin-x, 96px))',
        paddingRight: 'var(--page-margin-right, var(--page-margin-x, 96px))',
        '--prose-editor-font-family': fontFamily,
        '--prose-editor-font-size': `${fontSize}pt`,
      } as React.CSSProperties}
    />
  )
}

function SnapshotPreviewEditor({
  content,
  format,
  fontFamily,
  fontSize,
  headerContent,
  footerContent,
  pageMargins = DEFAULT_PAGE_MARGINS,
}: {
  content: string
  format: string
  fontFamily: string
  fontSize: number
  headerContent: string | null
  footerContent: string | null
  pageMargins?: { top: number; right: number; bottom: number; left: number }
}): JSX.Element {
  const parsed = (() => {
    try { return JSON.parse(content) as object } catch { return '' }
  })()

  const previewEditor = useEditor({
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
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: false }),
      CustomTableRow,
      CustomTableHeader,
      CustomTableCell,
      TableCellAttributes,
      Indent,
      PageNumberNode,
      LineHeight,
      ParagraphRole,
    ],
    content: parsed,
    editable: false,
    immediatelyRender: true,
  })

  const formatClass = format === 'mla' ? 'format-mla' : format === 'apa' ? 'format-apa' : ''

  const showHeader = hasZoneContent(headerContent)
  const showFooter = hasZoneContent(footerContent)

  const marginStyle = {
    '--page-margin-left': `${Math.round(pageMargins.left * 96)}px`,
    '--page-margin-right': `${Math.round(pageMargins.right * 96)}px`,
    '--page-margin-top': `${Math.round(pageMargins.top * 96)}px`,
    '--page-margin-bottom': `${Math.round(pageMargins.bottom * 96)}px`,
  } as React.CSSProperties

  return (
    <div
      className={cn('editor-page relative bg-editor-page', formatClass)}
      style={marginStyle}
    >
      {showHeader && (
        <>
          <div style={{ paddingTop: Math.round(pageMargins.top * 96 / 2) }}>
            <ZonePreview content={headerContent} fontFamily={fontFamily} fontSize={fontSize} />
          </div>
          <div className="border-b border-editor-zone-divider" />
        </>
      )}
      <div
        className="min-h-[900px]"
        style={{
          paddingLeft: 'var(--page-margin-left)',
          paddingRight: 'var(--page-margin-right)',
          paddingTop: showHeader ? Math.round(pageMargins.top * 96 / 2) : 'var(--page-margin-top)',
          paddingBottom: showFooter ? Math.round(pageMargins.bottom * 96 / 2) : 'var(--page-margin-bottom)',
          '--prose-editor-font-family': fontFamily,
          '--prose-editor-font-size': `${fontSize}pt`,
        } as React.CSSProperties}
      >
        <EditorContent editor={previewEditor} className="prose-editor min-h-full outline-none pointer-events-none" />
      </div>
      {showFooter && (
        <>
          <div className="border-t border-editor-zone-divider" />
          <div style={{ paddingBottom: Math.round(pageMargins.bottom * 96 / 2) }}>
            <ZonePreview content={footerContent} fontFamily={fontFamily} fontSize={fontSize} />
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HistoryPanelProps {
  documentId: string
  editor: Editor | null
  format?: string
  pageMargins?: { top: number; right: number; bottom: number; left: number }
  pollSnapshots?: boolean
  onBeforeRestore?: () => void
  onRestore?: (headerContent: string | null, footerContent: string | null, content: string) => void
}

export function HistoryPanel({ documentId, editor, format = 'none', pageMargins = DEFAULT_PAGE_MARGINS, pollSnapshots = true, onBeforeRestore, onRestore }: HistoryPanelProps): JSX.Element {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const pinnedCurrentIdRef = useRef<string | null>(null)
  const skipPinClearRef = useRef(false)
  const [previewFontFamily, setPreviewFontFamily] = useState('Calibri')
  const [previewFontSize, setPreviewFontSize] = useState(11)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(1)

  // Fit preview to dialog width (not page height) so the full document scrolls naturally
  useEffect(() => {
    if (!previewOpen) return
    void window.prose.settings.get().then((s) => {
      const appSettings = s as AppSettings
      if (appSettings.editorFontFamily) setPreviewFontFamily(appSettings.editorFontFamily)
      if (appSettings.editorFontSize) setPreviewFontSize(appSettings.editorFontSize)
    })
    const el = previewContainerRef.current
    if (!el) return
    const compute = (): void => {
      setPreviewScale(Math.min((el.clientWidth - 64) / PAGE_WIDTH_PX, 1))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [previewOpen, selectedId])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const snaps = await window.prose.snapshots.getByDocument(documentId)
      setSnapshots(snaps)
      setSelectedId((prev) => {
        if (prev && snaps.some((s) => s.id === prev)) return prev
        return snaps.length > 0 ? (snaps[0]?.id ?? null) : null
      })
      setCurrentSnapshotId((prev) => {
        const pinned = pinnedCurrentIdRef.current
        if (pinned && snaps.some((s) => s.id === pinned)) return pinned
        if (prev && snaps.some((s) => s.id === prev)) return prev
        pinnedCurrentIdRef.current = null
        return snaps[0]?.id ?? null
      })
    } catch {
      setSnapshots([])
      setSelectedId(null)
      setCurrentSnapshotId(null)
      pinnedCurrentIdRef.current = null
    } finally {
      if (!silent) setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    setSnapshots([])
    setSelectedId(null)
    setCurrentSnapshotId(null)
    pinnedCurrentIdRef.current = null
    setConfirmClear(false)
    setConfirmRestore(false)
    void load()
  }, [documentId, load])

  useEffect(() => {
    const onSnapshot = (): void => { void load(true) }
    window.addEventListener('prose-snapshot-created', onSnapshot)
    return () => window.removeEventListener('prose-snapshot-created', onSnapshot)
  }, [load])

  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    if (!pollSnapshots) return
    const id = setInterval(() => { void loadRef.current(true) }, 20_000)
    return () => clearInterval(id)
  }, [pollSnapshots])

  // After the user edits post-restore, resume tracking the newest snapshot as current
  useEffect(() => {
    if (!editor) return
    const onEdit = (): void => {
      if (skipPinClearRef.current) return
      if (!pinnedCurrentIdRef.current) return
      pinnedCurrentIdRef.current = null
      setCurrentSnapshotId(snapshots[0]?.id ?? null)
    }
    editor.on('update', onEdit)
    return () => { editor.off('update', onEdit) }
  }, [editor, snapshots])

  const selected = snapshots.find((s) => s.id === selectedId) ?? null
  const selectedIsCurrent = selected?.id === currentSnapshotId

  function handleRestore(): void {
    if (!selected) return

    const snapshot = selected
    setConfirmRestore(false)
    setPreviewOpen(false)
    onBeforeRestore?.()

    void window.prose.snapshots.restore(snapshot.id)
      .then(() => {
        pinnedCurrentIdRef.current = snapshot.id
        setCurrentSnapshotId(snapshot.id)
        if (editor) {
          skipPinClearRef.current = true
          try {
            editor.commands.setContent(JSON.parse(snapshot.content) as object, false)
          } catch {
            editor.commands.setContent('')
          }
          skipPinClearRef.current = false
        }
        onRestore?.(snapshot.headerContent ?? null, snapshot.footerContent ?? null, snapshot.content)
        toast.success('Version restored')
      })
      .catch(() => {
        pinnedCurrentIdRef.current = null
        void load(true)
        toast.error('Restore failed')
      })
  }

  async function handleClearAll(): Promise<void> {
    try {
      await window.prose.snapshots.deleteAll(documentId)
      setSnapshots([])
      setSelectedId(null)
      setCurrentSnapshotId(null)
      pinnedCurrentIdRef.current = null
      setConfirmClear(false)
    } catch {
      toast.error('Failed to clear history')
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
        <span className="text-xs font-medium">Version History</span>
        {!confirmClear ? (
          <button
            className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setConfirmClear(true)}
            disabled={snapshots.length === 0}
          >
            clear
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">are you sure?</span>
            <button
              className="text-[10px] font-medium text-destructive hover:underline"
              onClick={() => void handleClearAll()}
            >
              yes, clear
            </button>
            <button
              className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setConfirmClear(false)}
            >
              cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Snapshot list ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-1">
        {loading && (
          <div className="flex flex-col gap-2 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-muted/30" />
                <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted/30" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && snapshots.length === 0 && (
          <p className="mt-4 px-2 text-center text-[11px] leading-relaxed text-muted-foreground/60">
            No history yet — save with Ctrl+S or keep writing; snapshots are created automatically.
          </p>
        )}

        {!loading && snapshots.length > 0 && (
          <div className="flex flex-col">
            {snapshots.map((snap, idx) => {
              const isLast = idx === snapshots.length - 1
              const isSelected = snap.id === selectedId
              const isCurrent = snap.id === currentSnapshotId
              const saveType = snap.label === 'manual' ? 'manual save' : 'auto-saved'

              return (
                <div key={snap.id} className="flex items-stretch gap-2">
                  {/* Timeline column */}
                  <div className="flex w-4 shrink-0 flex-col items-center">
                    <div
                      className="mt-[9px] h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: isCurrent
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--muted-foreground) / 0.2)',
                      }}
                    />
                    {!isLast && (
                      <div
                        className="my-0.5 w-px flex-1 bg-border"
                        style={{ minHeight: 18 }}
                      />
                    )}
                  </div>

                  {/* Row button */}
                  <button
                    className={cn(
                      'mb-0.5 flex flex-1 items-start justify-between rounded-md px-2 py-1.5 text-left transition-colors',
                      isSelected
                        ? 'border border-primary/20 bg-primary/[0.08]'
                        : 'hover:bg-muted/30'
                    )}
                    onClick={() => setSelectedId(snap.id)}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium leading-tight text-foreground">
                        {relativeTime(snap.createdAt)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {snap.wordCount.toLocaleString()} words · {saveType}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'ml-2 mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium',
                        isCurrent
                          ? 'border-primary/25 bg-primary/[0.12] text-primary/80'
                          : 'border-border bg-muted/10 text-muted-foreground/50'
                      )}
                    >
                      {isCurrent ? 'current' : 'auto'}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="shrink-0 border-t border-border px-3 py-2.5">
        {confirmRestore ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-muted-foreground">
              Are you sure? This will overwrite your current version.
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-1 border-primary/25 bg-primary/[0.12] text-[11px] text-primary/80 hover:bg-primary/20 hover:text-primary"
                onClick={handleRestore}
              >
                confirm restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-muted-foreground"
                onClick={() => setConfirmRestore(false)}
              >
                cancel
              </Button>
            </div>
          </div>
        ) : !selectedIsCurrent ? (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-[11px]"
              disabled={!selected}
              onClick={() => setPreviewOpen(true)}
            >
              preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 border-primary/25 bg-primary/[0.12] text-[11px] text-primary/80 hover:bg-primary/20 hover:text-primary"
              disabled={!selected}
              onClick={() => setConfirmRestore(true)}
            >
              restore
            </Button>
          </div>
        ) : (
          <p className="text-center text-[10px] text-muted-foreground/50">
            select an older version to preview or restore
          </p>
        )}
      </div>

      {/* ── Full preview modal ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] w-[900px] max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle className="text-sm font-medium">
              {selected ? relativeTime(selected.createdAt) : 'Preview'}
              {selected && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  · {selected.wordCount.toLocaleString()} words
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div
            ref={previewContainerRef}
            className="min-h-0 flex-1 overflow-auto bg-editor-canvas"
          >
            <div
              className="mx-auto my-8 w-[816px]"
              style={{ zoom: previewScale }}
            >
              {selected && (
                <SnapshotPreviewEditor
                  key={selected.id}
                  content={selected.content}
                  format={format}
                  fontFamily={previewFontFamily}
                  fontSize={previewFontSize}
                  headerContent={selected.headerContent}
                  footerContent={selected.footerContent}
                  pageMargins={pageMargins}
                />
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-border px-5 py-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-primary/25 bg-primary/[0.12] text-primary/80 hover:bg-primary/20 hover:text-primary"
              disabled={!selected}
              onClick={handleRestore}
            >
              Restore this version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
