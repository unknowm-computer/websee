import { describe, expect, it } from 'vitest'

import {
  readTranslationEnabledPreference,
  readTranslationEnginePreference,
  readAppleTranslationModelPreference,
  readOcrEnginePreference,
  readViewerEnhancementPreference,
  readViewerSlideshowPreference,
  readViewerTranslationOverlayPreference,
  readViewerZoomPreference,
  writeViewerEnhancementPreference,
  writeViewerSlideshowPreference,
  writeViewerTranslationOverlayPreference,
  writeViewerZoomPreference,
  writeTranslationEnabledPreference,
  writeTranslationEnginePreference,
  writeAppleTranslationModelPreference,
  writeOcrEnginePreference,
} from '@/utils/viewerPreferences'

function createStorage(initialEntries: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initialEntries))

  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe('viewer zoom preferences', () => {
  it('uses screen fit when no valid preference exists', () => {
    const storage = createStorage({
      'websee-viewer-zoom-mode': 'unknown',
      'websee-viewer-zoom-scale': 'not-a-number',
    })

    expect(readViewerZoomPreference(storage)).toEqual({ mode: 'fit', scale: 1 })
  })

  it('restores the last preset zoom mode', () => {
    const storage = createStorage({ 'websee-viewer-zoom-mode': 'width' })

    expect(readViewerZoomPreference(storage)).toEqual({ mode: 'width', scale: 1 })
  })

  it('stores and restores a custom zoom scale', () => {
    const storage = createStorage()

    writeViewerZoomPreference(storage, { mode: 'custom', scale: 1.75 })

    expect(readViewerZoomPreference(storage)).toEqual({ mode: 'custom', scale: 1.75 })
  })
})

describe('viewer image enhancement preference', () => {
  it('is disabled by default and ignores invalid values', () => {
    expect(readViewerEnhancementPreference(createStorage())).toBe(false)
    expect(readViewerEnhancementPreference(createStorage({
      'websee-viewer-image-enhancement': 'yes',
    }))).toBe(false)
  })

  it('stores and restores the enabled state', () => {
    const storage = createStorage()

    writeViewerEnhancementPreference(storage, true)
    expect(readViewerEnhancementPreference(storage)).toBe(true)

    writeViewerEnhancementPreference(storage, false)
    expect(readViewerEnhancementPreference(storage)).toBe(false)
  })
})

describe('viewer translation overlay preference', () => {
  it('is visible by default', () => {
    expect(readViewerTranslationOverlayPreference(createStorage())).toBe(true)
  })

  it('stores and restores the last visibility state', () => {
    const storage = createStorage()

    writeViewerTranslationOverlayPreference(storage, false)
    expect(readViewerTranslationOverlayPreference(storage)).toBe(false)

    writeViewerTranslationOverlayPreference(storage, true)
    expect(readViewerTranslationOverlayPreference(storage)).toBe(true)
  })
})

describe('translation enabled preference', () => {
  it('uses browser engines on other platforms without overwriting saved native preferences', () => {
    const storage = createStorage({
      'websee-translation-engine': 'apple',
      'websee-ocr-engine': 'apple-vision',
    })
    expect(readTranslationEnginePreference(storage, false)).toBe('chrome')
    expect(readOcrEnginePreference(storage, false)).toBe('baberu')
    expect(readTranslationEnginePreference(storage, true)).toBe('apple')
    expect(readOcrEnginePreference(storage, true)).toBe('apple-vision')
  })
  it('defaults to Baberu and restores the independent OCR choice', () => {
    const storage = createStorage({ 'websee-ocr-engine': 'unknown' })
    expect(readOcrEnginePreference(storage)).toBe('baberu')
    writeOcrEnginePreference(storage, 'apple-vision')
    expect(readOcrEnginePreference(storage)).toBe('apple-vision')
    expect(readTranslationEnginePreference(storage)).toBe('chrome')
  })
  it('keeps the existing speed model by default and restores the chosen quality model', () => {
    const storage = createStorage({ 'websee-apple-translation-model': 'unknown' })
    expect(readAppleTranslationModelPreference(storage)).toBe('low-latency')
    writeAppleTranslationModelPreference(storage, 'high-fidelity')
    expect(readAppleTranslationModelPreference(storage)).toBe('high-fidelity')
  })
  it('defaults to Chrome and persists Apple as the selected engine', () => {
    const storage = createStorage({ 'websee-translation-engine': 'unknown' })
    expect(readTranslationEnginePreference(storage)).toBe('chrome')
    writeTranslationEnginePreference(storage, 'apple')
    expect(readTranslationEnginePreference(storage)).toBe('apple')
  })
  it('is disabled by default and ignores invalid values', () => {
    expect(readTranslationEnabledPreference(createStorage())).toBe(false)
    expect(readTranslationEnabledPreference(createStorage({
      'websee-translation-enabled': 'yes',
    }))).toBe(false)
  })

  it('stores and restores the enabled state', () => {
    const storage = createStorage()

    writeTranslationEnabledPreference(storage, true)
    expect(readTranslationEnabledPreference(storage)).toBe(true)

    writeTranslationEnabledPreference(storage, false)
    expect(readTranslationEnabledPreference(storage)).toBe(false)
  })
})

describe('viewer slideshow preference', () => {
  it('is disabled with a three-second non-looping default', () => {
    expect(readViewerSlideshowPreference(createStorage())).toEqual({
      enabled: false,
      intervalSeconds: 3,
      loop: false,
    })
  })

  it('ignores invalid stored values', () => {
    const storage = createStorage({
      'websee-viewer-slideshow': JSON.stringify({
        enabled: 'yes',
        intervalSeconds: 7,
        loop: 1,
      }),
    })

    expect(readViewerSlideshowPreference(storage)).toEqual({
      enabled: false,
      intervalSeconds: 3,
      loop: false,
    })
  })

  it('stores and restores slideshow settings', () => {
    const storage = createStorage()

    writeViewerSlideshowPreference(storage, {
      enabled: true,
      intervalSeconds: 5,
      loop: true,
    })

    expect(readViewerSlideshowPreference(storage)).toEqual({
      enabled: true,
      intervalSeconds: 5,
      loop: true,
    })
  })
})
