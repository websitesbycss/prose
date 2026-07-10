import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { Editor } from '@tiptap/react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/appStore'
import { useAi } from '@/hooks/useAi'
import { cn } from '@/lib/utils'
import { FILE_TYPE_AI_CONFIG } from '@/lib/aiConfig'
import type { FileType } from '@/lib/aiConfig'
import type { Issue, AiSelectionAttachment } from '@/types'
import type { AnalysisState, AnalysisControls } from '@/hooks/useAnalysis'
import { charSpanToDocRange } from '@/lib/issueSpan'
import {
  extractActionBlock, stripActionBlock, hasOpenActionFence, validateActions, describeAction,
} from '@/lib/ai/proseActions'
import type { ActionSurface, ProseAction, ValidatedActions } from '@/lib/ai/proseActions'
import {
  Send, Loader2, Sparkles, MessageSquare, ScanText, X, TextSelect,
  Wand2, Check, AlertTriangle, Paperclip,
} from 'lucide-react'
import { IMAGE_CAP, openImagePicker, type AttachedImage } from './imageAttachments'
import { ImagePill, SentImagePill, ImageEnlargeModal, type ImagePreview } from './ImagePill'

// ── AI action execution bridge ────────────────────────────────────────────────
// Editors that support prose-actions pass a handler; the ChatTab parses action
// blocks out of assistant replies, shows a preview card, and calls apply()
// only when the user clicks Apply.

export interface AiActionResult {
  ok: boolean
  message?: string
}

export interface AiActionHandler {
  surface: ActionSurface
  apply(actions: ProseAction[]): AiActionResult | Promise<AiActionResult>
}

// ── Markdown renderer for assistant messages ─────────────────────────────────

// LLMs commonly emit \[...\] for display math and \(...\) for inline math.
// remark-math expects $$...$$ and $...$ respectively, so normalise first.
const LATEX_CMD = /\\(?:frac|int|sum|prod|sqrt|lim|infty|partial|alpha|beta|gamma|delta|theta|lambda|sigma|pi|mu|cdot|times|div|leq|geq|neq|approx|pm|binom|vec|hat|bar|dot|left|right)\b/

// Truncates a LaTeX expression so all { } braces are balanced, preventing
// KaTeX parse errors when the model stops mid-expression.
function balanceLatexBraces(inner: string): string {
  let depth = 0
  let lastBalancedPos = 0
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '\\') { i++; continue }
    if (inner[i] === '{') depth++
    else if (inner[i] === '}' && depth > 0) depth--
    if (depth === 0) lastBalancedPos = i + 1
  }
  return depth > 0 ? inner.slice(0, lastBalancedPos) : inner
}

export function normaliseMath(text: string): string {
  let t = text

  // Convert LaTeX list environments to markdown so they render correctly
  t = t.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, body: string) =>
    body.replace(/\\item\s*/g, '- ').trim()
  )
  t = t.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, body: string) => {
    let n = 0
    return body.replace(/\\item\s*/g, () => `${++n}. `).trim()
  })

  // Convert display math (\[...\] and $$...$$) to inline $\displaystyle ...$
  // so they don't insert block elements that break numbered list continuity.
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, m: string) => `$\\displaystyle ${m.trim()}$`)
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, m: string) => `$\\displaystyle ${m.trim()}$`)
  // Handle unclosed $$: model opened display math but forgot the closing $$.
  // After the pass above, any remaining $$ was never closed.
  t = t.replace(/\$\$([\s\S]*?)(?=\n\n|$)/g, (_, m: string) =>
    `$\\displaystyle ${balanceLatexBraces(m.trim())}$`
  )

  // \(...\) → $...$
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, m: string) => `$${m}$`)

  // Fix a lone opening $ with no closing $ on the same line that contains LaTeX.
  // (?<!\$) prevents matching the second $ of a $$ pair.
  t = t.replace(/(?<!\$)\$(?!\$)([^$\n]*?\\[a-zA-Z]+[^$\n]*)(?=\n|$)/g, (match, inner: string) => {
    if (LATEX_CMD.test(inner)) return `$${balanceLatexBraces(inner)}$`
    return match
  })

  // Brace bare subscripts/superscripts inside $...$ so markdown's _ italic
  // parser doesn't swallow them before remark-math can process the delimiter.
  // e.g. $\int_1^9$ → $\int_{1}^{9}$
  // Only matches simple alphanumeric args to avoid swallowing operators: x^2+x stays x^{2}+x.
  t = t.replace(/\$([^$\n]+)\$/g, (_match, inner: string) => {
    const braced = inner.replace(/([_^])([a-zA-Z0-9]+)/g, (_, op: string, arg: string) => `${op}{${arg}}`)
    const balanced = balanceLatexBraces(braced)
    return balanced ? `$${balanced}$` : ''
  })

  return t
}

export function AiMarkdown({ children }: { children: string }): JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: 'currentColor' }]]}
      allowedElements={['p','strong','em','h1','h2','h3','ul','ol','li','code','pre','blockquote','span','div','math','semantics','mrow','mi','mo','mn','msup','msub','mfrac','msqrt','mtext','mspace','mover','munder','mtable','mtr','mtd','annotation']}
      unwrapDisallowed
      components={{
        p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em:     ({ children }) => <em className="italic">{children}</em>,
        h1:     ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        h2:     ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        h3:     ({ children }) => <p className="mb-0.5 font-medium">{children}</p>,
        ul:     ({ children }) => <ul className="mb-1.5 ml-3 list-disc space-y-0.5">{children}</ul>,
        ol:     ({ children }) => <ol className="mb-1.5 ml-3 list-decimal space-y-0.5">{children}</ol>,
        li:     ({ children }) => <li>{children}</li>,
        code:   ({ children, className }) =>
          className ? (
            <code className="block whitespace-pre-wrap rounded bg-background/60 px-2 py-1 font-mono text-[11px]">
              {children}
            </code>
          ) : (
            <code className="rounded bg-background/60 px-1 font-mono text-[11px]">{children}</code>
          ),
        pre:    ({ children }) => <pre className="mb-1.5 max-w-full overflow-x-auto">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="mb-1.5 border-l-2 border-muted-foreground/40 pl-2 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

// ── Waiting-for-response indicator ───────────────────────────────────────────
// Two distinct states, shown in place of the assistant bubble before any
// content has streamed in:
//  - reloading: a concrete "model not resident in memory yet" signal (see
//    useAi's isModelLoaded()/waitForModelWarm() check) — cold starts can take
//    a while, so this gets its own static, more informative message.
//  - otherwise: the model is already warm and actively generating — bouncing
//    dots plus a caption that rotates every second, similar in spirit to
//    Claude Code's own "Clauding…"/"Compacting…" status words.

const WRITING_CAPTIONS = [
  'Writing…', 'Forming…', 'Prose-ifying…', 'Composing…', 'Drafting…', 'Thinking…', 'Designing…', 'Generating…', 'Synthesizing…', 'Creating…', 'Formulating…', 'Constructing…',
]

export function AiWaitingIndicator({ reloading }: { reloading: boolean }): JSX.Element {
  const [captionIdx, setCaptionIdx] = useState(0)

  useEffect(() => {
    if (reloading) return
    const id = setInterval(() => setCaptionIdx((i) => (i + 1) % WRITING_CAPTIONS.length), 1000)
    return () => clearInterval(id)
  }, [reloading])

  if (reloading) {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin" />
        <span className="flex flex-col">
          <span>Loading model.</span>
          <span className="text-[10px] opacity-75">This can take a while for larger models.</span>
        </span>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="flex gap-0.5">
        <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
        <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
        <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
      </span>
      {WRITING_CAPTIONS[captionIdx]}
    </span>
  )
}

// ── Suggestion chips ──────────────────────────────────────────────────────────

function attachmentPreview(text: string, maxLen = 24): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen).trimEnd()}…`
}

function ChatSelectionAttachmentChip({
  attachment,
  active,
  onActivate,
  onDismiss,
}: {
  attachment: AiSelectionAttachment
  active: boolean
  onActivate(): void
  onDismiss(): void
}): JSX.Element {
  const preview = attachmentPreview(attachment.text)

  return (
    <div
      className={cn(
        'group relative flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-colors',
        active
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-muted/30 hover:border-primary/30 hover:bg-muted/50',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5"
        title={attachment.text}
        onClick={onActivate}
      >
        <TextSelect className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-[11px] text-foreground">{preview}</span>
      </button>
      <button
        type="button"
        className={cn(
          'shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-background hover:text-foreground',
          'opacity-0 group-hover:opacity-100',
          active && 'opacity-100',
        )}
        aria-label="Remove selection attachment"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ── Issue colors ──────────────────────────────────────────────────────────────

export const ISSUE_COLORS: Record<Issue['type'], string> = {
  spelling:   'bg-red-500',
  wordChoice: 'bg-emerald-500',
  style:      'bg-amber-500',
  repetition: 'bg-blue-700',
  misc:       'bg-sky-400',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AiPanelProps {
  editor: Editor | null
  /** Only required for Documents — omit for Sheets and Boards. */
  analysis?: AnalysisState & AnalysisControls
  fileType?: FileType
  /** Optional override for document content injected as AI context. Used by Sheets and Boards. */
  getDocumentContent?: () => string
  /** Called when the user clicks "Insert formula" on an AI suggestion (Sheets only). */
  onInsertFormula?: (formula: string) => void
  /** Called when the user clicks "Insert into sheet" on an AI-generated table (Sheets only). */
  onInsertTableData?: (rows: string[][]) => void
  /** Lets AI replies carry applyable prose-actions (Sheets, Boards). */
  actionHandler?: AiActionHandler
  /** Optional second tab (e.g. Sheets "Insights") for file types without analysis. */
  extraTab?: { label: string; icon: React.ComponentType<{ className?: string }>; content: React.ReactNode }
}

// ── Shared apply logic ────────────────────────────────────────────────────────

export function applyIssueSuggestion(editor: Editor, issue: Issue): void {
  if (!issue.suggestion) return
  const range = charSpanToDocRange(editor.state.doc, issue.span.start, issue.span.end)
  if (!range) return
  editor.chain().focus().deleteRange(range).insertContentAt(range.from, issue.suggestion).run()
}

// ── Formula extraction (Sheets) ───────────────────────────────────────────────

function extractFormula(content: string): string | null {
  // Code block: ```=FORMULA(...)```
  const cbMatch = content.match(/```(?:\w*\n)?\s*(=[^\n`]{2,100})\s*(?:\n)?```/m)
  if (cbMatch) return cbMatch[1].trim()
  // Inline code: `=FORMULA(...)`
  const icMatch = content.match(/`(=[^`]{2,100})`/)
  if (icMatch) return icMatch[1].trim()
  // Bare formula on its own line: =FUNCTION(...) — case-insensitive function name
  const bareMatch = content.match(/^(=[A-Za-z]+\([^)]{0,200}\))/m)
  if (bareMatch) return bareMatch[1].trim()
  return null
}

// Extracts a GitHub-flavored markdown table (the format models reliably
// produce when asked for tabular data) into a 2D array ready to write
// straight into a sheet. Returns null if no table-shaped block is found.
function extractMarkdownTable(content: string): string[][] | null {
  const lines = content.split('\n').map((l) => l.trim())
  let start = -1
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i]?.startsWith('|') && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(lines[i + 1] ?? '')) {
      start = i
      break
    }
  }
  if (start === -1) return null
  const rows: string[][] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    if (!line?.startsWith('|')) break
    if (i === start + 1) continue  // the |---|---| separator row
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length === 0) break
    rows.push(cells)
  }
  return rows.length > 0 ? rows : null
}

// ── Action preview card ───────────────────────────────────────────────────────

export type ActionCardState = { status: 'idle' } | { status: 'applying' } | { status: 'applied' } | { status: 'error'; message: string }

export function ActionCard({
  validated,
  state,
  onApply,
}: {
  validated: ValidatedActions
  state: ActionCardState
  onApply(): void
}): JSX.Element {
  const n = validated.actions.length
  return (
    <div className="mt-1 w-full max-w-[85%] rounded-lg border border-primary/30 bg-primary/5 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Wand2 className="h-3 w-3 shrink-0 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          {n} action{n !== 1 ? 's' : ''} ready
        </span>
      </div>
      <ul className="mb-2 space-y-0.5">
        {validated.actions.slice(0, 8).map((a, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
            {describeAction(a)}
          </li>
        ))}
        {validated.actions.length > 8 && (
          <li className="text-[10px] text-muted-foreground">…and {validated.actions.length - 8} more</li>
        )}
      </ul>
      {validated.warnings.length > 0 && (
        <p className="mb-2 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
          {validated.warnings[0]}{validated.warnings.length > 1 ? ` (+${validated.warnings.length - 1} more)` : ''}
        </p>
      )}
      {state.status === 'applied' ? (
        <p className="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" /> Applied
        </p>
      ) : state.status === 'error' ? (
        <div>
          <p className="mb-1 text-[10px] text-destructive">{state.message}</p>
          <button
            className="rounded bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
            onClick={onApply}
          >
            Retry
          </button>
        </div>
      ) : (
        <button
          className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          disabled={state.status === 'applying'}
          onClick={onApply}
        >
          {state.status === 'applying' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          Apply
        </button>
      )}
    </div>
  )
}

// Splits an assistant message into displayable text + (optionally) a validated
// action block. While the fence is still streaming in, the partial JSON is
// hidden behind a "building" indicator instead of raw JSON flooding the bubble.
export function splitAssistantContent(
  content: string,
  surface: ActionSurface | null,
): { text: string; validated: ValidatedActions | null; building: boolean } {
  if (!surface) return { text: content, validated: null, building: false }
  const block = extractActionBlock(content)
  if (block) {
    const validated = validateActions(block.json, surface)
    return { text: stripActionBlock(content, block.raw), validated, building: false }
  }
  if (hasOpenActionFence(content)) {
    const fenceIdx = content.search(/```(?:prose-actions|prose_actions|json)/i)
    return { text: fenceIdx > 0 ? content.slice(0, fenceIdx).trim() : '', validated: null, building: true }
  }
  return { text: content, validated: null, building: false }
}

// ── Chat tab ──────────────────────────────────────────────────────────────────

export function ChatTab({
  editor,
  fileType = 'document',
  assignmentContext,
  setAssignmentContext,
  getDocumentContent,
  onInsertFormula,
  onInsertTableData,
  actionHandler,
  hideContext = false,
}: {
  editor: Editor | null
  fileType?: FileType
  assignmentContext: string
  setAssignmentContext: (v: string) => void
  getDocumentContent?: () => string
  onInsertFormula?: (formula: string) => void
  onInsertTableData?: (rows: string[][]) => void
  /** When provided, prose-actions blocks in AI replies become applyable cards. */
  actionHandler?: AiActionHandler
  /** Hides the built-in context textarea — set when the host panel renders its own (Slides). */
  hideContext?: boolean
}): JSX.Element {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const multimodalCapable = useAppStore((s) => s.multimodalCapable)
  const pendingAiPrompt = useAppStore((s) => s.pendingAiPrompt)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const pendingAiAttachment = useAppStore((s) => s.pendingAiAttachment)
  const setPendingAiAttachment = useAppStore((s) => s.setPendingAiAttachment)
  const { messages, streaming, reloading, error, sendMessage, clearMessages } = useAi()

  const [contextOpen, setContextOpen] = useState(false)
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<AiSelectionAttachment | null>(null)
  const [attachmentActive, setAttachmentActive] = useState(false)
  const [actionStates, setActionStates] = useState<Record<string, ActionCardState>>({})
  const [images, setImages] = useState<AttachedImage[]>([])
  const [enlarged, setEnlarged] = useState<ImagePreview | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const clearAttachmentHighlight = useCallback((): void => {
    setAttachmentActive(false)
    editor?.commands.clearAiSelectionHighlight()
  }, [editor])

  const dismissAttachment = useCallback((): void => {
    setAttachment(null)
    clearAttachmentHighlight()
  }, [clearAttachmentHighlight])

  const activateAttachment = useCallback((): void => {
    if (!editor || !attachment) return
    setAttachmentActive(true)
    editor
      .chain()
      .focus()
      .setTextSelection({ from: attachment.from, to: attachment.to })
      .scrollIntoView()
      .setAiSelectionHighlight(attachment.from, attachment.to)
      .run()
  }, [editor, attachment])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (pendingAiAttachment !== null) {
      setAttachment(pendingAiAttachment)
      setAttachmentActive(false)
      editor?.commands.clearAiSelectionHighlight()
      setPendingAiAttachment(null)
    }
  }, [pendingAiAttachment, setPendingAiAttachment, editor])

  useEffect(() => {
    if (pendingAiPrompt !== null) {
      setInput(pendingAiPrompt)
      setPendingAiPrompt(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [pendingAiPrompt, setPendingAiPrompt])

  // Sync textarea height whenever input changes from any source (including
  // programmatic setInput calls like pendingAiPrompt fill-ins).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0'
    const full = el.scrollHeight
    const max = 128
    el.style.height = `${Math.min(full, max)}px`
    el.style.overflowY = full > max ? 'auto' : 'hidden'
  }, [input])

  const config = FILE_TYPE_AI_CONFIG[fileType]
  const unavailable = ollamaStatus === 'unavailable'
  const busy = streaming || ollamaStatus === 'loading'

  // Capture refs so send() can read the latest values without being recreated
  const getDocumentContentRef = useRef(getDocumentContent)
  getDocumentContentRef.current = getDocumentContent
  const editorRef = useRef(editor)
  editorRef.current = editor

  async function send(text: string): Promise<void> {
    const t = text.trim()
    if ((!t && images.length === 0) || busy || unavailable) return
    // Compute document context at send-time, not on every render
    const docText = getDocumentContentRef.current
      ? getDocumentContentRef.current()
      : (editorRef.current ? editorRef.current.getText() : '')
    const selectionContent = attachment?.text
    const sentImages = images
    setInput('')
    setImages([])
    dismissAttachment()
    if (inputRef.current) {
      inputRef.current.style.height = ''
      inputRef.current.style.overflowY = 'hidden'
    }
    await sendMessage(t, docText, assignmentContext || undefined, selectionContent, fileType, sentImages)
  }

  const addImages = useCallback((imgs: AttachedImage[]) => {
    setImages((prev) => [...prev, ...imgs].slice(0, IMAGE_CAP))
  }, [])

  async function applyActions(messageId: string, validated: ValidatedActions): Promise<void> {
    if (!actionHandler) return
    setActionStates((s) => ({ ...s, [messageId]: { status: 'applying' } }))
    try {
      const result = await actionHandler.apply(validated.actions)
      setActionStates((s) => ({
        ...s,
        [messageId]: result.ok
          ? { status: 'applied' }
          : { status: 'error', message: result.message ?? 'Could not apply these actions.' },
      }))
    } catch (err) {
      console.error('[AiPanel] action apply error:', err)
      setActionStates((s) => ({ ...s, [messageId]: { status: 'error', message: 'Something went wrong while applying.' } }))
    }
  }

  function handleClearMessages(): void {
    setActionStates({})
    clearMessages()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Document context — hidden when the host panel renders its own (Slides) */}
      {!hideContext && (
        <>
          <div className="shrink-0 px-3 pt-2 pb-1">
            <button
              className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setContextOpen((o) => !o)}
            >
              <span className={cn('transition-transform', contextOpen && 'rotate-90')}>›</span>
              {config.contextLabel}
            </button>
            <AnimatePresence>
              {contextOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <textarea
                    className={cn(
                      'mt-1.5 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5',
                      'text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring',
                      'min-h-[60px]'
                    )}
                    placeholder={config.contextPlaceholder}
                    value={assignmentContext}
                    onChange={(e) => setAssignmentContext(e.target.value)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator />
        </>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Suggestions
            </p>
            <div className="flex flex-col gap-1">
              {config.chips.map((chip) => (
                <button
                  key={chip.label}
                  disabled={busy || unavailable}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                    'border border-border hover:bg-accent hover:text-accent-foreground',
                    (busy || unavailable) && 'cursor-not-allowed opacity-40'
                  )}
                  onClick={() => void send(chip.promptText)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const { text: displayText, validated, building } = msg.role === 'assistant'
            ? splitAssistantContent(msg.content, actionHandler?.surface ?? null)
            : { text: msg.content, validated: null, building: false }
          const formula = msg.role === 'assistant' && fileType === 'sheet' && displayText && !validated
            ? extractFormula(displayText)
            : null
          const table = msg.role === 'assistant' && fileType === 'sheet' && displayText && !formula && !validated
            ? extractMarkdownTable(displayText)
            : null
          const showBubble = msg.role === 'user' || displayText || (!validated && !building)
          return (
            <div key={msg.id} className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}>
              {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                <div className="mb-1 flex max-w-[85%] gap-1.5 overflow-x-auto pb-1">
                  {msg.images.map((img) => (
                    <SentImagePill key={img.id} image={img} onOpen={setEnlarged} />
                  ))}
                </div>
              )}
              {showBubble && (
              <div
                className={cn(
                  'ai-chat-bubble min-w-0 max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                  msg.role === 'user'
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground'
                )}
              >
                {msg.role === 'assistant' && displayText ? (
                  <AiMarkdown>{normaliseMath(displayText)}</AiMarkdown>
                ) : msg.content || <AiWaitingIndicator reloading={reloading} />}
              </div>
              )}
              {building && (
                <div className="mt-1 flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                  <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                  Preparing actions…
                </div>
              )}
              {validated && (
                <ActionCard
                  validated={validated}
                  state={actionStates[msg.id] ?? { status: 'idle' }}
                  onApply={() => void applyActions(msg.id, validated)}
                />
              )}
              {formula && onInsertFormula && (
                <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] max-w-[85%]">
                  <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground">{formula}</code>
                  <button
                    className="shrink-0 rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
                    onClick={() => onInsertFormula(formula)}
                  >
                    Insert
                  </button>
                </div>
              )}
              {table && onInsertTableData && (
                <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] max-w-[85%]">
                  <span className="min-w-0 flex-1 truncate text-foreground">{table.length} row{table.length !== 1 ? 's' : ''} × {table[0]?.length ?? 0} cols</span>
                  <button
                    className="shrink-0 rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
                    onClick={() => onInsertTableData(table)}
                  >
                    Insert into sheet
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {error && (
          <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>
        )}

        {unavailable && messages.length === 0 && (
          <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Ollama is not running. Install it and ensure it&apos;s available on your system.
          </p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length > 0 && (
        <div className="shrink-0 flex justify-end px-3 pb-1">
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleClearMessages}
          >
            Clear chat
          </button>
        </div>
      )}

      <Separator />

      {/* Input */}
      <div className="shrink-0 p-2">
        <div className="rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
          {attachment && (
            <div className="border-b border-border px-2 py-1.5">
              <ChatSelectionAttachmentChip
                attachment={attachment}
                active={attachmentActive}
                onActivate={activateAttachment}
                onDismiss={dismissAttachment}
              />
            </div>
          )}
          {images.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto border-b border-border px-2 py-1.5 pb-2">
              {images.map((img) => (
                <ImagePill
                  key={img.id}
                  image={img}
                  onOpen={setEnlarged}
                  onRemove={(id) => setImages((prev) => prev.filter((i) => i.id !== id))}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 px-2 py-1.5">
            {multimodalCapable && (
              <button
                type="button"
                disabled={unavailable || busy || images.length >= IMAGE_CAP}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                onClick={() => openImagePicker(IMAGE_CAP - images.length, addImages)}
                title="Attach images"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              style={{ lineHeight: '1.4', overflowY: 'hidden' }}
              placeholder={unavailable ? 'AI unavailable' : 'Ask anything…'}
              value={input}
              disabled={unavailable || busy}
              onChange={(e) => {
                setInput(e.target.value)
                const el = e.target
                el.style.height = '0'
                const full = el.scrollHeight
                const max = 128 // 8rem at 16px
                el.style.height = `${Math.min(full, max)}px`
                el.style.overflowY = full > max ? 'auto' : 'hidden'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
            />
            <button
              disabled={(!input.trim() && images.length === 0) || unavailable || busy}
              className="shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:opacity-30"
              onClick={() => void send(input)}
            >
              {streaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <ImageEnlargeModal image={enlarged} onClose={() => setEnlarged(null)} />
    </div>
  )
}

// ── Analysis tab ──────────────────────────────────────────────────────────────
// Powered by Harper (harper.js), a local grammar/style engine — linting runs
// fully offline in a Web Worker and returns in milliseconds, so there's no
// "cold start" case to mask with a fake multi-step loading animation the way
// the old Ollama-backed analysis needed. A brief spinner covers the rare case
// of a very large document taking a moment.

// Groups issues by their Harper category (e.g. "Spelling", "Repetition") for
// the "Problems" summary row, preserving each category's color group.
function summarizeByCategory(issues: Issue[]): { category: string; type: Issue['type']; count: number }[] {
  const order: string[] = []
  const counts = new Map<string, { type: Issue['type']; count: number }>()
  for (const issue of issues) {
    const existing = counts.get(issue.category)
    if (existing) {
      existing.count++
    } else {
      counts.set(issue.category, { type: issue.type, count: 1 })
      order.push(issue.category)
    }
  }
  return order.map((category) => ({ category, ...counts.get(category)! }))
}

function AnalysisTab({
  editor,
  analysis,
}: {
  editor: Editor | null
  analysis: AnalysisState & AnalysisControls
}): JSX.Element {
  const analyzeOnSave = useAppStore((s) => s.analyzeOnSave)
  const setAnalyzeOnSave = useAppStore((s) => s.setAnalyzeOnSave)
  const { issues, analyzing, error, hasRun, analyze, clearIssues } = analysis

  const handleAnalyze = useCallback((): void => {
    if (!editor) return
    void analyze(editor.state.doc.textContent)
  }, [editor, analyze])

  function scrollToIssue(issue: Issue): void {
    if (!editor) return
    const range = charSpanToDocRange(editor.state.doc, issue.span.start, issue.span.end)
    if (!range) return
    editor.commands.setTextSelection(range.from)
    editor.commands.scrollIntoView()
  }

  const summary = summarizeByCategory(issues)

  return (
    <div className="flex h-full flex-col">
      {/* Controls */}
      <div className="shrink-0 px-3 pt-2 pb-3 space-y-2">
        <Button
          className="w-full gap-2 h-8 text-xs"
          disabled={!editor || analyzing}
          onClick={handleAnalyze}
        >
          {hasRun ? 'Rerun analysis' : 'Analyze document'}
        </Button>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button
            role="switch"
            aria-checked={analyzeOnSave}
            onClick={() => setAnalyzeOnSave(!analyzeOnSave)}
            className={cn(
              'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
              analyzeOnSave ? 'bg-primary' : 'bg-muted-foreground/30'
            )}
          >
            <span
              className={cn(
                'inline-block h-3 w-3 rounded-full bg-white shadow transition-transform',
                analyzeOnSave ? 'translate-x-3.5' : 'translate-x-0.5'
              )}
            />
          </button>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Analyze on manual save <span className="opacity-60">(Ctrl+S)</span>
          </span>
        </label>
      </div>

      <Separator />

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!hasRun && !analyzing && (
          <div className="px-3 pt-6 text-center">
            <ScanText className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              Run an analysis to check your document for grammar, clarity, and style issues.
            </p>
          </div>
        )}

        {analyzing && !hasRun && (
          <div className="flex flex-col items-center gap-2 px-3 pt-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-xs">Checking document…</span>
          </div>
        )}

        {hasRun && (
          <>
            {issues.length > 0 && (
              <div className="px-3 pb-1 pt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-foreground">
                    {issues.length} problem{issues.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      clearIssues()
                      editor?.commands.clearAnalysisIssues()
                    }}
                  >
                    dismiss all
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                  {summary.map(({ category, type, count }) => (
                    <span key={category} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ISSUE_COLORS[type])} />
                      {category} <span className="font-medium text-foreground">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className={cn('px-3 pb-3 space-y-2', issues.length === 0 ? 'pt-3' : 'pt-2')}>
              {issues.length === 0 && (
                <p className="rounded-md bg-green-500/10 px-3 py-2.5 text-xs text-green-600 dark:text-green-400">
                  No issues found — your document looks great!
                </p>
              )}
              {issues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onClick={() => scrollToIssue(issue)}
                  onApply={() => { if (editor) applyIssueSuggestion(editor, issue) }}
                />
              ))}
            </div>
          </>
        )}

        {error && (
          <div className="px-3 pt-3">
            <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Category kicker (small dot + label) + title + italicized quote, apply pill
// revealed on hover — no stats tiles, no large color dot next to the title.
function IssueCard({
  issue,
  onClick,
  onApply,
}: {
  issue: Issue
  onClick(): void
  onApply(): void
}): JSX.Element {
  return (
    <button
      className="group w-full rounded-lg border border-border bg-background p-2.5 text-left transition-colors hover:border-primary/45"
      onClick={onClick}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ISSUE_COLORS[issue.type])} />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {issue.category}
        </span>
      </div>
      <p className="text-xs font-semibold leading-snug text-foreground">{issue.message}</p>
      <blockquote className="relative mt-1.5 pl-3 text-[11px] italic leading-snug text-muted-foreground">
        <span className="absolute left-0 top-0 font-serif text-base not-italic leading-none text-muted-foreground/50">&ldquo;</span>
        {issue.quote.length > 72 ? issue.quote.slice(0, 72) + '…' : issue.quote}
      </blockquote>
      {issue.suggestion && (
        <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out">
          <div className="overflow-hidden min-h-0">
            <button
              className="mt-2 flex w-full items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-left text-[10.5px] font-medium leading-relaxed text-primary hover:bg-primary/20"
              onClick={(e) => { e.stopPropagation(); onApply() }}
            >
              <Check className="h-2.5 w-2.5 shrink-0" />
              {issue.suggestion.length > 40 ? issue.suggestion.slice(0, 40) + '…' : issue.suggestion}
            </button>
          </div>
        </div>
      )}
    </button>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AiPanel({ editor, analysis, fileType = 'document', getDocumentContent, onInsertFormula, onInsertTableData, actionHandler, extraTab }: AiPanelProps): JSX.Element {
  const activeAiTab = useAppStore((s) => s.activeAiTab)
  const setActiveAiTab = useAppStore((s) => s.setActiveAiTab)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const issueCount = useAppStore((s) => s.issueCount)
  const assignmentContext = useAppStore((s) => s.assignmentContext)
  const setAssignmentContext = useAppStore((s) => s.setAssignmentContext)
  const [contextOpen, setContextOpen] = useState(false)
  // Local tab state for the optional extra tab (file types without analysis).
  const [extraTabActive, setExtraTabActive] = useState(false)

  const hasAnalysis = FILE_TYPE_AI_CONFIG[fileType].hasAnalysis
  // If the current tab is 'analysis' but this file type doesn't support it, switch to chat.
  const resolvedTab = !hasAnalysis && activeAiTab === 'analysis' ? 'chat' : activeAiTab
  const hasTabs = hasAnalysis || !!extraTab

  const tabPillClass = (active: boolean): string => cn(
    'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
  )

  return (
    <div className="flex h-full flex-col border-l border-border">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 pl-3 pr-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium">AI assistant</span>

        {/* Tab pills */}
        {hasTabs && (
          <div className="ml-auto flex items-center rounded-md border border-border bg-muted/40 p-0.5 gap-0.5">
            <button
              onClick={() => { setActiveAiTab('chat'); setExtraTabActive(false) }}
              className={tabPillClass(hasAnalysis ? resolvedTab === 'chat' : !extraTabActive)}
            >
              <MessageSquare className="h-2.5 w-2.5" />
              Chat
            </button>
            {hasAnalysis && (
              <button
                onClick={() => setActiveAiTab('analysis')}
                className={tabPillClass(resolvedTab === 'analysis')}
              >
                <ScanText className="h-2.5 w-2.5" />
                Issues
                {issueCount > 0 && (
                  <span className="rounded-full bg-primary px-1 py-px text-[8px] font-bold leading-none text-primary-foreground">
                    {issueCount > 99 ? '99+' : issueCount}
                  </span>
                )}
              </button>
            )}
            {!hasAnalysis && extraTab && (
              <button
                onClick={() => setExtraTabActive(true)}
                className={tabPillClass(extraTabActive)}
              >
                <extraTab.icon className="h-2.5 w-2.5" />
                {extraTab.label}
              </button>
            )}
          </div>
        )}

        <button
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
            !hasTabs && 'ml-auto',
          )}
          onClick={() => setAiPanelOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Separator />

      {/* Document context — lives in the shared header so it stays in place and
          keeps its value regardless of which tab (Chat / Issues) is active. */}
      <div className="shrink-0 px-3 pt-2 pb-1">
        <button
          className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setContextOpen((o) => !o)}
        >
          <span className={cn('transition-transform', contextOpen && 'rotate-90')}>›</span>
          {FILE_TYPE_AI_CONFIG[fileType].contextLabel}
        </button>
        <AnimatePresence>
          {contextOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <textarea
                className={cn(
                  'mt-1.5 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5',
                  'text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring',
                  'min-h-[60px]',
                )}
                placeholder={FILE_TYPE_AI_CONFIG[fileType].contextPlaceholder}
                value={assignmentContext}
                onChange={(e) => setAssignmentContext(e.target.value)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Separator />

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {!hasAnalysis && extraTab && extraTabActive ? (
          extraTab.content
        ) : resolvedTab === 'chat' || !hasAnalysis ? (
          <ChatTab
            editor={editor}
            fileType={fileType}
            assignmentContext={assignmentContext}
            setAssignmentContext={setAssignmentContext}
            getDocumentContent={getDocumentContent}
            onInsertFormula={onInsertFormula}
            onInsertTableData={onInsertTableData}
            actionHandler={actionHandler}
            hideContext
          />
        ) : (
          <AnalysisTab
            editor={editor}
            analysis={analysis!}
          />
        )}
      </div>
    </div>
  )
}
