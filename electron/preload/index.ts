import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('prose', {
  documents: {
    getAll: () => ipcRenderer.invoke('documents:getAll'),
    getById: (id: string) => ipcRenderer.invoke('documents:getById', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('documents:create', data),
    update: (id: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('documents:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('documents:delete', id),
  },

  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('categories:create', data),
    update: (id: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('categories:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('categories:delete', id),
  },

  ai: {
    prompt: (payload: Record<string, unknown>) => ipcRenderer.invoke('ai:prompt', payload),
    getStatus: () => ipcRenderer.invoke('ai:getStatus'),
    streamPrompt: (
      payload: Record<string, unknown>,
      onChunk: (chunk: string) => void
    ): Promise<void> => {
      const listener = (_: Electron.IpcRendererEvent, chunk: string): void => onChunk(chunk)
      ipcRenderer.on('ai:stream-chunk', listener)
      return ipcRenderer.invoke('ai:streamPrompt', payload).finally(() => {
        ipcRenderer.removeListener('ai:stream-chunk', listener)
      })
    },
  },

  export: {
    toDocx: (id: string) => ipcRenderer.invoke('export:toDocx', id),
    toPdf: (id: string) => ipcRenderer.invoke('export:toPdf', id),
    toMarkdown: (id: string) => ipcRenderer.invoke('export:toMarkdown', id),
    toPlainText: (id: string) => ipcRenderer.invoke('export:toPlainText', id),
    saveImage: (src: string) => ipcRenderer.invoke('export:saveImage', src),
  },

  citations: {
    getByDocument: (documentId: string) =>
      ipcRenderer.invoke('citations:getByDocument', documentId),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('citations:create', data),
    delete: (id: string) => ipcRenderer.invoke('citations:delete', id),
    fetchByDoi: (doi: string) => ipcRenderer.invoke('citations:fetchByDoi', doi),
    fetchByUrl: (url: string) => ipcRenderer.invoke('citations:fetchByUrl', url),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (data: Record<string, unknown>) => ipcRenderer.invoke('settings:set', data),
  },

  dialog: {
    openImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openImage'),
  },

  snapshots: {
    getByDocument: (documentId: string) =>
      ipcRenderer.invoke('snapshots:getByDocument', documentId),
    restore: (snapshotId: string) => ipcRenderer.invoke('snapshots:restore', snapshotId),
    delete: (snapshotId: string) => ipcRenderer.invoke('snapshots:delete', snapshotId),
    deleteAll: (documentId: string) => ipcRenderer.invoke('snapshots:deleteAll', documentId),
  },

  ollama: {
    checkInstalled: (): Promise<boolean> => ipcRenderer.invoke('ollama:checkInstalled'),
    installOllama: (): Promise<void> => ipcRenderer.invoke('ollama:installOllama'),
    listModels: (): Promise<string[]> => ipcRenderer.invoke('ollama:listModels'),
    onInstallProgress: (callback: (progress: unknown) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, progress: unknown): void =>
        callback(progress)
      ipcRenderer.on('ollama:install-progress', listener)
      return () => ipcRenderer.removeListener('ollama:install-progress', listener)
    },
    getDownloadStatus: () => ipcRenderer.invoke('ollama:getDownloadStatus'),
    startDownload: () => ipcRenderer.invoke('ollama:startDownload'),
    onDownloadProgress: (callback: (progress: unknown) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, progress: unknown): void =>
        callback(progress)
      ipcRenderer.on('ollama:download-progress', listener)
      return () => ipcRenderer.removeListener('ollama:download-progress', listener)
    },
  },
})
