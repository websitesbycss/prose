import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { BUILT_IN_THEMES } from './builtInThemes'
import type { PresentationTheme, Slide } from '@/types/slides'
import { cn } from '@/lib/utils'

interface Props {
  theme: PresentationTheme
  slides: Slide[]
  onApplyTheme(theme: PresentationTheme, updatedSlides: Slide[]): void
  onClose(): void
  anchorRect: DOMRect
}

// When applying a theme, update slide backgrounds that still match the old theme default.
// Elements with manually set colors (not matching any known theme's textColor) are left alone.
function applyThemeToSlides(slides: Slide[], oldTheme: PresentationTheme, newTheme: PresentationTheme): Slide[] {
  return slides.map((slide) => ({
    ...slide,
    // Update background if it matched old theme
    background: slide.background?.type === 'solid' && slide.background.color === oldTheme.backgroundColor
      ? { ...slide.background, color: newTheme.backgroundColor }
      : slide.background,
    elements: slide.elements.map((el) => {
      if (el.type === 'text' && el.color === oldTheme.textColor) {
        return { ...el, color: newTheme.textColor, fontFamily: newTheme.bodyFontFamily }
      }
      return el
    }),
  }))
}

export function ThemePanel({ theme, slides, onApplyTheme, onClose, anchorRect }: Props): JSX.Element {
  function handleSelect(t: PresentationTheme): void {
    const updatedSlides = applyThemeToSlides(slides, theme, t)
    onApplyTheme(t, updatedSlides)
    onClose()
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[99990]" onClick={onClose} />

      <div
        className="fixed z-[99991] w-72 rounded-xl border border-border bg-background p-4 shadow-2xl"
        style={{ top: anchorRect.bottom + 8, right: window.innerWidth - anchorRect.right }}
      >
        <h3 className="mb-3 text-[13px] font-semibold text-foreground">Presentation theme</h3>

        <div className="grid grid-cols-2 gap-2">
          {BUILT_IN_THEMES.map((t) => (
            <button
              key={t.id}
              className={cn(
                'relative flex flex-col items-start gap-1 overflow-hidden rounded-lg border-2 p-0 transition-all hover:scale-[1.02]',
                theme.id === t.id ? 'border-primary' : 'border-border hover:border-border/80',
              )}
              onClick={() => handleSelect(t)}
            >
              {/* Color preview */}
              <div
                className="flex h-16 w-full items-center justify-center gap-1"
                style={{ background: t.backgroundColor }}
              >
                <div className="h-6 w-1.5 rounded-sm" style={{ background: t.primaryColor }} />
                <div className="h-4 w-1 rounded-sm" style={{ background: t.secondaryColor }} />
                <div
                  className="text-[10px] font-semibold"
                  style={{ color: t.textColor, fontFamily: t.headingFontFamily }}
                >
                  Aa
                </div>
              </div>

              <div className="w-full px-2 pb-2">
                <span className="text-[11px] font-medium text-foreground">{t.name}</span>
              </div>

              {theme.id === t.id && (
                <div className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Custom theme hint */}
        <p className="mt-3 text-[10px] text-muted-foreground/60">
          Applying a theme updates slides using the previous theme's default colors.
          Manually-customized elements are preserved.
        </p>
      </div>
    </>,
    document.body,
  )
}
