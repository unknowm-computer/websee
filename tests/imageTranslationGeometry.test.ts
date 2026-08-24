import { describe, expect, it } from 'vitest'

import {
  createDetectorTargetSize,
  mapBoundsToDisplay,
} from '@/services/imageTranslation/detectorGeometry'

describe('image translation geometry', () => {
  it('passes the ONNX detector target size in width-height order', () => {
    expect(Array.from(createDetectorTargetSize(1200, 1800))).toEqual([1200n, 1800n])
  })

  it('maps detector coordinates into the displayed image size', () => {
    expect(mapBoundsToDisplay(
      { x: 100, y: 200, width: 300, height: 400 },
      { width: 1200, height: 1800 },
      { width: 2400, height: 3600 },
    )).toEqual({ x: 200, y: 400, width: 600, height: 800 })
  })

  it('clamps a detector region to the displayed image', () => {
    expect(mapBoundsToDisplay(
      { x: 900, y: 900, width: 300, height: 300 },
      { width: 1000, height: 1000 },
      { width: 500, height: 500 },
    )).toEqual({ x: 450, y: 450, width: 50, height: 50 })
  })
})
