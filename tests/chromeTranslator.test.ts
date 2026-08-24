import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getTranslationAvailability,
  isChromeTranslatorSupported,
  isTranslationImmediatelyAvailable,
  isTranslationUnavailable,
  translateRecognizedRegions,
} from '@/services/imageTranslation/chromeTranslator'
import type { RecognizedTextRegion } from '@/types/imageTranslation'

interface TestTranslator {
  translate(text: string): Promise<string>
  destroy(): void
}

interface TestTranslatorFactory {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<'available'>
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<TestTranslator>
}

interface TestAiGlobals {
  Translator?: TestTranslatorFactory
}

const aiGlobals = globalThis as unknown as TestAiGlobals
const originalTranslator = aiGlobals.Translator
const sourceRegion: RecognizedTextRegion = {
  id: 'region-1',
  kind: 'bubble',
  bounds: { x: 10, y: 20, width: 120, height: 70 },
  sourceText: 'hello',
  detectionScore: 0.9,
}

afterEach(() => {
  aiGlobals.Translator = originalTranslator
})

describe('Chrome Translator integration', () => {
  it('detects unsupported and ready API states', async () => {
    aiGlobals.Translator = undefined
    expect(isChromeTranslatorSupported()).toBe(false)
    expect(isTranslationUnavailable(await getTranslationAvailability('ja'))).toBe(true)
    expect(isTranslationImmediatelyAvailable('available')).toBe(true)
    expect(isTranslationImmediatelyAvailable('downloadable')).toBe(false)
  })

  it('uses the selected local language pair and disposes the translator', async () => {
    const destroy = vi.fn()
    const create = vi.fn(async () => ({
      translate: async (text: string) => `번역:${text}`,
      destroy,
    }))
    aiGlobals.Translator = {
      availability: async () => 'available',
      create,
    }

    const result = await translateRecognizedRegions(
      [sourceRegion],
      'en',
      () => undefined,
      new AbortController().signal,
    )

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: 'en',
      targetLanguage: 'ko',
    }))
    expect(result[0].translatedText).toBe('번역:hello')
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('keeps Korean OCR text without creating a translator', async () => {
    aiGlobals.Translator = undefined
    const result = await translateRecognizedRegions(
      [{ ...sourceRegion, sourceText: '안녕하세요' }],
      'ko',
      () => undefined,
      new AbortController().signal,
    )

    expect(result[0].translatedText).toBe('안녕하세요')
  })
})
