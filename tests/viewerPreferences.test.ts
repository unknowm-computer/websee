import { describe, expect, it } from 'vitest'

import {
  readViewerZoomPreference,
  writeViewerZoomPreference,
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
