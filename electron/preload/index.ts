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

  ollama: {
    getDownloadStatus: () => ipcRenderer.invoke('ollama:getDownloadStatus'),
    startDownload: () => ipcRenderer.invoke('ollama:startDownload'),
    onDownloadProgress: (callback: (progress: unknown) => void): void => {
      ipcRenderer.on('ollama:download-progress', (_, progress) => callback(progress))
    },
  },
})
