import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { BookOpen } from 'lucide-react'

interface WelcomeProps {
  onNext: () => void
}

export default function Welcome({ onNext }: WelcomeProps): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <motion.div
        className="flex flex-col items-center gap-6 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Prose</h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            A focused writing environment with built-in AI feedback — fully offline, always private.
          </p>
        </div>

        <Button className="mt-2 px-8" onClick={onNext}>
          Get started
        </Button>
      </motion.div>
    </div>
  )
}
