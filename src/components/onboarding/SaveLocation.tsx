import { useState } from 'react'
import { motion } from 'motion/react'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SaveLocationProps {
  defaultFolder: string
  onNext: (folder: string | null) => void
}

export default function SaveLocation({ defaultFolder, onNext }: SaveLocationProps): JSX.Element {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  async function handlePickFolder(): Promise<void> {
    const picked = await window.prose.documents.pickFolder()
    if (picked) setSelectedFolder(picked)
  }

  async function handleContinue(): Promise<void> {
    if (selectedFolder) {
      await window.prose.documents.setFolder(selectedFolder)
    }
    onNext(selectedFolder)
  }

  const displayPath = selectedFolder ?? defaultFolder

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <motion.div
        className="flex flex-col gap-6 w-full max-w-sm px-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Where should documents be saved?</h2>
          <p className="text-sm text-muted-foreground">
            Prose stores your documents as individual files so you can access them from any app.
          </p>
        </div>

        {/* Path display — click to change it */}
        <button
          type="button"
          onClick={() => void handlePickFolder()}
          className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:border-border/80 hover:bg-muted/60"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={`flex-1 truncate text-xs ${selectedFolder ? 'text-foreground' : 'text-muted-foreground'}`}>
            {displayPath}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">Change…</span>
        </button>

        <div className="flex justify-end">
          <Button onClick={() => void handleContinue()}>
            Continue
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
