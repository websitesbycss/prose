import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('prose', {
  documents: {
    getAll: (): Promise<unknown[]> => ipcRenderer.invoke('documents:getAll'),
    getById: (id: string): Promise<unknown> => ipcRenderer.invoke('documents:getById', id),
    create: (data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('documents:create', data),
    update: (id: string, data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('documents:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('documents:delete', id),
  },

  categories: {
    getAll: (): Promise<unknown[]> => ipcRenderer.invoke('categories:getAll'),
    create: (data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('categories:create', data),
    update: (id: string, data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('categories:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('categories:delete', id),
  },

  ai: {
    prompt: (payload: Record<string, unknown>): Promise<string> =>
      ipcRenderer.invoke('ai:prompt', payload),
    getStatus: (): Promise<string> => ipcRenderer.invoke('ai:getStatus'),
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
    toDocx: (id: string): Promise<void> => ipcRenderer.invoke('export:toDocx', id),
    toPdf: (id: string): Promise<void> => ipcRenderer.invoke('export:toPdf', id),
    toMarkdown: (id: string): Promise<void> => ipcRenderer.invoke('export:toMarkdown', id),
    toPlainText: (id: string): Promise<void> => ipcRenderer.invoke('export:toPlainText', id),
  },

  citations: {
    getByDocument: (documentId: string): Promise<unknown[]> =>
      ipcRenderer.invoke('citations:getByDocument', documentId),
    create: (data: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('citations:create', data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('citations:delete', id),
    fetchByDoi: (doi: string): Promise<unknown> => ipcRenderer.invoke('citations:fetchByDoi', doi),
    fetchByUrl: (url: string): Promise<unknown> => ipcRenderer.invoke('citations:fetchByUrl', url),
  },

  settings: {
    get: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
    set: (data: Record<string, unknown>): Promise<void> => ipcRenderer.invoke('settings:set', data),
  },

  ollama: {
    getDownloadStatus: (): Promise<unknown> => ipcRenderer.invoke('ollama:getDownloadStatus'),
    startDownload: (): Promise<void> => ipcRenderer.invoke('ollama:startDownload'),
    onDownloadProgress: (callback: (progress: unknown) => void): void => {
      ipcRenderer.on('ollama:download-progress', (_, progress) => callback(progress))
    },
  },
})
