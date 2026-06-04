import { useEffect, useState } from 'react'
import NewDocumentModal from '@/components/dashboard/NewDocumentModal'
import { useAppStore } from '@/store/appStore'
import type { Category, Document } from '@/types'

/** App-level new document modal — usable from the tab bar, dashboard, or anywhere else. */
export function GlobalNewDocumentModal(): JSX.Element {
  const open = useAppStore((s) => s.newDocumentModalOpen)
  const setOpen = useAppStore((s) => s.setNewDocumentModalOpen)
  const openDocumentTab = useAppStore((s) => s.openDocumentTab)
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    if (!open) return
    void window.prose.categories.getAll().then((cats) => {
      setCategories(cats as Category[])
    })
  }, [open])

  function handleCreated(doc: Document): void {
    setOpen(false)
    openDocumentTab({ id: doc.id, title: doc.title, format: doc.format })
    window.dispatchEvent(new CustomEvent('prose-document-created', { detail: doc }))
  }

  return (
    <NewDocumentModal
      open={open}
      categories={categories}
      onClose={() => setOpen(false)}
      onCreated={handleCreated}
    />
  )
}
