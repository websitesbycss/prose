// Local grammar/style checking via Harper (harper.js), replacing the old
// Ollama-based analysis pipeline. Runs fully offline in a Web Worker — no
// network, no document content ever leaves the renderer.
import type { Issue, IssueColorGroup } from '@/types'

type HarperModule = typeof import('harper.js')
type WorkerLinterInstance = InstanceType<HarperModule['WorkerLinter']>

let linterPromise: Promise<WorkerLinterInstance> | null = null

async function getLinter(): Promise<WorkerLinterInstance> {
  if (!linterPromise) {
    linterPromise = (async () => {
      const [harper, { binary }] = await Promise.all([
        import('harper.js'),
        import('harper.js/binary'),
      ])
      const linter = new harper.WorkerLinter({ binary, dialect: harper.Dialect.American })
      await linter.setup()
      return linter
    })()
  }
  return linterPromise
}

// Harper's lint_kind() categories collapsed into the 5 color groups used in
// the Issues UI. Kinds not listed fall back to 'misc'.
const KIND_GROUP: Partial<Record<string, IssueColorGroup>> = {
  Spelling: 'spelling',
  Typo: 'spelling',
  WordChoice: 'wordChoice',
  Eggcorn: 'wordChoice',
  Malapropism: 'wordChoice',
  Style: 'style',
  Formatting: 'style',
  Readability: 'style',
  Repetition: 'repetition',
  Redundancy: 'repetition',
}

function groupForKind(kind: string): IssueColorGroup {
  return KIND_GROUP[kind] ?? 'misc'
}

/**
 * Lints `text` and returns issues with character-offset spans measured
 * against `text` itself (Unicode scalar indices, per Harper's Span docs) —
 * callers must lint the exact same flat string they'll later map spans back
 * into (e.g. `editor.state.doc.textContent`, not `getText()` with block
 * separators, which would shift offsets).
 */
export async function lintText(text: string): Promise<Issue[]> {
  if (!text.trim()) return []
  const linter = await getLinter()
  const lints = await linter.lint(text, { language: 'plaintext', dedup: true })
  return lints.map((lint, i) => {
    const span = lint.span()
    const suggestions = lint.suggestions()
    const suggestion = suggestions.length > 0 ? suggestions[0]!.get_replacement_text() : ''
    return {
      id: `${span.start}-${span.end}-${i}`,
      type: groupForKind(lint.lint_kind()),
      category: lint.lint_kind_pretty(),
      quote: lint.get_problem_text(),
      message: lint.message(),
      suggestion,
      span: { start: span.start, end: span.end },
    }
  })
}
