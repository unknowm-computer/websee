import { describe, expect, it } from 'vitest'

import {
  isAnimatedGif,
  isImageWithinEnhancementLimits,
  MAX_IMAGE_ENHANCEMENT_PIXELS,
  supportsImageEnhancement,
} from '@/services/imageEnhancement'

function createGif(frameCount: number): Uint8Array {
  const header = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  ]
  const frame = [
    0x2c,
    0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00,
    0x00,
    0x02,
    0x02, 0x44, 0x01,
    0x00,
  ]
  return new Uint8Array([
    ...header,
    ...Array.from({ length: frameCount }, () => frame).flat(),
    0x3b,
  ])
}

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

describe('image enhancement format support', () => {
  it('detects whether a GIF contains multiple image frames', () => {
    expect(isAnimatedGif(createGif(1))).toBe(false)
    expect(isAnimatedGif(createGif(2))).toBe(true)
  })

  it('rejects malformed GIF data instead of treating it as a still image', () => {
    expect(() => isAnimatedGif(new Uint8Array([0x47, 0x49]))).toThrow()
  })

  it('skips only animated GIF images', () => {
    expect(supportsImageEnhancement('GIF', true)).toBe(false)
    expect(supportsImageEnhancement('gif', false)).toBe(true)
  })

  it('keeps enhancement available for still image formats', () => {
    expect(supportsImageEnhancement('JPEG', false)).toBe(true)
    expect(supportsImageEnhancement('PNG', false)).toBe(true)
    expect(supportsImageEnhancement('WEBP', false)).toBe(true)
  })
})
