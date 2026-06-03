import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppSettings } from '@/types'

export interface Track {
  id: string
  title: string
  category: string
  src: string
}

export interface AmbientLayer {
  id: string
  label: string
  src: string
}

export const TRACKS: Track[] = [
  { id: 'lofi-jazz-1', title: 'Late Night Study', category: 'Lo-fi Jazz', src: '/sounds/lofi-jazz-1.mp3' },
  { id: 'lofi-jazz-2', title: 'Morning Coffee', category: 'Lo-fi Jazz', src: '/sounds/lofi-jazz-2.mp3' },
  { id: 'calm-lofi', title: 'Calm Lo-Fi', category: 'Lo-fi', src: '/sounds/calm-lofi.mp3' },
  { id: 'late-night-lofi', title: 'Late Night Lo-Fi', category: 'Lo-fi', src: '/sounds/late-night-lofi.mp3' },
  { id: 'classical', title: 'Classical Piano', category: 'Piano', src: '/sounds/classical.mp3' },
  { id: 'cinematic', title: 'Cinematic Piano', category: 'Piano', src: '/sounds/cinematic.mp3' },
  { id: 'quartet-dark', title: 'Dark Quartet', category: 'Chamber', src: '/sounds/quartet-dark.mp3' },
  { id: 'light-quartet', title: 'Light Quartet', category: 'Chamber', src: '/sounds/quartet-light.mp3' },
]

export const AMBIENT_LAYERS: AmbientLayer[] = [
  { id: 'rain', label: 'Rain', src: '/sounds/rain.mp3' },
  { id: 'rainforest', label: 'Rainforest', src: '/sounds/rainforest.mp3' },
  { id: 'fireplace', label: 'Fireplace', src: '/sounds/fireplace.mp3' },
  { id: 'cafe', label: 'Café', src: '/sounds/cafe.mp3' },
  { id: 'whitenoise', label: 'White Noise', src: '/sounds/whitenoise.mp3' },
  { id: 'brownnoise', label: 'Brown Noise', src: '/sounds/brownnoise.mp3' },
]

const DEFAULT_AMBIENT_VOLUME = 30
/** Rain and café source files run quiet — higher default slider + playback gain. */
const LOUD_AMBIENT_DEFAULT = 55
const AMBIENT_PLAYBACK_GAIN: Record<string, number> = {
  rain: 1.35,
  cafe: 1.35,
}

const DEFAULT_AMBIENT_VOLUMES: Record<string, number> = Object.fromEntries(
  AMBIENT_LAYERS.map((l) => [
    l.id,
    l.id === 'rain' || l.id === 'cafe' ? LOUD_AMBIENT_DEFAULT : DEFAULT_AMBIENT_VOLUME,
  ]),
)

export interface MusicState {
  trackIndex: number
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  ambientEnabled: Record<string, boolean>
  ambientVolumes: Record<string, number>
  nowPlayingTitle: string | null
}

export interface MusicControls {
  play(): void
  pause(): void
  toggle(): void
  next(): void
  prev(): void
  seek(t: number): void
  switchTrack(index: number): void
  setVolume(v: number): void
  setAmbientEnabled(id: string, on: boolean): void
  setAmbientVolume(id: string, v: number): void
}

export type MusicHook = MusicState & MusicControls

function formatTrackSrc(src: string): string {
  return src
}

function ambientVolumeFraction(id: string, volumes: Record<string, number>): number {
  const v = volumes[id] ?? DEFAULT_AMBIENT_VOLUMES[id] ?? DEFAULT_AMBIENT_VOLUME
  const gain = AMBIENT_PLAYBACK_GAIN[id] ?? 1
  return Math.min(1, Math.max(0, (v / 100) * gain))
}

export function useMusic(): MusicHook {
  const trackRef = useRef<HTMLAudioElement | null>(null)
  const ambientRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const rafRef = useRef<number>(0)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs mirror state so callbacks always see the latest values
  const playingRef = useRef(false)
  const volumeRef = useRef(45)
  const trackIndexRef = useRef(0)
  const ambientEnabledRef = useRef<Record<string, boolean>>({})
  const ambientVolumesRef = useRef<Record<string, number>>({ ...DEFAULT_AMBIENT_VOLUMES })

  const [trackIndex, setTrackIndexUI] = useState(0)
  const [playing, setPlayingUI] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeUI] = useState(45)
  const [ambientEnabled, setAmbientEnabledUI] = useState<Record<string, boolean>>({})
  const [ambientVolumes, setAmbientVolumesUI] = useState<Record<string, number>>({
    ...DEFAULT_AMBIENT_VOLUMES,
  })

  const syncAmbientElementVolumes = useCallback((): void => {
    ambientRef.current.forEach((el, id) => {
      el.volume = ambientVolumeFraction(id, ambientVolumesRef.current)
    })
  }, [])

  const playAmbientLayer = useCallback((id: string): void => {
    const el = ambientRef.current.get(id)
    if (!el) return
    const applyVolume = (): void => {
      el.volume = ambientVolumeFraction(id, ambientVolumesRef.current)
    }
    applyVolume()
    const tryPlay = (): void => {
      applyVolume()
      void el.play().catch(() => {})
    }
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay()
      return
    }
    el.addEventListener('canplay', tryPlay, { once: true })
    if (el.readyState === HTMLMediaElement.HAVE_NOTHING) {
      el.load()
    }
  }, [])

  // Load persisted settings once on mount
  useEffect(() => {
    void window.prose.settings.get().then((s) => {
      const settings = s as AppSettings
      const vol = settings.musicVolume
      const av = settings.ambientVolumes ?? {}
      volumeRef.current = vol
      setVolumeUI(vol)
      ambientVolumesRef.current = { ...DEFAULT_AMBIENT_VOLUMES, ...av }
      setAmbientVolumesUI({ ...ambientVolumesRef.current })
      if (trackRef.current) trackRef.current.volume = vol / 100
      syncAmbientElementVolumes()
    })
  }, [syncAmbientElementVolumes])

  // Create ambient audio elements on mount
  useEffect(() => {
    for (const layer of AMBIENT_LAYERS) {
      const el = new Audio(formatTrackSrc(layer.src))
      el.loop = true
      el.preload = 'auto'
      el.volume = ambientVolumeFraction(layer.id, ambientVolumesRef.current)
      ambientRef.current.set(layer.id, el)
      el.load()
    }
    return () => {
      ambientRef.current.forEach((el) => el.pause())
      ambientRef.current.clear()
    }
  }, [])

  // Create track audio element on mount
  useEffect(() => {
    const src = TRACKS[0]?.src ?? ''
    const el = new Audio(formatTrackSrc(src))
    el.loop = true
    el.volume = volumeRef.current / 100
    el.addEventListener('loadedmetadata', () => setDuration(el.duration))
    trackRef.current = el
    return () => {
      cancelAnimationFrame(rafRef.current)
      el.pause()
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // RAF progress tracking while playing
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = (): void => {
      if (trackRef.current) setCurrentTime(trackRef.current.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing])

  function persistSettings(vol: number, av: Record<string, number>): void {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void window.prose.settings.set({ musicVolume: vol, ambientVolumes: av }).catch(() => {})
    }, 800)
  }

  function loadTrack(index: number, autoPlay: boolean): void {
    const track = TRACKS[index]
    if (!track) return

    const prev = trackRef.current
    if (prev) {
      prev.pause()
      prev.src = ''
    }

    const el = new Audio(formatTrackSrc(track.src))
    el.loop = true
    el.volume = volumeRef.current / 100
    el.addEventListener('loadedmetadata', () => setDuration(el.duration))
    trackRef.current = el
    trackIndexRef.current = index
    setTrackIndexUI(index)
    setCurrentTime(0)
    setDuration(0)

    if (autoPlay) {
      void el.play().catch(() => {})
      playingRef.current = true
      setPlayingUI(true)
    } else {
      playingRef.current = false
      setPlayingUI(false)
    }
  }

  const play = useCallback((): void => {
    if (!trackRef.current) return
    void trackRef.current.play().catch(() => {})
    playingRef.current = true
    setPlayingUI(true)
  }, [])

  const pause = useCallback((): void => {
    trackRef.current?.pause()
    playingRef.current = false
    setPlayingUI(false)
  }, [])

  const toggle = useCallback((): void => {
    if (playingRef.current) {
      trackRef.current?.pause()
      playingRef.current = false
      setPlayingUI(false)
    } else {
      if (!trackRef.current) return
      void trackRef.current.play().catch(() => {})
      playingRef.current = true
      setPlayingUI(true)
    }
  }, [])

  const next = useCallback((): void => {
    const nextIndex = (trackIndexRef.current + 1) % TRACKS.length
    loadTrack(nextIndex, playingRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const prev = useCallback((): void => {
    if (trackRef.current && trackRef.current.currentTime > 3) {
      trackRef.current.currentTime = 0
      setCurrentTime(0)
      return
    }
    const prevIndex = (trackIndexRef.current - 1 + TRACKS.length) % TRACKS.length
    loadTrack(prevIndex, playingRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const seek = useCallback((t: number): void => {
    if (trackRef.current) {
      trackRef.current.currentTime = t
      setCurrentTime(t)
    }
  }, [])

  const setVolume = useCallback((v: number): void => {
    volumeRef.current = v
    setVolumeUI(v)
    if (trackRef.current) trackRef.current.volume = v / 100
    persistSettings(v, ambientVolumesRef.current)
  }, [])

  const switchTrack = useCallback((index: number): void => {
    loadTrack(index, playingRef.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setAmbientEnabled = useCallback((id: string, on: boolean): void => {
    ambientEnabledRef.current = { ...ambientEnabledRef.current, [id]: on }
    setAmbientEnabledUI({ ...ambientEnabledRef.current })
    const el = ambientRef.current.get(id)
    if (!el) return
    if (on) {
      playAmbientLayer(id)
    } else {
      el.pause()
    }
  }, [playAmbientLayer])

  const setAmbientVolume = useCallback((id: string, v: number): void => {
    const clamped = Math.min(100, Math.max(0, v))
    ambientVolumesRef.current = { ...ambientVolumesRef.current, [id]: clamped }
    setAmbientVolumesUI({ ...ambientVolumesRef.current })
    const el = ambientRef.current.get(id)
    if (el) el.volume = clamped / 100
    persistSettings(volumeRef.current, ambientVolumesRef.current)
  }, [])

  const nowPlayingTitle = playing ? (TRACKS[trackIndex]?.title ?? null) : null

  return {
    trackIndex,
    playing,
    currentTime,
    duration,
    volume,
    ambientEnabled,
    ambientVolumes,
    nowPlayingTitle,
    play,
    pause,
    toggle,
    next,
    prev,
    seek,
    switchTrack,
    setVolume,
    setAmbientEnabled,
    setAmbientVolume,
  }
}
