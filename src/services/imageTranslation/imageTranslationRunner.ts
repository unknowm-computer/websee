import {
  isTranslationImmediatelyAvailable,
  isTranslationUnavailable,
  type SupportedSourceLanguage,
} from '@/services/imageTranslation/chromeTranslator'
import { createTranslationEngine, type TranslationEngine } from '@/services/imageTranslation/translationEngine'
import { checkAppleOcr, recognizeAppleRegions } from '@/services/imageTranslation/appleOcr'
import type { AppleTranslationModel, OcrEngineId, TranslationEngineId } from '@/types/translationEngine'
import type {
  ImageTranslationProgress,
  ImageTranslationResult,
  ImageTranslationWorkerRequest,
  ImageTranslationWorkerResponse,
} from '@/types/imageTranslation'

type AnalysisResult = Extract<ImageTranslationWorkerResponse, { type: 'result' | 'detection-result' }>

interface PendingAnalysis {
  abort: () => void
  onProgress: (progress: ImageTranslationProgress) => void
  reject: (reason: unknown) => void
  requestId: number
  resolve: (result: AnalysisResult) => void
}

export interface ImageTranslationRunnerOptions {
  onProgress: (progress: ImageTranslationProgress) => void
  signal: AbortSignal
  waitForTranslationStart: (sourceLanguage: SupportedSourceLanguage) => Promise<void>
}

function createAbortError(): DOMException {
  return new DOMException('번역 작업이 취소되었습니다.', 'AbortError')
}

export class ImageTranslationRunner {
  readonly engine: TranslationEngine

  constructor(
    engine: TranslationEngineId = 'chrome',
    appleModel: AppleTranslationModel = 'low-latency',
    readonly ocrEngine: OcrEngineId = 'baberu',
  ) {
    this.engine = createTranslationEngine(engine, appleModel)
  }

  async assertReady(signal?: AbortSignal): Promise<void> {
    await this.engine.assertReady(signal)
    if (this.ocrEngine === 'apple-vision') await checkAppleOcr(signal)
  }

  private pendingAnalysis: PendingAnalysis | undefined
  private requestSequence = 0
  private worker: Worker | undefined

  private getWorker(): Worker {
    if (this.worker) return this.worker
    this.worker = new Worker(
      new URL('./imageTranslation.worker.ts', import.meta.url),
      { type: 'module' },
    )
    this.worker.addEventListener('message', this.handleWorkerMessage)
    this.worker.addEventListener('error', this.handleWorkerError)
    return this.worker
  }

  private readonly handleWorkerMessage = (
    event: MessageEvent<ImageTranslationWorkerResponse>,
  ): void => {
    const pending = this.pendingAnalysis
    const message = event.data
    if (!pending || message.requestId !== pending.requestId) return

    if (message.type === 'progress') {
      pending.onProgress(message.progress)
      return
    }

    this.pendingAnalysis = undefined
    pending.abort()
    if (message.type === 'error') {
      pending.reject(new Error(message.message))
      return
    }
    pending.resolve(message)
  }

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    const pending = this.pendingAnalysis
    if (!pending) return
    this.pendingAnalysis = undefined
    pending.abort()
    pending.reject(new Error(event.message || '이미지 번역 Worker를 시작하지 못했습니다.'))
  }

  private analyze(
    file: File,
    onProgress: (progress: ImageTranslationProgress) => void,
    signal: AbortSignal,
  ): Promise<AnalysisResult> {
    if (signal.aborted) return Promise.reject(createAbortError())
    if (this.pendingAnalysis) {
      return Promise.reject(new Error('이미지 번역 작업은 한 번에 하나만 실행할 수 있습니다.'))
    }

    const requestId = ++this.requestSequence
    return new Promise<AnalysisResult>((resolve, reject) => {
      const handleAbort = (): void => {
        if (this.pendingAnalysis?.requestId !== requestId) return
        const message: ImageTranslationWorkerRequest = { type: 'cancel', requestId }
        this.worker?.postMessage(message)
        this.pendingAnalysis = undefined
        signal.removeEventListener('abort', handleAbort)
        reject(createAbortError())
      }
      signal.addEventListener('abort', handleAbort, { once: true })
      this.pendingAnalysis = {
        requestId,
        resolve,
        reject,
        onProgress,
        abort: () => signal.removeEventListener('abort', handleAbort),
      }
      const message: ImageTranslationWorkerRequest = {
        type: 'analyze-image',
        requestId,
        file,
        ocrEngine: this.ocrEngine,
      }
      this.getWorker().postMessage(message)
    })
  }

  async translate(
    file: File,
    itemId: string,
    options: ImageTranslationRunnerOptions,
  ): Promise<ImageTranslationResult> {
    await this.assertReady(options.signal)
    const detectorPromise = this.engine.prepareLanguageDetector(options.onProgress, options.signal)
    let detectorConsumed = false
    try {
      const analysis = await this.analyze(file, options.onProgress, options.signal)
      const recognizedRegions = analysis.type === 'detection-result'
        ? await recognizeAppleRegions(file, analysis.candidates, options.onProgress, options.signal)
        : analysis.regions
      if (!recognizedRegions.length) {
        const detector = await detectorPromise
        detector?.destroy()
        detectorConsumed = true
        return {
          itemId,
          imageWidth: analysis.imageWidth,
          imageHeight: analysis.imageHeight,
          regions: [],
        }
      }

      options.onProgress({
        phase: 'translating',
        message: '원문 언어를 확인하는 중입니다.',
      })
      const detector = await detectorPromise
      detectorConsumed = true
      const sourceLanguage = await this.engine.detectSourceLanguage(
        recognizedRegions,
        detector,
        options.signal,
      )
      const availability = await this.engine.getAvailability(sourceLanguage, options.signal)
      if (isTranslationUnavailable(availability)) {
        throw new Error(this.engine.unavailableMessage)
      }
      if (!isTranslationImmediatelyAvailable(availability)) {
        await options.waitForTranslationStart(sourceLanguage)
      }

      const regions = await this.engine.translate(
        recognizedRegions,
        sourceLanguage,
        options.onProgress,
        options.signal,
      )
      return {
        itemId,
        imageWidth: analysis.imageWidth,
        imageHeight: analysis.imageHeight,
        regions,
      }
    } finally {
      if (!detectorConsumed) void detectorPromise.then((detector) => detector?.destroy())
    }
  }

  dispose(): void {
    const pending = this.pendingAnalysis
    if (pending) {
      this.pendingAnalysis = undefined
      pending.abort()
      pending.reject(createAbortError())
    }
    if (!this.worker) return
    const message: ImageTranslationWorkerRequest = { type: 'dispose' }
    this.worker.postMessage(message)
    this.worker.terminate()
    this.worker = undefined
  }
}
