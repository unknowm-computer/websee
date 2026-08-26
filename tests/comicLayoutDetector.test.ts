import { describe, expect, it } from 'vitest'

import {
  removeOverlappingFreeTextCandidates,
  type TextRegionCandidate,
} from '@/services/imageTranslation/comicLayoutDetector'

function createCandidate(
  id: string,
  kind: TextRegionCandidate['kind'],
  x: number,
  detectionScore: number,
): TextRegionCandidate {
  const bounds = { x, y: 10, width: 100, height: 40 }
  return {
    id,
    kind,
    bounds,
    cropBounds: bounds,
    detectionScore,
  }
}

describe('comic layout detector post-processing', () => {
  it('removes overlapping free-text candidates using the higher score', () => {
    const candidates = [
      createCandidate('weaker', 'free-text', 10, 0.7),
      createCandidate('stronger', 'free-text', 14, 0.9),
      createCandidate('separate', 'free-text', 180, 0.6),
    ]

    expect(removeOverlappingFreeTextCandidates(candidates).map((item) => item.id))
      .toEqual(['stronger', 'separate'])
  })

  it('does not remove bubble candidates even when they overlap', () => {
    const candidates = [
      createCandidate('bubble-1', 'bubble', 10, 0.7),
      createCandidate('bubble-2', 'bubble', 14, 0.9),
    ]

    expect(removeOverlappingFreeTextCandidates(candidates).map((item) => item.id))
      .toEqual(['bubble-1', 'bubble-2'])
  })
})
