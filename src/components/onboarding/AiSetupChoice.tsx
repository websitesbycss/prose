import { motion } from 'motion/react'
import { Check, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ollamaLogo, openaiLogo, anthropicLogo, geminiLogo } from './aiSetupLogos'

interface AiSetupChoiceProps {
  /** User picked local Ollama — proceed to the install/download steps. */
  onChooseOllama: () => void
  /** User wants to bring their own cloud API key — skip Ollama entirely and
   * land on the dashboard with Settings > AI already open to configure it. */
  onUseApiKey: () => void
  /** Neither, for now — skip Ollama entirely, no follow-up modal. */
  onSkipForNow: () => void
}

export default function AiSetupChoice({ onChooseOllama, onUseApiKey, onSkipForNow }: AiSetupChoiceProps): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-4 text-foreground">
      <motion.div
        className="flex w-full max-w-3xl flex-col gap-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">Set up AI assistance</h2>
          <p className="text-sm text-muted-foreground">
            Prose can give feedback using a local model or your own API key. You can change this anytime in Settings.
          </p>
        </div>

        <div className="flex flex-col rounded-xl border border-border sm:flex-row">
          {/* Run locally with Ollama */}
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <img src={ollamaLogo} alt="" className="h-6 w-6 object-contain" />
              </div>
              <div className="flex flex-col gap-1">
                <Badge className="w-fit px-1.5 py-0 text-[10px] tracking-wide">RECOMMENDED</Badge>
                <h3 className="text-sm font-semibold">Run locally with Ollama</h3>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Private and fully offline. Nothing leaves your machine.
            </p>

            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                No internet required after setup
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                One-time download (~150 MB Ollama + ~2 GB model)
              </li>
            </ul>

            <Button className="mt-auto w-full" onClick={onChooseOllama}>
              Continue with Ollama
            </Button>
          </div>

          {/* Divider */}
          <div className="relative hidden self-stretch sm:flex">
            <div className="h-full w-px bg-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background px-1.5 text-[11px] text-muted-foreground">
              or
            </span>
          </div>
          <div className="flex items-center gap-3 px-5 sm:hidden">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Use your own API key */}
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="text-sm font-semibold">Use your own API key</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Connect Claude, ChatGPT, Gemini, or any OpenAI-compatible endpoint. Faster to set up — requires an internet connection.
            </p>

            <div className="flex items-center gap-2">
              {[openaiLogo, anthropicLogo, geminiLogo].map((logo, i) => (
                <div key={i} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted">
                  <img src={logo} alt="" className="h-4 w-4 object-contain" />
                </div>
              ))}
            </div>

            <Button variant="outline" className="mt-auto w-full" onClick={onUseApiKey}>
              I&apos;ll use my own API key
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={onSkipForNow}
          className="text-center text-xs text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Skip for now, set this up later in Settings
        </button>
      </motion.div>
    </div>
  )
}
