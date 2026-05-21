import { useState, useRef, useEffect } from 'react'
import { Pipette } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Color math ────────────────────────────────────────────────────────────────

interface Hsv { h: number; s: number; v: number }
type Format = 'hex' | 'rgb' | 'hsl' | 'cmyk'

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100; v /= 100
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '')
  if (h.length === 3)
    return [parseInt(h[0]!.repeat(2), 16), parseInt(h[1]!.repeat(2), 16), parseInt(h[2]!.repeat(2), 16)]
  if (h.length !== 6) return null
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b]
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  const s = max === 0 ? 0 : (d / max) * 100
  const v = max * 100
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6 * 360; break
      case g: h = ((b - r) / d + 2) / 6 * 360; break
      case b: h = ((r - g) / d + 4) / 6 * 360; break
    }
  }
  return [h, s, v]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  return [Math.round(hue(h + 1/3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1/3) * 255)]
}

function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  r /= 255; g /= 255; b /= 255
  const k = 1 - Math.max(r, g, b)
  if (k === 1) return [0, 0, 0, 100]
  return [
    Math.round((1 - r - k) / (1 - k) * 100),
    Math.round((1 - g - k) / (1 - k) * 100),
    Math.round((1 - b - k) / (1 - k) * 100),
    Math.round(k * 100),
  ]
}

function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  c /= 100; m /= 100; y /= 100; k /= 100
  return [Math.round(255 * (1 - c) * (1 - k)), Math.round(255 * (1 - m) * (1 - k)), Math.round(255 * (1 - y) * (1 - k))]
}

function hsvToHex(c: Hsv): string { return rgbToHex(...hsvToRgb(c.h, c.s, c.v)) }

function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [h, s, v] = rgbToHsv(...rgb)
  return { h, s, v }
}

// ── Shared drag hook ──────────────────────────────────────────────────────────

function useDrag(onMove: (e: PointerEvent) => void) {
  const active = useRef(false)
  const cb = useRef(onMove)
  useEffect(() => { cb.current = onMove })
  useEffect(() => {
    const move = (e: PointerEvent) => { if (active.current) cb.current(e) }
    const up = () => { active.current = false }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])
  return active
}

// ── Saturation box ────────────────────────────────────────────────────────────

function SaturationBox({ h, s, v, onChange }: { h: number; s: number; v: number; onChange: (s: number, v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const active = useDrag((e) => pick(e.clientX, e.clientY))

  function pick(cx: number, cy: number) {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    onChange(Math.max(0, Math.min(100, (cx - r.left) / r.width * 100)), Math.max(0, Math.min(100, (1 - (cy - r.top) / r.height) * 100)))
  }

  return (
    <div
      ref={ref}
      className="relative h-[148px] w-full cursor-crosshair select-none overflow-hidden rounded-t-lg"
      style={{ background: `hsl(${h}, 100%, 50%)` }}
      onPointerDown={(e) => { e.preventDefault(); active.current = true; pick(e.clientX, e.clientY) }}
    >
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #fff, transparent)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, #000)' }} />
      <div
        className="pointer-events-none absolute h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{ left: `${s}%`, top: `${100 - v}%`, boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.4)' }}
      />
    </div>
  )
}

// ── Hue slider ────────────────────────────────────────────────────────────────

function HueSlider({ h, onChange }: { h: number; onChange: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const active = useDrag((e) => pick(e.clientX))

  function pick(cx: number) {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    onChange(Math.max(0, Math.min(360, (cx - r.left) / r.width * 360)))
  }

  return (
    <div
      ref={ref}
      className="relative h-3 w-full cursor-pointer select-none rounded-full"
      style={{ background: 'linear-gradient(to right,#f00,#ff8000,#ff0,#80ff00,#0f0,#00ff80,#0ff,#0080ff,#00f,#8000ff,#f0f,#ff0080,#f00)' }}
      onPointerDown={(e) => { e.preventDefault(); active.current = true; pick(e.clientX) }}
    >
      <div
        className="pointer-events-none absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        style={{ left: `${(h / 360) * 100}%`, boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.5)' }}
      />
    </div>
  )
}

// ── ChromeColorPicker ─────────────────────────────────────────────────────────

export interface ChromeColorPickerProps {
  color: string
  onChange: (hex: string) => void
  palette?: string[]
  onPaletteSelect?: (hex: string) => void
  onReset?: () => void
  resetLabel?: string
  current?: string
}

const FORMAT_LABELS: Record<Format, string> = { hex: 'Hex', rgb: 'RGB', hsl: 'HSL', cmyk: 'CMYK' }

function computeInputs(c: Hsv) {
  const [r, g, b] = hsvToRgb(c.h, c.s, c.v)
  const hex = rgbToHex(r, g, b).replace('#', '').toUpperCase()
  const [hl, sl, ll] = rgbToHsl(r, g, b)
  const [cm, mm, ym, km] = rgbToCmyk(r, g, b)
  return {
    hex,
    r: String(r), g: String(g), b: String(b),
    h: String(Math.round(hl)), s: String(Math.round(sl)), l: String(Math.round(ll)),
    c: String(cm), m: String(mm), y: String(ym), k: String(km),
  }
}

export function ChromeColorPicker({
  color,
  onChange,
  palette = [],
  onPaletteSelect,
  onReset,
  resetLabel = 'Reset',
  current = '',
}: ChromeColorPickerProps) {
  const init = hexToHsv(color) ?? { h: 0, s: 0, v: 0 }
  const [hsv, setHsv] = useState<Hsv>(init)
  const [format, setFormat] = useState<Format>('hex')
  const [formatOpen, setFormatOpen] = useState(false)
  const [inputs, setInputs] = useState(() => computeInputs(init))

  const prevColor = useRef(color)

  function isInputActive() { return document.activeElement instanceof HTMLInputElement }

  // Sync picker when an external source (swatch/prop) changes the color
  useEffect(() => {
    if (color === prevColor.current) return
    prevColor.current = color
    const parsed = hexToHsv(color)
    if (parsed) {
      setHsv(parsed)
      if (!isInputActive()) setInputs(computeInputs(parsed))
    }
  }, [color])

  function applyHsv(next: Hsv) {
    setHsv(next)
    const hex = hsvToHex(next)
    prevColor.current = hex
    onChange(hex)
    if (!isInputActive()) setInputs(computeInputs(next))
  }

  // ── Hex ──
  function onHexChange(raw: string) {
    const clean = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
    setInputs((p) => ({ ...p, hex: clean.toUpperCase() }))
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
    if (full.length === 6) {
      const parsed = hexToHsv('#' + full)
      if (parsed) { setHsv(parsed); prevColor.current = '#' + full; onChange('#' + full) }
    }
  }
  function onHexBlur() {
    const full = inputs.hex.replace(/[^0-9a-fA-F]/g, '').padEnd(6, '0').slice(0, 6)
    const parsed = hexToHsv('#' + full)
    if (parsed) { setHsv(parsed); prevColor.current = '#' + full; onChange('#' + full) }
    setInputs((p) => ({ ...p, hex: full.toUpperCase() }))
  }

  // ── RGB ──
  function onRgbChange(field: 'r' | 'g' | 'b', raw: string) {
    const clean = raw.replace(/[^0-9]/g, '').slice(0, 3)
    setInputs((p) => ({ ...p, [field]: clean }))
    const vals = { r: parseInt(inputs.r) || 0, g: parseInt(inputs.g) || 0, b: parseInt(inputs.b) || 0, [field]: Math.min(255, parseInt(clean) || 0) }
    const [h, s, v] = rgbToHsv(vals.r, vals.g, vals.b)
    const next = { h, s, v }
    setHsv(next); prevColor.current = rgbToHex(vals.r, vals.g, vals.b); onChange(prevColor.current)
  }
  function onRgbBlur(field: 'r' | 'g' | 'b') {
    setInputs((p) => ({ ...p, [field]: String(Math.max(0, Math.min(255, parseInt(p[field]) || 0))) }))
  }

  // ── HSL ──
  function onHslChange(field: 'h' | 's' | 'l', raw: string) {
    const clean = raw.replace(/[^0-9]/g, '').slice(0, 3)
    setInputs((p) => ({ ...p, [field]: clean }))
    const maxes = { h: 360, s: 100, l: 100 }
    const vals = { h: parseInt(inputs.h) || 0, s: parseInt(inputs.s) || 0, l: parseInt(inputs.l) || 0, [field]: Math.min(maxes[field], parseInt(clean) || 0) }
    const [r, g, b] = hslToRgb(vals.h, vals.s, vals.l)
    const [hv, sv, vv] = rgbToHsv(r, g, b)
    const next = { h: hv, s: sv, v: vv }
    setHsv(next); prevColor.current = rgbToHex(r, g, b); onChange(prevColor.current)
  }
  function onHslBlur(field: 'h' | 's' | 'l') {
    const max = field === 'h' ? 360 : 100
    setInputs((p) => ({ ...p, [field]: String(Math.max(0, Math.min(max, parseInt(p[field]) || 0))) }))
  }

  // ── CMYK ──
  function onCmykChange(field: 'c' | 'm' | 'y' | 'k', raw: string) {
    const clean = raw.replace(/[^0-9]/g, '').slice(0, 3)
    setInputs((p) => ({ ...p, [field]: clean }))
    const vals = { c: parseInt(inputs.c) || 0, m: parseInt(inputs.m) || 0, y: parseInt(inputs.y) || 0, k: parseInt(inputs.k) || 0, [field]: Math.min(100, parseInt(clean) || 0) }
    const [r, g, b] = cmykToRgb(vals.c, vals.m, vals.y, vals.k)
    const [h, s, v] = rgbToHsv(r, g, b)
    setHsv({ h, s, v }); prevColor.current = rgbToHex(r, g, b); onChange(prevColor.current)
  }
  function onCmykBlur(field: 'c' | 'm' | 'y' | 'k') {
    setInputs((p) => ({ ...p, [field]: String(Math.max(0, Math.min(100, parseInt(p[field]) || 0))) }))
  }

  async function handleEyedropper() {
    if (!('EyeDropper' in window)) return
    try {
      const result = await (new (window as any).EyeDropper() as { open: () => Promise<{ sRGBHex: string }> }).open()
      const parsed = hexToHsv(result.sRGBHex)
      if (parsed) applyHsv(parsed)
    } catch { /* cancelled */ }
  }

  const currentHex = hsvToHex(hsv)
  const paletteLC = palette.map((c) => c.toLowerCase())
  const isCustomActive = !!current && !paletteLC.includes(current.toLowerCase())
  const inputBase = 'min-w-0 w-full bg-transparent text-center font-mono text-[11px] text-white outline-none leading-none'

  return (
    <div className="w-[220px] select-none rounded-lg overflow-hidden" style={{ background: '#1c1c1e' }}>

      {/* Saturation box — has its own overflow-hidden + rounded-t-lg */}
      <SaturationBox h={hsv.h} s={hsv.s} v={hsv.v} onChange={(s, v) => applyHsv({ ...hsv, s, v })} />

      {/* Hue slider + eyedropper + preview */}
      <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5">
        <button
          className="shrink-0 rounded p-0.5 transition-colors"
          style={{ color: '#888' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleEyedropper()}
          title="Pick color from screen"
        >
          <Pipette className="h-3.5 w-3.5" />
        </button>
        <HueSlider h={hsv.h} onChange={(h) => applyHsv({ ...hsv, h })} />
        <div
          className="h-6 w-6 shrink-0 rounded-full"
          style={{ background: currentHex, boxShadow: '0 0 0 1px rgba(255,255,255,0.15), inset 0 0 0 1px rgba(0,0,0,0.2)' }}
        />
      </div>

      {/* Format selector + value inputs */}
      <div className="flex gap-1 px-2.5 pb-2.5">

        {/* Format dropdown — z-50 and no parent overflow-hidden so it always shows fully */}
        <div className="relative shrink-0">
          <button

            className="flex h-7 items-center gap-0.5 rounded px-2 text-[11px] transition-colors hover:bg-white/5"
            style={{ background: '#2e2e30', color: '#aaa' }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setFormatOpen((o) => !o)}
          >
            {FORMAT_LABELS[format]}
            <span className="ml-0.5 text-[9px]" style={{ color: '#555' }}>▾</span>
          </button>
          {formatOpen && (
            <div
              className="absolute left-0 bottom-full z-50 mb-1 min-w-full overflow-hidden rounded"
              style={{ background: '#2e2e30', border: '1px solid #444', boxShadow: '0 4px 12px rgba(0,0,0,0.6)' }}
            >
              {(['hex', 'rgb', 'hsl', 'cmyk'] as Format[]).map((f) => (
                <button
                  key={f}
                  className="block w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-white/10"
                  style={{ color: f === format ? '#EF9F27' : '#ccc' }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setFormat(f); setFormatOpen(false) }}
                >
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hex */}
        {format === 'hex' && (
          <div className="flex h-7 flex-1 min-w-0 items-center rounded px-2" style={{ background: '#2e2e30' }}>
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-white outline-none"
              value={inputs.hex}
              maxLength={6}
              spellCheck={false}
              onChange={(e) => onHexChange(e.target.value)}
              onBlur={onHexBlur}
            />
          </div>
        )}

        {/* RGB */}
        {format === 'rgb' && (
          <div className="flex flex-1 gap-1">
            {(['r', 'g', 'b'] as const).map((f) => (
              <div key={f} className="flex h-7 min-w-0 flex-1 flex-col items-center justify-center rounded py-0.5" style={{ background: '#2e2e30' }}>
                <input className={inputBase} value={inputs[f]} maxLength={3} onChange={(e) => onRgbChange(f, e.target.value)} onBlur={() => onRgbBlur(f)} />
                <span className="text-[8px]" style={{ color: '#555', lineHeight: 1 }}>{f.toUpperCase()}</span>
              </div>
            ))}
          </div>
        )}

        {/* HSL */}
        {format === 'hsl' && (
          <div className="flex flex-1 gap-1">
            {(['h', 's', 'l'] as const).map((f) => (
              <div key={f} className="flex h-7 min-w-0 flex-1 flex-col items-center justify-center rounded py-0.5" style={{ background: '#2e2e30' }}>
                <input className={inputBase} value={inputs[f]} maxLength={3} onChange={(e) => onHslChange(f, e.target.value)} onBlur={() => onHslBlur(f)} />
                <span className="text-[8px]" style={{ color: '#555', lineHeight: 1 }}>{f.toUpperCase()}</span>
              </div>
            ))}
          </div>
        )}

        {/* CMYK */}
        {format === 'cmyk' && (
          <div className="flex flex-1 gap-1">
            {(['c', 'm', 'y', 'k'] as const).map((f) => (
              <div key={f} className="flex h-7 min-w-0 flex-1 flex-col items-center justify-center rounded py-0.5" style={{ background: '#2e2e30' }}>
                <input className={inputBase} value={inputs[f]} maxLength={3} onChange={(e) => onCmykChange(f, e.target.value)} onBlur={() => onCmykBlur(f)} />
                <span className="text-[8px]" style={{ color: '#555', lineHeight: 1 }}>{f.toUpperCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Palette swatches */}
      {palette.length > 0 && (
        <div className="border-t px-2.5 pb-2.5" style={{ borderColor: '#2e2e30' }}>
          <div className="flex flex-wrap justify-center gap-[8px] pt-2.5">
            {palette.map((c) => (
              <button
                key={c}
                className={cn(
                  'h-[22px] w-[22px] rounded transition-all',
                  current.toLowerCase() === c.toLowerCase() && !isCustomActive
                    ? 'ring-2 ring-[#EF9F27] ring-offset-1 ring-offset-[#1c1c1e]'
                    : 'hover:ring-2 hover:ring-white/40 hover:ring-offset-1 hover:ring-offset-[#1c1c1e]'
                )}
                style={{ backgroundColor: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPaletteSelect?.(c)}
                title={c}
              />
            ))}
          </div>
          {isCustomActive && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="h-[22px] w-[22px] shrink-0 rounded ring-2 ring-[#EF9F27] ring-offset-1 ring-offset-[#1c1c1e]" style={{ backgroundColor: current }} />
              <span className="font-mono text-[10px]" style={{ color: '#888' }}>{current.toUpperCase()}</span>
            </div>
          )}
        </div>
      )}

      {/* Reset */}
      {onReset && (
        <div className="border-t px-2.5 py-1.5" style={{ borderColor: '#2e2e30' }}>
          <button
            className="w-full rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-white/5"
            style={{ color: '#888' }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onReset}
          >
            {resetLabel}
          </button>
        </div>
      )}
    </div>
  )
}
