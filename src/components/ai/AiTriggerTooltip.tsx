import type { ReactNode } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

/**
 * Wraps an AI-trigger button (the toolbar sparkle icon, etc.) so it still
 * shows a tooltip when disabled. A plain Tooltip around a `disabled` button
 * doesn't work — Tailwind's `disabled:pointer-events-none` blocks the hover
 * events Radix's Tooltip relies on — so the actual trigger is a wrapping
 * span, which stays hoverable even when the button inside it is disabled.
 */
export function AiTriggerTooltip({ unavailable, readyLabel, children }: {
  unavailable: boolean
  readyLabel: string
  children: ReactNode
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={unavailable ? 'inline-flex cursor-not-allowed' : 'inline-flex'}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {unavailable ? 'Set up AI in Settings to use this feature' : readyLabel}
      </TooltipContent>
    </Tooltip>
  )
}
