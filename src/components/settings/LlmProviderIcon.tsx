// Each provider's real brand mark (resources/logos/*.png), matching the
// same images used on the onboarding AI-setup screen. "Custom" has no logo
// of its own, so it keeps a generic Lucide glyph instead.
import type { LucideIcon } from 'lucide-react'
import { Bot } from 'lucide-react'
import type { CustomLlmProviderId } from '@/types'
import { openaiLogo, anthropicLogo, geminiLogo } from '@/lib/providerLogos'

export interface LlmProviderMeta {
  id: CustomLlmProviderId
  label: string
  logo: string | null
  icon: LucideIcon | null
  color: string
  keyUrl: string | null
  keyUrlLabel: string | null
  modelPlaceholder: string
}

export const LLM_PROVIDERS: LlmProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    logo: anthropicLogo,
    icon: null,
    color: '#d97757',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlLabel: 'console.anthropic.com',
    modelPlaceholder: 'e.g. claude-opus-5',
  },
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    logo: openaiLogo,
    icon: null,
    color: '#10a37f',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: 'platform.openai.com',
    modelPlaceholder: 'e.g. gpt-5',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    logo: geminiLogo,
    icon: null,
    color: '#4285f4',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: 'aistudio.google.com',
    modelPlaceholder: 'e.g. gemini-2.5-pro',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    logo: null,
    icon: Bot,
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
  return (
    <span
      className={className ?? 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md'}
      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
    >
      {meta.logo ? (
        <img src={meta.logo} alt="" className="h-3 w-3 object-contain" />
      ) : (
        meta.icon && <meta.icon className="h-3 w-3" strokeWidth={2.25} />
      )}
    </span>
  )
}
