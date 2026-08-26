import { describe, expect, it } from 'vitest'

import {
  isImageWithinEnhancementLimits,
  MAX_IMAGE_ENHANCEMENT_PIXELS,
} from '@/services/imageEnhancement'

describe('image enhancement limits', () => {
  it('allows an image within the GPU and pixel limits', () => {
    expect(isImageWithinEnhancementLimits(6000, 4000, 16384, 16384)).toBe(true)
  })

  it('rejects dimensions above the GPU texture or renderbuffer limits', () => {
    expect(isImageWithinEnhancementLimits(17000, 1000, 16384, 32768)).toBe(false)
    expect(isImageWithinEnhancementLimits(1000, 17000, 32768, 16384)).toBe(false)
  })

  it('rejects images above the decoded pixel budget', () => {
    expect(isImageWithinEnhancementLimits(
      10000,
      5000,
      16384,
      16384,
    )).toBe(false)
    expect(MAX_IMAGE_ENHANCEMENT_PIXELS).toBe(40_000_000)
  })
})
