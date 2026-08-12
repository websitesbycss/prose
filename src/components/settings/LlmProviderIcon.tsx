// Small colored glyphs standing in for each provider's brand mark. Real
// trademarked logos are deliberately not used — this app is offline-first
// and never fetches remote assets into a settings screen, and bundling
// third-party marks raises IP questions distinct from "will the toggle be
// visually clear" — so each provider gets a distinct Lucide icon tinted with
// a color evocative of its brand instead.
import type { LucideIcon } from 'lucide-react'
import { Sparkles, Hexagon, Gem, Plug } from 'lucide-react'
import type { CustomLlmProviderId } from '@/types'

export interface LlmProviderMeta {
  id: CustomLlmProviderId
  label: string
  icon: LucideIcon
  color: string
  keyUrl: string | null
  keyUrlLabel: string | null
  modelPlaceholder: string
}

export const LLM_PROVIDERS: LlmProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    icon: Sparkles,
    color: '#d97757',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlLabel: 'console.anthropic.com',
    modelPlaceholder: 'e.g. claude-opus-5',
  },
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    icon: Hexagon,
    color: '#10a37f',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: 'platform.openai.com',
    modelPlaceholder: 'e.g. gpt-5',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    icon: Gem,
    color: '#4285f4',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: 'aistudio.google.com',
    modelPlaceholder: 'e.g. gemini-2.5-pro',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    icon: Plug,
    color: '#6b7280',
    keyUrl: null,
    keyUrlLabel: null,
    modelPlaceholder: 'model id your endpoint expects',
  },
]

const FALLBACK_META = LLM_PROVIDERS[LLM_PROVIDERS.length - 1] as LlmProviderMeta

export function getLlmProviderMeta(provider: CustomLlmProviderId): LlmProviderMeta {
  return LLM_PROVIDERS.find((p) => p.id === provider) ?? FALLBACK_META
}

export function LlmProviderIcon({ provider, className }: { provider: CustomLlmProviderId; className?: string }): JSX.Element {
  const meta = getLlmProviderMeta(provider)
  const Icon = meta.icon
  return (
    <span
      className={className ?? 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md'}
      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
    >
      <Icon className="h-3 w-3" strokeWidth={2.25} />
    </span>
  )
}
