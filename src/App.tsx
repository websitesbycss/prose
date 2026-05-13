import { Toaster } from 'sonner'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Prose</h1>
          <p className="text-muted-foreground">
            A focused writing environment. Phase 1 — scaffold complete.
          </p>
          <Button>Get started</Button>
        </div>
      </div>
      <Toaster theme={theme} richColors />
    </div>
  )
}
