import { onScopeDispose, watch } from 'vue'

import { createFileDetailsWorker, type FileDetails, type FileDetailsRequest } from '@/services/fileDetails'
import type { MediaItem } from '@/types/media'
import { isPlayableItem, setMediaDuration } from '@/utils/media'

export function useVideoDimensions(
  visibleItems: () => readonly MediaItem[],
  loadFile: (item: MediaItem) => Promise<File>,
  maxArchiveEntrySize: number,
): void {
  const inspected = new WeakSet<MediaItem>()
  let worker: Worker | undefined
  let busy = false
  let disposed = false

  function releaseWorker(): void {
    worker?.terminate()
    worker = undefined
  }

  async function inspectNext(): Promise<void> {
    if (busy || disposed) return
    const item = visibleItems().find(item =>
      item.kind === 'video' && !(item.width && item.height) && !inspected.has(item)
      && (item.archiveEntryPath === undefined || item.size <= maxArchiveEntrySize),
    )
    if (!item) {
      releaseWorker()
      return
    }
    busy = true

    const finish = (details: FileDetails | null): void => {
      if (disposed) return
      if (isPlayableItem(item) && item.duration === undefined) setMediaDuration(item, details?.duration)
      if (details?.width && details.height && !(item.width && item.height)) {
        item.width = details.width
        item.height = details.height
      }
      inspected.add(item)
      busy = false
      void inspectNext()
    }
    try {
      const file = await loadFile(item)
      if (disposed) return
      if (!visibleItems().includes(item)) {
        busy = false
        void inspectNext()
        return
      }
      worker ??= createFileDetailsWorker()
      worker.onmessage = ({ data }: MessageEvent<FileDetails | null>) => finish(data)
      worker.onerror = worker.onmessageerror = () => {
        releaseWorker()
        finish(null)
      }
      worker.postMessage({ file, kind: 'video' } satisfies FileDetailsRequest)
    } catch {
      finish(null)
    }
  }

  watch(visibleItems, inspectNext, { immediate: true, flush: 'post' })
  onScopeDispose(() => {
    disposed = true
    releaseWorker()
  })
}
