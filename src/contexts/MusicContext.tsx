import { createContext, useContext } from 'react'
import type { MusicHook } from '@/hooks/useMusic'

export const MusicContext = createContext<MusicHook | null>(null)

export function useMusicContext(): MusicHook | null {
  return useContext(MusicContext)
}
