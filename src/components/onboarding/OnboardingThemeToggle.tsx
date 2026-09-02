import { Sun, Moon } from 'lucide-react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { useAppStore } from '@/store/appStore'

/** Fixed bottom-left light/dark toggle shown throughout onboarding, before the
 * dashboard (which has its own theme toggle in the sidebar) is reachable. A
 * bespoke (not the shared ui/switch) bigger switch whose thumb carries the
 * sun/moon icon, since the shared Switch has no slot for that. */
export function OnboardingThemeToggle(): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const isDark = theme === 'dark'

  return (
    <SwitchPrimitives.Root
      checked={isDark}
      onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="fixed bottom-4 left-4 z-50 inline-flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:bg-slate-700 data-[state=unchecked]:bg-amber-300"
    >
      <SwitchPrimitives.Thumb
        className="pointer-events-none flex h-7 w-7 translate-x-1 items-center justify-center rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-8"
      >
        {isDark ? <Moon className="h-4 w-4 text-slate-700" /> : <Sun className="h-4 w-4 text-amber-500" />}
      </SwitchPrimitives.Thumb>
    </SwitchPrimitives.Root>
  )
}
