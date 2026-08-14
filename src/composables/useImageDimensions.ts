import type { MediaItem } from '@/types/media'

export function useImageDimensions(getUrl: (item: MediaItem) => string) {
  const pending = new Map<string, Promise<void>>()

  function ensureDimensions(item: MediaItem): Promise<void> {
    const inspectableImage = item.kind === 'image'
      || (item.kind === 'archive-entry' && item.file.type.startsWith('image/'))
    if (!inspectableImage) return Promise.resolve()
    if (item.width && item.height) return Promise.resolve()

    const existing = pending.get(item.id)
    if (existing) return existing

    const request = new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => {
        item.width = image.naturalWidth
        item.height = image.naturalHeight
        pending.delete(item.id)
        resolve()
      }
      image.onerror = () => {
        pending.delete(item.id)
        resolve()
      }
      image.src = getUrl(item)
    })

    pending.set(item.id, request)
    return request
  }

  return { ensureDimensions }
}
