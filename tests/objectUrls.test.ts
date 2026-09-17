import { nextTick, reactive, ref, watchEffect } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useObjectUrls } from '@/composables/useObjectUrls'
import { createMediaItem } from '@/utils/media'

vi.mock('vue', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue')>(),
  onBeforeUnmount: vi.fn(),
}))

afterEach(() => vi.restoreAllMocks())

describe('image object URLs', () => {
  it('updates a displayed URL when the file changes after a cached render', async () => {
    const create = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:before')
      .mockReturnValueOnce('blob:after')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const item = reactive(createMediaItem(new File(['before'], 'image.png')))
    const urls = useObjectUrls()
    const repaint = ref(0)
    let displayedUrl = ''
    const stop = watchEffect(() => {
      void repaint.value
      displayedUrl = urls.getUrl(item)
    })

    try {
      repaint.value += 1
      await nextTick()
      expect(create).toHaveBeenCalledTimes(1)
      item.file = new File(['after'], 'image.png')
      await nextTick()
      expect(displayedUrl).toBe('blob:after')
      expect(create).toHaveBeenLastCalledWith(item.file)
      expect(revoke).toHaveBeenCalledWith('blob:before')
    } finally {
      stop()
      urls.revokeAll()
    }
  })
})
