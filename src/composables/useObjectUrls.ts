import { onBeforeUnmount } from 'vue'

import type { MediaItem } from '@/types/media'

export function useObjectUrls() {
  const urls = new Map<string, string>()

  function getUrl(item: MediaItem): string {
    const existing = urls.get(item.id)
    if (existing) return existing

    const url = URL.createObjectURL(item.file)
    urls.set(item.id, url)
    return url
  }

  function revokeAll(): void {
    for (const url of urls.values()) URL.revokeObjectURL(url)
    urls.clear()
  }

  function revokeItems(items: readonly MediaItem[]): void {
    for (const item of items) {
      const url = urls.get(item.id)
      if (!url) continue
      URL.revokeObjectURL(url)
      urls.delete(item.id)
    }
  }

  onBeforeUnmount(revokeAll)

  return { getUrl, revokeAll, revokeItems }
}
