import { effectScope, nextTick, shallowRef } from 'vue'
import { expect, it, vi } from 'vitest'

import { useVideoDimensions } from '@/composables/useVideoDimensions'
import type { FileDetails, FileDetailsRequest } from '@/services/fileDetails'
import type { MediaItem } from '@/types/media'
import { createMediaItem } from '@/utils/media'

it('probes only current visible videos and skips oversized archive entries', async () => {
  const old = createMediaItem(new File([], 'old.mp4'))
  const large = { ...old, archiveEntryPath: 'large.mp4', size: 101 }
  const broken = createMediaItem(new File([], 'broken.mp4'))
  const video = createMediaItem(new File([], 'new.mp4'))
  const viewport = shallowRef<MediaItem[]>([old])
  let finishExtraction!: (file: File) => void
  const loadFile = vi.fn((item: MediaItem) => item === old
    ? new Promise<File>(resolve => { finishExtraction = resolve })
    : Promise.resolve(item.file))
  const probed: string[] = []
  const terminate = vi.fn()
  vi.stubGlobal('Worker', class {
    onmessage?: (event: { data: FileDetails | null }) => void
    terminate = terminate
    postMessage({ file }: FileDetailsRequest): void {
      probed.push(file.name)
      queueMicrotask(() => this.onmessage?.({
        data: file === broken.file ? null : { fields: [], width: 320, height: 180, duration: 64.5 },
      }))
    }
  })
  const scope = effectScope()
  try {
    scope.run(() => useVideoDimensions(() => viewport.value, loadFile, 100))
    viewport.value = [large, broken, video]
    await nextTick()
    finishExtraction(old.file)
    await vi.waitFor(() => expect(video).toMatchObject({ width: 320, height: 180, duration: 64.5 }))
    viewport.value = [video, broken]
    await nextTick()
    expect(loadFile.mock.calls.map(([item]) => item)).toEqual([old, broken, video])
    expect(probed).toEqual(['broken.mp4', 'new.mp4'])
    expect(terminate).toHaveBeenCalledOnce()
  } finally {
    scope.stop()
    vi.unstubAllGlobals()
  }
})
