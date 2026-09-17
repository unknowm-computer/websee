import { onBeforeUnmount } from 'vue'

import type { MediaItem } from '@/types/media'

export function useObjectUrls() {
  const urls = new Map<string, { file: File; url: string }>()

  function getUrl(item: MediaItem): string {
    const file = item.file
    const existing = urls.get(item.id)
    if (existing?.file === file) return existing.url
    if (existing) URL.revokeObjectURL(existing.url)

    const url = URL.createObjectURL(file)
    urls.set(item.id, { file, url })
    return url
  }

  function revokeAll(): void {
    for (const { url } of urls.values()) URL.revokeObjectURL(url)
    urls.clear()
  }

  function revokeItems(items: readonly MediaItem[]): void {
    for (const item of items) {
      const entry = urls.get(item.id)
      if (!entry) continue
      URL.revokeObjectURL(entry.url)
      urls.delete(item.id)
    }
  }

  onBeforeUnmount(revokeAll)

  return { getUrl, revokeAll, revokeItems }
}
