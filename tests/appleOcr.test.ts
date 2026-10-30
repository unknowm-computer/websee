import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkAppleOcr, recognizeAppleRegions } from '@/services/imageTranslation/appleOcr'
import { ImageTranslationRunner } from '@/services/imageTranslation/imageTranslationRunner'
import type { TextRegionCandidate } from '@/types/imageTranslation'

const candidate: TextRegionCandidate = {
  id: 'bubble-1', kind: 'bubble', detectionScore: 0.9,
  bounds: { x: 50, y: 20, width: 100, height: 60 },
  cropBounds: { x: 40, y: 10, width: 120, height: 80 },
}

function mockNativeHost(respond: (request: Record<string, unknown>) => unknown) {
  const requests: Record<string, unknown>[] = []
  const ports: Array<{ disconnect: ReturnType<typeof vi.fn> }> = []
  vi.stubGlobal('chrome', { runtime: {
    id: 'a'.repeat(32),
    connectNative: () => {
      const listeners = new Set<(value: unknown) => void>()
      const port = {
        disconnect: vi.fn(),
        onMessage: {
          addListener: (fn: (value: unknown) => void) => listeners.add(fn),
          removeListener: (fn: (value: unknown) => void) => listeners.delete(fn),
        },
        onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
        postMessage: (request: Record<string, unknown>): void => {
          requests.push(request)
          const response = respond(request)
          if (response === undefined) return
          queueMicrotask(() => {
            for (const listener of listeners) listener({ type: 'progress', completed: 1, total: 2 })
            for (const listener of listeners) listener(response)
          })
        },
      }
      ports.push(port)
      return port
    },
  } })
  return { requests, ports }
}

function mockImage() {
  const bitmap = { width: 200, height: 100, close: vi.fn() }
  const convert = vi.fn(async () => new Blob(['test-image'], { type: 'image/jpeg' }))
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(readonly width: number, readonly height: number) {}
    getContext() { return { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() } }
    convertToBlob = convert
  })
  return { bitmap, convert }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('macOS Vision OCR', () => {
  it('requires an OCR-capable helper and accepts the new version', async () => {
    mockNativeHost(() => ({ type: 'result', value: 'websee-translation-v2' }))
    await expect(checkAppleOcr()).rejects.toThrow('업데이트')
    const { requests } = mockNativeHost(() => ({ type: 'result', value: 'websee-translation-v3' }))
    await checkAppleOcr()
    expect(requests).toEqual([{ operation: 'ping' }])
  })

  it('preserves region geometry, maps crop coordinates and ignores empty recognition results', async () => {
    const { bitmap } = mockImage()
    const { requests, ports } = mockNativeHost(() => ({ type: 'result', value: [' Hello\nworld ', ' '] }))
    const progress = vi.fn()
    const result = await recognizeAppleRegions(new File([], 'test.png'), [candidate, { ...candidate, id: 'empty' }], progress, new AbortController().signal)
    expect(result).toEqual([{
      id: candidate.id, kind: 'bubble', bounds: candidate.bounds, detectionScore: 0.9, sourceText: 'Hello\nworld',
    }])
    expect(requests[0]).toMatchObject({ operation: 'ocr', ocr: {
      image: btoa('test-image'), crops: [{ x: 0.2, y: 0.1, width: 0.6, height: 0.8 }, { x: 0.2, y: 0.1, width: 0.6, height: 0.8 }],
    } })
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'recognizing', completed: 1, total: 2 }))
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(ports[0].disconnect).toHaveBeenCalledOnce()
  })

  it('skips native OCR for empty detections and respects cancellation before decoding', async () => {
    const { requests } = mockNativeHost(() => undefined)
    expect(await recognizeAppleRegions(new File([], 'empty.png'), [], vi.fn(), new AbortController().signal)).toEqual([])
    const controller = new AbortController()
    controller.abort()
    await expect(recognizeAppleRegions(new File([], 'test.png'), [candidate], vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests).toEqual([])
  })

  it('rejects mismatched results instead of assigning text to the wrong region', async () => {
    mockImage()
    mockNativeHost(() => ({ type: 'result', value: [] }))
    await expect(recognizeAppleRegions(new File([], 'test.png'), [candidate], vi.fn(), new AbortController().signal)).rejects.toThrow('영역과 일치')
  })

  it('disconnects native OCR when cancelled', async () => {
    mockImage()
    const { requests, ports } = mockNativeHost(() => undefined)
    const controller = new AbortController()
    const result = recognizeAppleRegions(new File([], 'test.png'), [candidate], vi.fn(), controller.signal)
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    controller.abort()
    await assertion
    expect(ports[0].disconnect).toHaveBeenCalledOnce()
  })

  it('shrinks oversized payloads before sending them to native messaging', async () => {
    const { convert } = mockImage()
    convert.mockResolvedValueOnce(new Blob([new Uint8Array(12 * 1024 * 1024 + 1)]))
    mockNativeHost(() => ({ type: 'result', value: ['Hello'] }))
    await recognizeAppleRegions(new File([], 'test.png'), [candidate], vi.fn(), new AbortController().signal)
    expect(convert).toHaveBeenCalledTimes(2)
  })

  it('combines native OCR with Chrome translation in the batch runner', async () => {
    mockImage()
    vi.stubGlobal('LanguageDetector', undefined)
    const translate = vi.fn(async () => '안녕하세요')
    vi.stubGlobal('Translator', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(async () => ({ translate, destroy: vi.fn() })),
    })
    const messages: Array<{ type: string; ocrEngine: string }> = []
    vi.stubGlobal('Worker', class {
      listener?: (event: { data: unknown }) => void
      addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
        if (type === 'message') this.listener = listener
      }
      postMessage(message: { type: string; requestId: number; ocrEngine: string }): void {
        messages.push(message)
        if (message.type === 'analyze-image') queueMicrotask(() => this.listener?.({ data: {
          type: 'detection-result', requestId: message.requestId, imageWidth: 200, imageHeight: 100, candidates: [candidate],
        } }))
      }
      terminate(): void { /* No real worker in this integration test. */ }
    })
    const { requests } = mockNativeHost((request) => ({ type: 'result', value: request.operation === 'ping' ? 'websee-translation-v3' : ['Hello'] }))
    const runner = new ImageTranslationRunner('chrome', 'low-latency', 'apple-vision')
    try {
      const result = await runner.translate(new File([], 'test.png'), 'image-1', {
        signal: new AbortController().signal, onProgress: vi.fn(), waitForTranslationStart: vi.fn(),
      })
      expect(messages[0]).toMatchObject({ type: 'analyze-image', ocrEngine: 'apple-vision' })
      expect(requests.map(({ operation }) => operation)).toEqual(['ping', 'ocr'])
      expect(translate).toHaveBeenCalledWith('Hello', expect.any(Object))
      expect(result.regions[0]).toMatchObject({ id: candidate.id, bounds: candidate.bounds, sourceText: 'Hello', translatedText: '안녕하세요' })
    } finally {
      runner.dispose()
    }
  })
})
