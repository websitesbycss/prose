// Curated Lucide icon set for AI-generated "icon-list" slides. Lucide has
// 1000+ icons — rather than fuzzy-matching a freeform keyword against all of
// them (fragile, unpredictable results), the model is given this exact list
// in the prompt and must pick from it verbatim. Kebab-case names, matching
// Lucide's own icon-slug convention, since that's what the model is asked to
// emit and it reads more naturally than PascalCase in a prompt.
//
// lucide-react is already a dependency (used throughout Prose's own UI
// chrome), so this adds zero new packages — just a curated subset of it,
// statically imported so a bad/unknown name from the model fails a safe
// lookup instead of a runtime import error.
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import DOMPurify from 'dompurify'
import type { LucideIcon } from 'lucide-react'
import {
  TrendingUp, TrendingDown, BarChart3, PieChart, LineChart, DollarSign, CreditCard, Wallet,
  Briefcase, Building2, Handshake, Target, Award, Trophy, Percent, Gauge,
  Users, GraduationCap, Star, Heart, ThumbsUp, MessageCircle, Megaphone,
  Code, Database, Cloud, Server, Cpu, Smartphone, Laptop, Monitor, Wifi, Lock, Unlock, Key, Network, Settings,
  Lightbulb, Sparkles, Brain, Rocket, Compass, Flag, Puzzle, Scale, Zap,
  Clock, Calendar, CalendarCheck, Timer, RefreshCw, ListChecks, ClipboardList,
  Mail, Send, Phone, Inbox, Share2, Link2,
  ShieldCheck, CheckCircle2, AlertTriangle, Eye, Bell,
  Package, Truck, Home, Globe, MapPin, Book, BookOpen, Camera, Palette, Music, Video, Headphones,
  Gift, Leaf, Flame, Mountain, Sun, Moon, Droplet, Plane, Car, Ship, Factory, Wrench, Hammer,
  Store, ShoppingCart, FileText, Folder, Bookmark, Tag, HelpCircle, Info, ArrowRight, CheckSquare, XCircle, PlusCircle,
} from 'lucide-react'

export const CURATED_ICONS: Record<string, LucideIcon> = {
  'trending-up': TrendingUp, 'trending-down': TrendingDown, 'bar-chart': BarChart3, 'pie-chart': PieChart,
  'line-chart': LineChart, 'dollar-sign': DollarSign, 'credit-card': CreditCard, wallet: Wallet,
  briefcase: Briefcase, building: Building2, handshake: Handshake, target: Target, award: Award,
  trophy: Trophy, percent: Percent, gauge: Gauge,
  users: Users, 'graduation-cap': GraduationCap, star: Star, heart: Heart, 'thumbs-up': ThumbsUp,
  'message-circle': MessageCircle, megaphone: Megaphone,
  code: Code, database: Database, cloud: Cloud, server: Server, cpu: Cpu, smartphone: Smartphone,
  laptop: Laptop, monitor: Monitor, wifi: Wifi, lock: Lock, unlock: Unlock, key: Key, network: Network, settings: Settings,
  lightbulb: Lightbulb, sparkles: Sparkles, brain: Brain, rocket: Rocket, compass: Compass, flag: Flag,
  puzzle: Puzzle, scale: Scale, zap: Zap,
  clock: Clock, calendar: Calendar, 'calendar-check': CalendarCheck, timer: Timer, 'refresh-cw': RefreshCw,
  'list-checks': ListChecks, clipboard: ClipboardList,
  mail: Mail, send: Send, phone: Phone, inbox: Inbox, share: Share2, link: Link2,
  shield: ShieldCheck, 'check-circle': CheckCircle2, 'alert-triangle': AlertTriangle, eye: Eye, bell: Bell,
  package: Package, truck: Truck, home: Home, globe: Globe, 'map-pin': MapPin, book: Book, 'book-open': BookOpen,
  camera: Camera, palette: Palette, music: Music, video: Video, headphones: Headphones,
  gift: Gift, leaf: Leaf, flame: Flame, mountain: Mountain, sun: Sun, moon: Moon, droplet: Droplet,
  plane: Plane, car: Car, ship: Ship, factory: Factory, wrench: Wrench, hammer: Hammer,
  store: Store, cart: ShoppingCart, document: FileText, folder: Folder, bookmark: Bookmark, tag: Tag,
  question: HelpCircle, info: Info, arrow: ArrowRight, check: CheckSquare, x: XCircle, plus: PlusCircle,
}

/** Comma-joined name list for embedding directly in the generation prompt. */
export const CURATED_ICON_LIST_PROMPT = Object.keys(CURATED_ICONS).join(', ')

export function resolveLucideIcon(name: string): LucideIcon | null {
  return CURATED_ICONS[name.trim().toLowerCase()] ?? null
}

// ── Off-screen rendering ──────────────────────────────────────────────────────
// Renders a curated icon to a sanitized standalone SVG string, off screen.
// This is synchronous, local data — no LLM round-trip, no network — so
// icon-list slides fill in instantly instead of resolving asynchronously the
// way AI-drawn illustrations do. Mirrors the off-screen createRoot+flushSync
// pattern slideRasterizer.tsx already uses for html2canvas captures.

export function iconToSvgString(name: string, color: string): string | null {
  const Icon = resolveLucideIcon(name)
  if (!Icon) return null

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;'
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    flushSync(() => {
      root.render(createElement(Icon, { color, strokeWidth: 1.5, width: 200, height: 200 }))
    })
    const svg = container.querySelector('svg')
    if (!svg) return null
    return DOMPurify.sanitize(svg.outerHTML, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'object', 'embed', 'link'],
    })
  } finally {
    root.unmount()
    document.body.removeChild(container)
  }
}
