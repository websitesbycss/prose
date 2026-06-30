import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { WindowControls } from '@/components/WindowControls'
import { useTitleBarOverlayInset, usesNativeWindowControls } from '@/hooks/useTitleBarOverlayInset'

interface TitleBarFrameProps {
  children: ReactNode
  /** Extra controls (AI toggle, theme) that must stay left of native window buttons. */
  trailing?: ReactNode
  className?: string
}

/**
 * Shared title bar shell: tab strip + optional trailing actions + window controls.
 * On Windows 11, native overlay buttons replace custom WindowControls; content is
 * inset so tabs never render under the OS chrome.
 */
export function TitleBarFrame({ children, trailing, className }: TitleBarFrameProps): JSX.Element {
  const nativeControls = usesNativeWindowControls()
  useTitleBarOverlayInset(nativeControls)

  return (
    <div
      className={cn(
        'title-bar flex h-10 shrink-0 items-stretch border-b border-border pl-3 text-foreground',
        nativeControls && 'title-bar--native',
        className,
      )}
    >
      <div className="title-bar__content flex min-w-0 flex-1 items-center">
        {children}
        {trailing}
      </div>
      {!nativeControls && <WindowControls />}
    </div>
  )
}
