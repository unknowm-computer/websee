import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTranslationEngine } from '@/services/imageTranslation/translationEngine'
import type { RecognizedTextRegion } from '@/types/imageTranslation'

afterEach(() => vi.unstubAllGlobals())

describe('OCR line joining before translation', () => {
  it('normalizes each region independently and preserves Japanese and Chinese word boundaries', async () => {
    const cases = [
      ['WE CALL IT\nA SURFACE.', 'WE CALL IT A SURFACE.'],
      ['A KEYBOARD\r\n\r\nAND A KICKSTAND!', 'A KEYBOARD AND A KICKSTAND!'],
      ['これは\nペンです。', 'これはペンです。'],
      ['你好\n世界', '你好世界'],
      ['우리는\n이것을 부릅니다.', '우리는 이것을 부릅니다.'],
    ]
    const regions: RecognizedTextRegion[] = cases.map(([sourceText], index) => ({
      id: `r${index}`, kind: index % 2 ? 'free-text' : 'bubble', sourceText,
      bounds: { x: index * 100, y: 0, width: 100, height: 60 }, detectionScore: 0.9,
    }))
    const translate = vi.fn(async (_text: string) => '번역 결과')
    const destroy = vi.fn()
    vi.stubGlobal('Translator', { create: async () => ({ translate, destroy }) })
    const result = await createTranslationEngine('chrome').translate(regions, 'en', () => undefined, new AbortController().signal)
    expect(translate.mock.calls.map(([text]) => text)).toEqual(cases.map(([, expected]) => expected))
    expect(result).toEqual(regions.map((region) => ({ ...region, translatedText: '번역 결과' })))
    expect(destroy).toHaveBeenCalledOnce()
  })
})
