import { describe, expect, it } from 'vitest'

import { calculateAnchoredPan } from '@/utils/viewerGeometry'

describe('viewer geometry', () => {
  it('moves the image away from the pointer while zooming in', () => {
    expect(calculateAnchoredPan(
      { x: 0, y: 0 },
      { x: 120, y: 80 },
      2,
    )).toEqual({ x: -120, y: -80 })
  })

  it('preserves an existing pan while keeping the pointer anchored', () => {
    expect(calculateAnchoredPan(
      { x: 30, y: -20 },
      { x: 100, y: 60 },
      1.5,
    )).toEqual({ x: -5, y: -60 })
  })

  it('keeps the image point at the viewport center during button zoom', () => {
    expect(calculateAnchoredPan(
      { x: 30, y: -20 },
      { x: 0, y: 0 },
      1.5,
    )).toEqual({ x: 45, y: -30 })
  })
})
