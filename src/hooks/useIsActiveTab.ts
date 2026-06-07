import { useAppStore } from '@/store/appStore'

/** True when this file tab is the one currently shown in the editor area. */
export function useIsActiveTab(documentId: string): boolean {
  const activeDocumentId = useAppStore((s) => s.activeDocumentId)
  const showDashboard = useAppStore((s) => s.showDashboard)
  return !showDashboard && activeDocumentId === documentId
}
