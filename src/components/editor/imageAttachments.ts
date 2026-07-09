// Shared image-attachment primitives for AI chat composers (Documents, Slides
// Chat + Generate source picker, ...). Images are read once as both an object
// URL (for on-screen previews) and a raw base64 payload (for sending to
// Ollama's multimodal /api/chat endpoint) so neither path has to re-read the
// File later.

export interface AttachedImage {
  id: string
  file: File
  url: string
  name: string
  width: number
  height: number
  /** Raw base64 payload, no `data:image/...;base64,` prefix — ready for AiPromptPayload.images. */
  base64: string
}

// Matches the design spec: at most 4 images ride along with a single chat
// message or generation request.
export const IMAGE_CAP = 4

export function readImageFile(file: File): Promise<AttachedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const url = URL.createObjectURL(file)
      const img = new Image()
      const id = crypto.randomUUID()
      img.onload = () => resolve({ id, file, url, name: file.name, width: img.naturalWidth, height: img.naturalHeight, base64 })
      img.onerror = () => resolve({ id, file, url, name: file.name, width: 0, height: 0, base64 })
      img.src = url
    }
    reader.readAsDataURL(file)
  })
}

/** Opens the OS file picker; hands up to `remaining` picked images to onAdd. */
export function openImagePicker(remaining: number, onAdd: (imgs: AttachedImage[]) => void): void {
  if (remaining <= 0) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = () => {
    const files = Array.from(input.files ?? []).slice(0, remaining)
    if (files.length === 0) return
    void Promise.all(files.map(readImageFile)).then(onAdd)
  }
  input.click()
}
