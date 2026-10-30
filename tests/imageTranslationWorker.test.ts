import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageTranslationWorkerRequest, ImageTranslationWorkerResponse, TextRegionCandidate } from '@/types/imageTranslation'

const mocks = vi.hoisted(() => ({
  load: vi.fn(async () => new ArrayBuffer(1)),
  createOcr: vi.fn(),
  detect: vi.fn(),
  release: vi.fn(),
}))

vi.mock('@/services/imageTranslation/modelCache', () => ({ loadModelAsset: mocks.load }))
vi.mock('@/services/imageTranslation/baberuOcr', () => ({ BaberuOcr: { create: mocks.createOcr } }))
vi.mock('@/services/imageTranslation/comicLayoutDetector', () => ({
  ComicLayoutDetector: { create: async () => ({ detect: mocks.detect, release: mocks.release }) },
}))

interface TestWorkerScope {
  onmessage: ((event: { data: ImageTranslationWorkerRequest }) => void) | null
  postMessage: (message: ImageTranslationWorkerResponse) => void
}

let scope: TestWorkerScope | undefined

afterEach(() => {
  scope?.onmessage?.({ data: { type: 'dispose' } })
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.resetModules()
})

describe('image analysis OCR selection', () => {
  const candidate: TextRegionCandidate = {
    id: 'text-1', kind: 'free-text', detectionScore: 0.8,
    bounds: { x: 10, y: 20, width: 80, height: 30 },
    cropBounds: { x: 9, y: 19, width: 82, height: 32 },
  }

  async function start(ocrEngine: 'baberu' | 'apple-vision') {
    const bitmap = { width: 100, height: 200, close: vi.fn() }
    const postMessage = vi.fn<(message: ImageTranslationWorkerResponse) => void>()
    scope = { onmessage: null, postMessage }
    vi.stubGlobal('self', scope)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    mocks.detect.mockResolvedValue([candidate])
    await import('@/services/imageTranslation/imageTranslation.worker')
    scope.onmessage?.({ data: { type: 'analyze-image', requestId: 1, file: new File([], 'test.png'), ocrEngine } })
    await vi.waitFor(() => expect(postMessage.mock.calls.some(([message]) => message.type === 'result' || message.type === 'detection-result')).toBe(true))
    return { postMessage, bitmap }
  }

  it('returns layout candidates without downloading or starting Baberu for native OCR', async () => {
    const { postMessage, bitmap } = await start('apple-vision')
    expect(postMessage).toHaveBeenCalledWith({ type: 'detection-result', requestId: 1, imageWidth: 100, imageHeight: 200, candidates: [candidate] })
    expect(mocks.createOcr).not.toHaveBeenCalled()
    expect(mocks.load).toHaveBeenCalledOnce()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('continues to recognize text in the worker when Baberu is selected', async () => {
    const recognize = vi.fn(async () => 'Browser text')
    mocks.createOcr.mockResolvedValue({ recognize, release: vi.fn() })
    const { postMessage } = await start('baberu')
    expect(mocks.createOcr).toHaveBeenCalledOnce()
    expect(recognize).toHaveBeenCalledWith(expect.any(Object), candidate.cropBounds, true)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'result', regions: [{
      id: candidate.id, kind: candidate.kind, bounds: candidate.bounds, detectionScore: candidate.detectionScore, sourceText: 'Browser text',
    }] }))
  })
})
