import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('prose', {
  documents: {
    getAll: () => ipcRenderer.invoke('documents:getAll'),
    getById: (id: string) => ipcRenderer.invoke('documents:getById', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('documents:create', data),
    update: (id: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('documents:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('documents:delete', id),
    getStorageInfo: () => ipcRenderer.invoke('documents:getStorageInfo'),
    changeFolder: (newPath: string, moveFiles: boolean) =>
      ipcRenderer.invoke('documents:changeFolder', newPath, moveFiles),
    pickFolder: () => ipcRenderer.invoke('documents:pickFolder'),
    setFolder: (folder: string) => ipcRenderer.invoke('documents:setFolder', folder),
    openFolder: () => ipcRenderer.invoke('documents:openFolder'),
    importFiles: (filePaths?: string[]) => ipcRenderer.invoke('documents:importFiles', filePaths),
    openByPath: (filePath: string) => ipcRenderer.invoke('documents:openByPath', filePath),
    folderAccessible: () => ipcRenderer.invoke('documents:folderAccessible'),
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
      onChunk: (chunk: string) => void,
      onError: (msg: string) => void
    ): Promise<void> => {
      const chunkListener = (_: Electron.IpcRendererEvent, chunk: string): void => onChunk(chunk)
      const errorListener = (_: Electron.IpcRendererEvent, msg: string): void => onError(msg)
      ipcRenderer.on('ai:stream-chunk', chunkListener)
      ipcRenderer.on('ai:stream-error', errorListener)
      return ipcRenderer.invoke('ai:streamPrompt', payload).finally(() => {
        ipcRenderer.removeListener('ai:stream-chunk', chunkListener)
        ipcRenderer.removeListener('ai:stream-error', errorListener)
      })
    },
    analyze: (payload: { documentContent: string; assignmentContext?: string }) =>
      ipcRenderer.invoke('ai:analyze', payload),
  },

  export: {
    getPreviewHtml: (id: string, opts: Record<string, unknown>) =>
      ipcRenderer.invoke('export:getPreviewHtml', id, opts),
    getPreviewPdf: (id: string, opts: Record<string, unknown>) =>
      ipcRenderer.invoke('export:getPreviewPdf', id, opts),
    getPreviewDocx: (id: string, opts: Record<string, unknown>) =>
      ipcRenderer.invoke('export:getPreviewDocx', id, opts),
    run: (id: string, opts: Record<string, unknown>) =>
      ipcRenderer.invoke('export:run', id, opts),
    saveImage: (src: string) => ipcRenderer.invoke('export:saveImage', src),
  },

  tabdrag: {
    start: (docId: string) => ipcRenderer.send('tabdrag:start', docId),
    end: (data: { docId: string; screenX: number; screenY: number }) =>
      ipcRenderer.send('tabdrag:end', data),
    onHover: (cb: (data: { inside: boolean; screenX: number; screenY: number }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { inside: boolean; screenX: number; screenY: number }): void => cb(data)
      ipcRenderer.on('tabdrag:hover', listener)
      return () => ipcRenderer.removeListener('tabdrag:hover', listener)
    },
    onAccept: (cb: (data: { docId: string; screenX: number; screenY: number }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { docId: string; screenX: number; screenY: number }): void => cb(data)
      ipcRenderer.on('tabdrag:accept', listener)
      return () => ipcRenderer.removeListener('tabdrag:accept', listener)
    },
    onDetached: (cb: (data: { docId: string }) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { docId: string }): void => cb(data)
      ipcRenderer.on('tabdrag:detached', listener)
      return () => ipcRenderer.removeListener('tabdrag:detached', listener)
    },
  },

  citations: {
    getByDocument: (documentId: string) =>
      ipcRenderer.invoke('citations:getByDocument', documentId),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('citations:create', data),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('citations:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('citations:delete', id),
    fetchByDoi: (doi: string) => ipcRenderer.invoke('citations:fetchByDoi', doi),
    fetchByUrl: (url: string) => ipcRenderer.invoke('citations:fetchByUrl', url),
    fetchByIsbn: (isbn: string) => ipcRenderer.invoke('citations:fetchByIsbn', isbn),
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
      const listener = (_: Electron.IpcRendererEvent, progress: unknown): void => callback(progress)
      ipcRenderer.on('ollama:install-progress', listener)
      return () => ipcRenderer.removeListener('ollama:install-progress', listener)
    },
    getDownloadStatus: () => ipcRenderer.invoke('ollama:getDownloadStatus'),
    startDownload: () => ipcRenderer.invoke('ollama:startDownload'),
    onDownloadProgress: (callback: (progress: unknown) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, progress: unknown): void => callback(progress)
      ipcRenderer.on('ollama:download-progress', listener)
      return () => ipcRenderer.removeListener('ollama:download-progress', listener)
    },
  },

  migration: {
    getStatus: () => ipcRenderer.invoke('migration:getStatus'),
    onProgress: (callback: (progress: unknown) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, progress: unknown): void => callback(progress)
      ipcRenderer.on('migration:progress', listener)
      return () => ipcRenderer.removeListener('migration:progress', listener)
    },
  },

  app: {
    onOpenFile: (callback: (filePath: string) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, filePath: string): void => callback(filePath)
      ipcRenderer.on('app:open-file', listener)
      return () => ipcRenderer.removeListener('app:open-file', listener)
    },
  },

  spell: {
    isReady: (): Promise<boolean> => ipcRenderer.invoke('spell:isReady'),
    check: (word: string): Promise<{ correct: boolean; suggestions: string[] }> =>
      ipcRenderer.invoke('spell:check', word),
    checkBatch: (words: string[]): Promise<Record<string, { correct: boolean; suggestions: string[] }>> =>
      ipcRenderer.invoke('spell:checkBatch', words),
    getWords: (documentId: string): Promise<string[]> =>
      ipcRenderer.invoke('spell:getWords', documentId),
    addWord: (documentId: string, word: string): Promise<string[]> =>
      ipcRenderer.invoke('spell:addWord', documentId, word),
    removeWord: (documentId: string, word: string): Promise<string[]> =>
      ipcRenderer.invoke('spell:removeWord', documentId, word),
  },
})
