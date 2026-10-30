import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  checkAppleTranslation,
  detectAppleSourceLanguage,
  getAppleTranslationAvailability,
  requestAppleTranslation,
  translateAppleRegions,
} from '@/services/imageTranslation/appleTranslator'
import { createTranslationEngine } from '@/services/imageTranslation/translationEngine'
import { ImageTranslationRunner } from '@/services/imageTranslation/imageTranslationRunner'
import type { RecognizedTextRegion } from '@/types/imageTranslation'

const region: RecognizedTextRegion = {
  id: 'r1', kind: 'free-text', bounds: { x: 0, y: 0, width: 100, height: 20 },
  sourceText: 'Hello', detectionScore: 0.9,
}

function mockNativeHost(respond?: (request: Record<string, unknown>) => unknown) {
  const messages = new Set<(value: unknown) => void>()
  const disconnects = new Set<() => void>()
  const emit = (value: unknown): void => { for (const listener of messages) listener(value) }
  const port = {
    onMessage: { addListener: (fn: (value: unknown) => void) => messages.add(fn), removeListener: (fn: (value: unknown) => void) => messages.delete(fn) },
    onDisconnect: { addListener: (fn: () => void) => disconnects.add(fn), removeListener: (fn: () => void) => disconnects.delete(fn) },
    disconnect: vi.fn(),
    postMessage: vi.fn((request: Record<string, unknown>) => {
      if (respond) queueMicrotask(() => emit(respond(request)))
    }),
  }
  const connect = vi.fn(() => port)
  vi.stubGlobal('chrome', { runtime: { id: 'a'.repeat(32), connectNative: connect } })
  return { port, connect, emit, disconnects }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Apple translation bridge', () => {
  it('runs OCR results through the selected engine and waits for missing language packs', async () => {
    vi.stubGlobal('Translator', undefined)
    vi.stubGlobal('Worker', class {
      listener?: (event: { data: unknown }) => void
      addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
        if (type === 'message') this.listener = listener
      }
      postMessage(message: { type: string; requestId: number }): void {
        if (message.type === 'analyze-image') queueMicrotask(() => this.listener?.({ data: {
          type: 'result', requestId: message.requestId, imageWidth: 300, imageHeight: 200, regions: [region],
        } }))
      }
      terminate(): void { /* No actual worker is created in this protocol test. */ }
    })
    const requests: string[] = []
    mockNativeHost((request) => {
      requests.push(String(request.operation))
      const values: Record<string, unknown> = {
        ping: 'websee-translation-v2', detect: 'en', availability: 'downloadable', translate: ['안녕하세요'],
      }
      return { type: 'result', value: values[String(request.operation)] }
    })
    const wait = vi.fn(async () => undefined)
    const runner = new ImageTranslationRunner('apple')
    try {
      const result = await runner.translate(new File([], 'test.png'), 'image-id', {
        onProgress: () => undefined, signal: new AbortController().signal, waitForTranslationStart: wait,
      })
      expect(wait).toHaveBeenCalledWith('en')
      expect(requests).toEqual(['ping', 'detect', 'availability', 'translate'])
      expect(result).toMatchObject({ itemId: 'image-id', imageWidth: 300, regions: [{ ...region, translatedText: '안녕하세요' }] })
    } finally {
      runner.dispose()
    }
  })

  it('selects Apple without requiring Chrome Translator or LanguageDetector', async () => {
    vi.stubGlobal('Translator', undefined)
    vi.stubGlobal('LanguageDetector', undefined)
    const { connect } = mockNativeHost((request) => ({ type: 'result', value: request.operation === 'ping' ? 'websee-translation-v2' : 'zh' }))
    const engine = createTranslationEngine('apple')
    await engine.assertReady()
    expect(await engine.prepareLanguageDetector(() => undefined, new AbortController().signal)).toBeUndefined()
    expect(await detectAppleSourceLanguage([region])).toBe('zh')
    expect(connect).toHaveBeenCalledWith('com.websee.translation')
  })

  it('preserves region geometry, order and progress from Apple translations', async () => {
    const { emit, port } = mockNativeHost()
    const onProgress = vi.fn()
    const result = translateAppleRegions([region, { ...region, id: 'r2', sourceText: 'Thanks' }], 'en', onProgress, new AbortController().signal)
    emit({ type: 'progress', completed: 1, total: 2 })
    emit({ type: 'result', value: ['안녕하세요', '감사합니다'] })
    expect((await result).map((item) => [item.id, item.bounds, item.translatedText])).toEqual([
      ['r1', region.bounds, '안녕하세요'], ['r2', region.bounds, '감사합니다'],
    ])
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ completed: 1, total: 2 }))
    expect(port.disconnect).toHaveBeenCalledOnce()
  })

  it('uses the selected model for readiness, availability and translation', async () => {
    const requests: Record<string, unknown>[] = []
    mockNativeHost((request) => {
      requests.push(request)
      const values: Record<string, unknown> = {
        ping: 'websee-translation-v2', availability: 'available', translate: ['안녕하세요'],
      }
      return { type: 'result', value: values[String(request.operation)] }
    })
    const engine = createTranslationEngine('apple', 'high-fidelity')
    await engine.assertReady()
    await engine.getAvailability('en')
    await engine.translate([region], 'en', () => undefined, new AbortController().signal)
    expect(requests.map(({ operation, model }) => ({ operation, model }))).toEqual([
      { operation: 'ping', model: 'high-fidelity' },
      { operation: 'availability', model: 'high-fidelity' },
      { operation: 'translate', model: 'high-fidelity' },
    ])
  })

  it('joins OCR lines before Apple translation while preserving the original OCR text', async () => {
    const original = { ...region, sourceText: ' WE CALL IT\r\n\nA SURFACE. ' }
    const { port } = mockNativeHost(() => ({ type: 'result', value: ['우리는 그것을 표면이라고 부릅니다.'] }))
    const result = await createTranslationEngine('apple').translate([original], 'en', () => undefined, new AbortController().signal)
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ texts: ['WE CALL IT A SURFACE.'] }))
    expect(result[0]).toEqual({ ...original, translatedText: '우리는 그것을 표면이라고 부릅니다.' })
    expect(original.sourceText).toBe(' WE CALL IT\r\n\nA SURFACE. ')
  })

  it('rejects an old helper instead of silently using its fixed speed model', async () => {
    mockNativeHost(() => ({ type: 'result', value: 'websee-translation-v1' }))
    await expect(createTranslationEngine('apple', 'high-fidelity').assertReady()).rejects.toThrow('업데이트')
  })

  it('reports missing native host and unavailable extension context', async () => {
    vi.stubGlobal('chrome', undefined)
    await expect(checkAppleTranslation()).rejects.toThrow('Chrome 확장 프로그램')
    const { disconnects } = mockNativeHost()
    const result = checkAppleTranslation()
    for (const listener of disconnects) listener()
    await expect(result).rejects.toThrow('설치 안내')
  })

  it('distinguishes a stale extension tab from a development-server page', async () => {
    vi.stubGlobal('chrome', { runtime: {} })
    vi.stubGlobal('location', { protocol: 'chrome-extension:' })
    await expect(checkAppleTranslation()).rejects.toThrow('확장 연결이 해제')
  })

  it('reports missing loaded nativeMessaging permission without blaming the installed helper', async () => {
    vi.stubGlobal('chrome', { runtime: {
      id: 'a'.repeat(32), getManifest: () => ({ permissions: ['storage'] }),
    } })
    await expect(checkAppleTranslation()).rejects.toThrow('연결 권한(nativeMessaging)이 없습니다')
    vi.stubGlobal('chrome', { runtime: {
      id: 'a'.repeat(32), getManifest: () => ({ permissions: ['nativeMessaging'] }),
    } })
    await expect(checkAppleTranslation()).rejects.toThrow('권한은 있으나')
  })

  it('disconnects and cancels a native translation when aborted', async () => {
    const { port, emit } = mockNativeHost()
    const controller = new AbortController()
    const result = requestAppleTranslation({ operation: 'translate' }, controller.signal)
    controller.abort()
    emit({ type: 'result', value: ['늦은 응답'] })
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(port.disconnect).toHaveBeenCalledOnce()
  })

  it('rejects mismatched native results instead of mixing translated regions', async () => {
    mockNativeHost(() => ({ type: 'result', value: [] }))
    await expect(translateAppleRegions([region], 'en', () => undefined, new AbortController().signal)).rejects.toThrow('원문 영역')
  })

  it('handles language-pack preparation and native errors', async () => {
    mockNativeHost(() => ({ type: 'result', value: 'downloadable' }))
    expect(await getAppleTranslationAvailability('ja')).toBe('downloadable')
    mockNativeHost(() => ({ type: 'error', message: '한국어 언어팩을 다운로드해주세요.' }))
    await expect(getAppleTranslationAvailability('en')).rejects.toThrow('한국어 언어팩')
  })

  it('times out unresponsive native hosts and releases their connection', async () => {
    vi.useFakeTimers()
    const { port } = mockNativeHost()
    const result = checkAppleTranslation()
    const assertion = expect(result).rejects.toThrow('응답 시간')
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
    expect(port.disconnect).toHaveBeenCalledOnce()
  })
})
