import { BaberuOcr } from '@/services/imageTranslation/baberuOcr'
import {
  ComicLayoutDetector,
  type TextRegionCandidate,
} from '@/services/imageTranslation/comicLayoutDetector'
import { loadModelAsset } from '@/services/imageTranslation/modelCache'
import {
  BABERU_MODELS,
  DETECTOR_MODEL,
  type TranslationModelAsset,
} from '@/services/imageTranslation/modelManifest'
import type {
  AnalyzeImageRequest,
  ImageTranslationProgress,
  ImageTranslationWorkerRequest,
  ImageTranslationWorkerResponse,
  RecognizedTextRegion,
} from '@/types/imageTranslation'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ImageTranslationWorkerRequest>) => void) | null
  postMessage: (message: ImageTranslationWorkerResponse) => void
}

const workerScope = self as unknown as WorkerScope
const MODEL_IDLE_RELEASE_MS = 120_000
let detector: ComicLayoutDetector | undefined
let ocr: BaberuOcr | undefined
let activeRequestId = 0
let activeController: AbortController | undefined
let analysisRunning = false
let analysisQueue: Promise<void> = Promise.resolve()
let modelIdleTimer: ReturnType<typeof setTimeout> | undefined
const cancelledRequests = new Set<number>()

function postProgress(requestId: number, progress: ImageTranslationProgress): void {
  workerScope.postMessage({ type: 'progress', requestId, progress })
}

function assertActive(requestId: number): void {
  if (requestId !== activeRequestId || cancelledRequests.has(requestId)) {
    throw new DOMException('번역 작업이 취소되었습니다.', 'AbortError')
  }
}

async function loadAssets(
  requestId: number,
  assets: readonly TranslationModelAsset[],
  signal: AbortSignal,
): Promise<ArrayBuffer[]> {
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0)
  const loadedByAsset = new Map<string, number>()
  let lastPostedAt = 0
  const loadedAssets: ArrayBuffer[] = []

  for (const asset of assets) {
    const data = await loadModelAsset(asset, ({ loaded }) => {
      loadedByAsset.set(asset.id, loaded)
      const completed = Array.from(loadedByAsset.values()).reduce((sum, value) => sum + value, 0)
      const now = performance.now()
      if (completed === total || now - lastPostedAt >= 100) {
        lastPostedAt = now
        postProgress(requestId, {
          phase: 'preparing',
          message: `${asset.label} 준비 중`,
          completed,
          total,
        })
      }
    }, signal)
    assertActive(requestId)
    loadedAssets.push(data)
  }

  return loadedAssets
}

async function getDetector(requestId: number, signal: AbortSignal): Promise<ComicLayoutDetector> {
  if (detector) return detector

  const [model] = await loadAssets(requestId, [DETECTOR_MODEL], signal)
  postProgress(requestId, {
    phase: 'preparing',
    message: '텍스트 영역 감지 모델을 시작하는 중입니다.',
  })
  detector = await ComicLayoutDetector.create(model)
  assertActive(requestId)
  return detector
}

async function getOcr(requestId: number, signal: AbortSignal): Promise<BaberuOcr> {
  if (ocr) return ocr

  const [vision, prefill, step, vocab] = await loadAssets(requestId, BABERU_MODELS, signal)
  postProgress(requestId, {
    phase: 'preparing',
    message: 'Baberu OCR을 시작하는 중입니다.',
  })
  ocr = await BaberuOcr.create({ vision, prefill, step, vocab })
  assertActive(requestId)
  return ocr
}

async function recognizeRegions(
  requestId: number,
  bitmap: ImageBitmap,
  candidates: readonly TextRegionCandidate[],
  signal: AbortSignal,
): Promise<RecognizedTextRegion[]> {
  if (!candidates.length) return []
  const recognizer = await getOcr(requestId, signal)
  const regions: RecognizedTextRegion[] = []

  for (let index = 0; index < candidates.length; index += 1) {
    assertActive(requestId)
    postProgress(requestId, {
      phase: 'recognizing',
      message: `글자를 인식하는 중입니다. (${index + 1}/${candidates.length})`,
      completed: index,
      total: candidates.length,
    })
    const candidate = candidates[index]
    const sourceText = await recognizer.recognize(
      bitmap,
      candidate.cropBounds,
      candidate.kind === 'free-text',
    )
    assertActive(requestId)
    if (sourceText) {
      regions.push({
        id: candidate.id,
        kind: candidate.kind,
        bounds: candidate.bounds,
        sourceText,
        detectionScore: candidate.detectionScore,
      })
    }
  }

  postProgress(requestId, {
    phase: 'recognizing',
    message: '글자 인식을 마쳤습니다.',
    completed: candidates.length,
    total: candidates.length,
  })
  return regions
}

async function analyzeImage({ requestId, file, ocrEngine }: AnalyzeImageRequest): Promise<void> {
  if (modelIdleTimer !== undefined) clearTimeout(modelIdleTimer)
  modelIdleTimer = undefined
  activeController?.abort()
  activeController = new AbortController()
  activeRequestId = requestId
  analysisRunning = true
  cancelledRequests.delete(requestId)
  let bitmap: ImageBitmap | undefined

  try {
    postProgress(requestId, {
      phase: 'preparing',
      message: '이미지 번역을 준비하는 중입니다.',
    })
    bitmap = await createImageBitmap(file)
    assertActive(requestId)

    const layoutDetector = await getDetector(requestId, activeController.signal)
    postProgress(requestId, {
      phase: 'detecting',
      message: '말풍선과 텍스트 영역을 찾는 중입니다.',
    })
    const candidates = await layoutDetector.detect(bitmap)
    assertActive(requestId)
    if (ocrEngine === 'apple-vision') {
      workerScope.postMessage({
        type: 'detection-result',
        requestId,
        imageWidth: bitmap.width,
        imageHeight: bitmap.height,
        candidates,
      })
      return
    }
    const regions = await recognizeRegions(
      requestId,
      bitmap,
      candidates,
      activeController.signal,
    )
    assertActive(requestId)

    workerScope.postMessage({
      type: 'result',
      requestId,
      imageWidth: bitmap.width,
      imageHeight: bitmap.height,
      regions,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    workerScope.postMessage({
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : '이미지의 글자를 인식하지 못했습니다.',
    })
  } finally {
    bitmap?.close()
    cancelledRequests.delete(requestId)
    if (activeRequestId === requestId) {
      analysisRunning = false
      activeController = undefined
      modelIdleTimer = setTimeout(releaseModelSessions, MODEL_IDLE_RELEASE_MS)
    }
  }
}

function releaseModelSessions(): void {
  modelIdleTimer = undefined
  detector?.release()
  detector = undefined
  ocr?.release()
  ocr = undefined
}

function disposeModels(): void {
  activeController?.abort()
  activeController = undefined
  if (modelIdleTimer !== undefined) clearTimeout(modelIdleTimer)
  releaseModelSessions()
}

workerScope.onmessage = (event): void => {
  const message = event.data
  if (message.type === 'analyze-image') {
    if (analysisRunning) {
      cancelledRequests.add(activeRequestId)
      activeController?.abort()
    }
    analysisQueue = analysisQueue
      .catch(() => undefined)
      .then(() => analyzeImage(message))
    return
  }

  if (message.type === 'cancel') {
    if (message.requestId === activeRequestId && analysisRunning) {
      cancelledRequests.add(message.requestId)
      activeController?.abort()
    }
    return
  }

  disposeModels()
}
