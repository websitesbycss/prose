import { useState, useCallback } from 'react'
import { X, Plus, Trash2, Image, Type } from 'lucide-react'
import type { SlideMaster, SlideMasterElement, PresentationTheme, SlideBackground } from '@/types/slides'
import { SlideBackground as SlideBackgroundRenderer } from '../canvas/SlideBackground'
import { SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import { cn } from '@/lib/utils'

interface Props {
  master: SlideMaster
  theme: PresentationTheme
  onChange(master: SlideMaster): void
  onClose(): void
}

const PREVIEW_W = 480
const PREVIEW_SCALE = PREVIEW_W / SLIDE_BASE_WIDTH
const PREVIEW_H = Math.round(PREVIEW_W * SLIDE_BASE_HEIGHT / SLIDE_BASE_WIDTH)

function uuid() { return crypto.randomUUID() }

export function SlideMasterEditor({ master, theme, onChange, onClose }: Props): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)

  const addLogo = useCallback(async (): Promise<void> => {
    try {
      const src = await window.prose.dialog.openImage()
      if (!src) return
      const el: SlideMasterElement = {
        id: uuid(), type: 'logo',
        x: 80, y: 88, width: 12, height: 8,
        src,
      }
      onChange({ ...master, elements: [...master.elements, el] })
    } catch { /* cancelled */ }
  }, [master, onChange])

  const addFooter = useCallback((): void => {
    const el: SlideMasterElement = {
      id: uuid(), type: 'footer',
      x: 5, y: 93, width: 70, height: 5,
      content: 'Presentation Footer', fontSize: 16, color: theme.textColor, align: 'left',
    }
    onChange({ ...master, elements: [...master.elements, el] })
  }, [master, theme, onChange])

  const updateEl = useCallback((id: string, partial: Partial<SlideMasterElement>): void => {
    onChange({
      ...master,
      elements: master.elements.map((e) => e.id === id ? { ...e, ...partial } : e),
    })
  }, [master, onChange])

  const deleteEl = useCallback((id: string): void => {
    onChange({ ...master, elements: master.elements.filter((e) => e.id !== id) })
    if (selected === id) setSelected(null)
  }, [master, onChange, selected])

  const selectedEl = master.elements.find((e) => e.id === selected) ?? null

  return (
    <div className="fixed inset-0 z-[99990] flex flex-col bg-background">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div>
          <span className="text-sm font-semibold text-foreground">Slide Master</span>
          <span className="ml-2 text-xs text-muted-foreground">Changes apply to all slides</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => void addLogo()}
          >
            <Image className="h-3 w-3" /> Add logo
          </button>
          <button
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={addFooter}
          >
            <Type className="h-3 w-3" /> Add footer
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex min-h-0 flex-1">
        {/* Preview */}
        <div className="flex flex-1 items-center justify-center bg-muted/20">
          <div
            style={{ width: PREVIEW_W, height: PREVIEW_H, position: 'relative', overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.2)' }}
          >
            <SlideBackgroundRenderer background={master.background} theme={theme} />
            {master.elements.map((el) => (
              <div
                key={el.id}
                style={{
                  position: 'absolute',
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                  cursor: 'pointer',
                  outline: selected === el.id ? '2px solid #3b82f6' : '1px dashed rgba(100,100,255,0.4)',
                  outlineOffset: 1,
                  overflow: 'hidden',
                }}
                onClick={() => setSelected(el.id)}
              >
                {el.type === 'logo' && el.src && (
                  <img src={el.src} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
                {el.type === 'footer' && (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center',
                    fontSize: (el.fontSize ?? 16) * PREVIEW_SCALE,
                    color: el.color ?? theme.textColor,
                    textAlign: el.align ?? 'left',
                  }}>
                    {el.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Properties panel */}
        <div className="flex w-64 shrink-0 flex-col border-l border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-medium text-foreground">Background</p>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-muted-foreground">Color</label>
              <input
                type="color"
                value={master.background?.type === 'solid' ? master.background.color : theme.backgroundColor}
                onChange={(e) => onChange({
                  ...master,
                  background: { type: 'solid', color: e.target.value },
                })}
                className="h-6 w-10 cursor-pointer rounded border border-border"
              />
            </div>
          </div>

          {selectedEl && (
            <>
              <div className="border-b border-t border-border px-4 py-3">
                <p className="text-xs font-medium text-foreground capitalize">{selectedEl.type} properties</p>
              </div>
              <div className="flex flex-col gap-3 px-4 py-3 text-[11px]">
                {/* Position */}
                <div className="grid grid-cols-2 gap-2">
                  {(['x', 'y', 'width', 'height'] as const).map((field) => (
                    <label key={field} className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground uppercase">{field}</span>
                      <input
                        type="number"
                        step={0.5}
                        value={selectedEl[field]}
                        onChange={(e) => updateEl(selectedEl.id, { [field]: Number(e.target.value) })}
                        className="rounded border border-border bg-background px-1.5 py-1 text-foreground focus:outline-none"
                      />
                    </label>
                  ))}
                </div>

                {selectedEl.type === 'footer' && (
                  <>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Text</span>
                      <input
                        type="text"
                        value={selectedEl.content ?? ''}
                        onChange={(e) => updateEl(selectedEl.id, { content: e.target.value })}
                        className="rounded border border-border bg-background px-1.5 py-1 text-foreground focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Color</span>
                      <input
                        type="color"
                        value={selectedEl.color ?? theme.textColor}
                        onChange={(e) => updateEl(selectedEl.id, { color: e.target.value })}
                        className="h-6 w-full cursor-pointer rounded border border-border"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Font size</span>
                      <input
                        type="number"
                        value={selectedEl.fontSize ?? 16}
                        onChange={(e) => updateEl(selectedEl.id, { fontSize: Number(e.target.value) })}
                        className="rounded border border-border bg-background px-1.5 py-1 text-foreground focus:outline-none"
                      />
                    </label>
                  </>
                )}

                <button
                  className="flex items-center gap-1.5 rounded border border-destructive/50 px-2 py-1 text-destructive transition-colors hover:bg-destructive/10"
                  onClick={() => deleteEl(selectedEl.id)}
                >
                  <Trash2 className="h-3 w-3" />
                  Remove element
                </button>
              </div>
            </>
          )}

          {master.elements.length === 0 && !selectedEl && (
            <div className="flex flex-col items-center justify-center gap-2 flex-1 px-4 text-center">
              <p className="text-xs text-muted-foreground">No master elements yet.</p>
              <p className="text-[10px] text-muted-foreground/60">Add a logo or footer above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
