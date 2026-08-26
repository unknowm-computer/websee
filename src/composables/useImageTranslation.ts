import { computed, onBeforeUnmount, ref } from 'vue'

import {
  detectSourceLanguage,
  getTranslationAvailability,
  isChromeTranslatorSupported,
  isTranslationImmediatelyAvailable,
  isTranslationUnavailable,
  prepareLanguageDetector,
  translateRecognizedRegions,
  type LanguageDetectorInstance,
  type SupportedSourceLanguage,
} from '@/services/imageTranslation/chromeTranslator'
import type {
  ImageTranslationProgress,
  ImageTranslationResult,
  ImageTranslationWorkerRequest,
  ImageTranslationWorkerResponse,
  RecognizedTextRegion,
} from '@/types/imageTranslation'
import type { MediaItem } from '@/types/media'

const RESULT_CACHE_LIMIT = 8
const WORKER_IDLE_TERMINATE_MS = 120_000
const NOTICE_DURATION_MS = 4500

interface PendingTranslation {
  imageHeight: number
  imageWidth: number
  item: MediaItem
  itemId: string
  persistResult: boolean
  regions: RecognizedTextRegion[]
  requestId: number
  sourceLanguage: SupportedSourceLanguage
}

interface UseImageTranslationOptions {
  initialOverlayVisible?: boolean
  loadSavedResult?: (item: MediaItem) => Promise<ImageTranslationResult | undefined>
  onOverlayVisibilityChange?: (visible: boolean) => void
  prepareResultPersistence?: (item: MediaItem) => Promise<boolean>
  saveResult?: (item: MediaItem, result: ImageTranslationResult) => Promise<void>
}

export function useImageTranslation(options: UseImageTranslationOptions = {}) {
  const progress = ref<ImageTranslationProgress>({
    phase: 'idle',
    message: '',
  })
  const result = ref<ImageTranslationResult>()
  const overlayVisible = ref(false)
  const statusVisible = ref(false)
  const notice = ref('')
  const resultCache = new Map<string, ImageTranslationResult>()
  const resultCacheOrder: string[] = []
  const destroyedLanguageDetectors = new WeakSet<LanguageDetectorInstance>()
  let worker: Worker | undefined
  let workerIdleTimer: number | undefined
  let currentItemId: string | undefined
  let requestSequence = 0
  let restoreSequence = 0
  let startSequence = 0
  let activeRequestId: number | undefined
  let activeRequestItem: MediaItem | undefined
  let activeRequestPersistsResult = false
  let translationController: AbortController | undefined
  let languageDetectorPromise: Promise<LanguageDetectorInstance | undefined> | undefined
  let pendingTranslation: PendingTranslation | undefined
  let noticeTimer: number | undefined
  let overlayPreferredVisible = options.initialOverlayVisible ?? true

  const processing = computed(() =>
    progress.value.phase === 'preparing'
    || progress.value.phase === 'detecting'
    || progress.value.phase === 'recognizing'
    || progress.value.phase === 'translating',
  )

  function syncOverlayVisibility(
    translationResult: ImageTranslationResult | undefined = result.value,
  ): void {
    overlayVisible.value = overlayPreferredVisible
      && Boolean(translationResult?.regions.length)
  }

  function clearWorkerIdleTimer(): void {
    if (workerIdleTimer !== undefined) window.clearTimeout(workerIdleTimer)
    workerIdleTimer = undefined
  }

  function dismissNotice(): void {
    if (noticeTimer !== undefined) window.clearTimeout(noticeTimer)
    noticeTimer = undefined
    notice.value = ''
  }

  function showNotice(message: string): void {
    dismissNotice()
    notice.value = message
    noticeTimer = window.setTimeout(dismissNotice, NOTICE_DURATION_MS)
  }

  function terminateWorker(): void {
    clearWorkerIdleTimer()
    if (!worker) return
    const message: ImageTranslationWorkerRequest = { type: 'dispose' }
    worker.postMessage(message)
    worker.terminate()
    worker = undefined
  }

  function scheduleWorkerTermination(): void {
    clearWorkerIdleTimer()
    if (!worker) return
    workerIdleTimer = window.setTimeout(terminateWorker, WORKER_IDLE_TERMINATE_MS)
  }

  function getWorker(): Worker {
    clearWorkerIdleTimer()
    if (worker) return worker
    worker = new Worker(
      new URL('../services/imageTranslation/imageTranslation.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('message', handleWorkerMessage)
    worker.addEventListener('error', (event) => {
      if (activeRequestId === undefined) return
      fail(event.message || '이미지 번역 Worker를 시작하지 못했습니다.')
    })
    return worker
  }

  function cacheResult(nextResult: ImageTranslationResult): void {
    resultCache.set(nextResult.itemId, nextResult)
    const previousIndex = resultCacheOrder.indexOf(nextResult.itemId)
    if (previousIndex >= 0) resultCacheOrder.splice(previousIndex, 1)
    resultCacheOrder.push(nextResult.itemId)

    while (resultCacheOrder.length > RESULT_CACHE_LIMIT) {
      const oldestId = resultCacheOrder.shift()
      if (oldestId) resultCache.delete(oldestId)
    }
  }

  function finishRequest(): void {
    activeRequestId = undefined
    activeRequestItem = undefined
    activeRequestPersistsResult = false
    translationController = undefined
    pendingTranslation = undefined
  }

  function destroyLanguageDetector(detector: LanguageDetectorInstance | undefined): void {
    if (!detector || destroyedLanguageDetectors.has(detector)) return
    destroyedLanguageDetectors.add(detector)
    detector.destroy()
  }

  function releaseLanguageDetector(): void {
    const detectorPromise = languageDetectorPromise
    languageDetectorPromise = undefined
    void detectorPromise?.then(destroyLanguageDetector)
  }

  function fail(message: string): void {
    translationController?.abort()
    releaseLanguageDetector()
    pendingTranslation = undefined
    finishRequest()
    overlayVisible.value = false
    statusVisible.value = true
    progress.value = { phase: 'error', message }
    scheduleWorkerTermination()
  }

  async function finishPendingTranslation(pending: PendingTranslation): Promise<void> {
    try {
      const regions = await translateRecognizedRegions(
        pending.regions,
        pending.sourceLanguage,
        (nextProgress) => {
          if (pending.requestId === activeRequestId) progress.value = nextProgress
        },
        translationController?.signal ?? new AbortController().signal,
      )
      if (pending.requestId !== activeRequestId || currentItemId !== pending.itemId) return

      const nextResult: ImageTranslationResult = {
        itemId: pending.itemId,
        imageWidth: pending.imageWidth,
        imageHeight: pending.imageHeight,
        regions,
      }
      cacheResult(nextResult)
      result.value = nextResult
      syncOverlayVisibility(nextResult)
      statusVisible.value = false
      progress.value = {
        phase: 'complete',
        message: regions.length
          ? `${regions.length}개 영역의 번역을 마쳤습니다.`
          : '인식 가능한 텍스트를 찾지 못했습니다.',
        completed: regions.length,
        total: regions.length,
      }
      showNotice(progress.value.message)
      finishRequest()
      scheduleWorkerTermination()

      if (pending.persistResult && options.saveResult) {
        try {
          await options.saveResult(pending.item, nextResult)
          if (currentItemId === pending.itemId) {
            showNotice(`${progress.value.message} 번역 결과를 원본 폴더에 저장했습니다.`)
          }
        } catch {
          if (currentItemId === pending.itemId) {
            showNotice(`${progress.value.message} 번역 결과는 저장하지 못했습니다.`)
          }
        }
      } else if (options.prepareResultPersistence && currentItemId === pending.itemId) {
        showNotice(`${progress.value.message} 번역 결과는 이번 실행 중에만 유지됩니다.`)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (pending.requestId !== activeRequestId) return
      fail(error instanceof Error ? error.message : '텍스트를 번역하지 못했습니다.')
    }
  }

  function continueTranslation(): void {
    const pending = pendingTranslation
    if (!pending || pending.requestId !== activeRequestId) return
    progress.value = {
      phase: 'translating',
      message: 'Chrome 번역 기능을 시작하는 중입니다.',
    }
    void finishPendingTranslation(pending)
  }

  async function handleAnalysisResult(
    message: Extract<ImageTranslationWorkerResponse, { type: 'result' }>,
  ): Promise<void> {
    const requestItem = activeRequestItem
    if (message.requestId !== activeRequestId || !currentItemId || !requestItem) return

    try {
      if (!message.regions.length) {
        const detector = await languageDetectorPromise
        destroyLanguageDetector(detector)
        languageDetectorPromise = undefined
        if (message.requestId !== activeRequestId || !currentItemId) return
        pendingTranslation = {
          requestId: message.requestId,
          item: requestItem,
          itemId: currentItemId,
          persistResult: activeRequestPersistsResult,
          imageWidth: message.imageWidth,
          imageHeight: message.imageHeight,
          regions: [],
          sourceLanguage: 'ja',
        }
        await finishPendingTranslation(pendingTranslation)
        return
      }

      progress.value = {
        phase: 'translating',
        message: '원문 언어를 확인하는 중입니다.',
      }
      const detector = await languageDetectorPromise
      languageDetectorPromise = undefined
      if (message.requestId !== activeRequestId || !currentItemId) {
        destroyLanguageDetector(detector)
        return
      }
      const sourceLanguage = await detectSourceLanguage(
        message.regions,
        detector,
        translationController?.signal,
      )
      if (message.requestId !== activeRequestId || !currentItemId) return

      const availability = await getTranslationAvailability(sourceLanguage)
      if (isTranslationUnavailable(availability)) {
        throw new Error('이 Chrome에서는 해당 언어의 내장 한국어 번역 기능을 사용할 수 없습니다.')
      }

      pendingTranslation = {
        requestId: message.requestId,
        item: requestItem,
        itemId: currentItemId,
        persistResult: activeRequestPersistsResult,
        imageWidth: message.imageWidth,
        imageHeight: message.imageHeight,
        regions: message.regions,
        sourceLanguage,
      }

      if (isTranslationImmediatelyAvailable(availability)) {
        await finishPendingTranslation(pendingTranslation)
        return
      }

      statusVisible.value = true
      progress.value = {
        phase: 'awaiting-translation',
        message: 'Chrome 한국어 번역 모델을 받으려면 번역 계속을 눌러주세요.',
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (message.requestId !== activeRequestId) return
      fail(error instanceof Error ? error.message : '원문 언어를 확인하지 못했습니다.')
    }
  }

  function handleWorkerMessage(event: MessageEvent<ImageTranslationWorkerResponse>): void {
    const message = event.data
    if (message.requestId !== activeRequestId) return

    if (message.type === 'progress') {
      progress.value = message.progress
      return
    }
    if (message.type === 'error') {
      fail(message.message)
      return
    }
    scheduleWorkerTermination()
    void handleAnalysisResult(message)
  }

  function cancel(): void {
    startSequence += 1
    restoreSequence += 1
    const requestId = activeRequestId
    if (requestId === undefined) {
      if (progress.value.phase !== 'preparing') return
      statusVisible.value = false
      const cached = currentItemId ? resultCache.get(currentItemId) : undefined
      result.value = cached
      syncOverlayVisibility(cached)
      progress.value = cached
        ? { phase: 'complete', message: `${cached.regions.length}개 영역의 번역 결과` }
        : { phase: 'idle', message: '' }
      return
    }
    const message: ImageTranslationWorkerRequest = { type: 'cancel', requestId }
    worker?.postMessage(message)
    translationController?.abort()
    releaseLanguageDetector()
    pendingTranslation = undefined
    finishRequest()
    terminateWorker()
    statusVisible.value = false
    const cached = currentItemId ? resultCache.get(currentItemId) : undefined
    result.value = cached
    syncOverlayVisibility(cached)
    progress.value = cached
      ? { phase: 'complete', message: `${cached.regions.length}개 영역의 번역 결과` }
      : { phase: 'idle', message: '' }
  }

  async function restoreSavedResult(item: MediaItem, sequence: number): Promise<void> {
    if (!options.loadSavedResult) return
    try {
      const savedResult = await options.loadSavedResult(item)
      if (!savedResult || sequence !== restoreSequence || currentItemId !== item.id) return
      cacheResult(savedResult)
      result.value = savedResult
      syncOverlayVisibility(savedResult)
      statusVisible.value = false
      progress.value = {
        phase: 'complete',
        message: `${savedResult.regions.length}개 영역의 저장된 번역 결과`,
        completed: savedResult.regions.length,
        total: savedResult.regions.length,
      }
      showNotice('원본 폴더에 저장된 번역 결과를 불러왔습니다.')
    } catch {
      // 손상되었거나 읽을 수 없는 sidecar는 번역 기능 자체를 막지 않습니다.
    }
  }

  function selectItem(item: MediaItem | undefined): void {
    const itemId = item?.id
    if (itemId === currentItemId) return
    cancel()
    currentItemId = itemId
    dismissNotice()
    const cached = itemId ? resultCache.get(itemId) : undefined
    result.value = cached
    syncOverlayVisibility(cached)
    statusVisible.value = false
    progress.value = cached
      ? { phase: 'complete', message: `${cached.regions.length}개 영역의 번역 결과` }
      : { phase: 'idle', message: '' }

    if (!cached && item) {
      const sequence = ++restoreSequence
      void restoreSavedResult(item, sequence)
    }
  }

  function startAnalysis(item: MediaItem, persistResult: boolean): void {
    cancel()
    dismissNotice()
    currentItemId = item.id

    const requestId = ++requestSequence
    clearWorkerIdleTimer()
    activeRequestId = requestId
    activeRequestItem = item
    activeRequestPersistsResult = persistResult
    translationController = new AbortController()
    languageDetectorPromise = prepareLanguageDetector(
      (nextProgress) => {
        if (requestId === activeRequestId) progress.value = nextProgress
      },
      translationController.signal,
    )
    overlayVisible.value = false
    statusVisible.value = true
    progress.value = {
      phase: 'preparing',
      message: '이미지 번역을 준비하는 중입니다.',
    }
    const message: ImageTranslationWorkerRequest = {
      type: 'analyze-image',
      requestId,
      file: item.file,
    }
    getWorker().postMessage(message)
  }

  async function start(item: MediaItem): Promise<void> {
    cancel()
    dismissNotice()
    currentItemId = item.id
    if (!isChromeTranslatorSupported()) {
      statusVisible.value = true
      progress.value = {
        phase: 'error',
        message: '이미지 번역에는 Chrome 138 이상 데스크톱 버전의 내장 번역 기능이 필요합니다.',
      }
      return
    }

    const sequence = ++startSequence
    statusVisible.value = true
    progress.value = {
      phase: 'preparing',
      message: options.prepareResultPersistence
        ? '번역 결과를 저장할 폴더 권한을 확인하는 중입니다.'
        : '이미지 번역을 준비하는 중입니다.',
    }

    let persistResult = false
    try {
      persistResult = await options.prepareResultPersistence?.(item) ?? false
    } catch {
      persistResult = false
    }
    if (sequence !== startSequence || currentItemId !== item.id) return
    startAnalysis(item, persistResult)
  }

  function toggle(item: MediaItem): void {
    if (pendingTranslation?.itemId === item.id) {
      continueTranslation()
      return
    }

    if (processing.value) {
      cancel()
      return
    }

    void start(item)
  }

  function toggleOverlay(): void {
    if (!result.value?.regions.length) return
    overlayPreferredVisible = !overlayPreferredVisible
    syncOverlayVisibility()
    options.onOverlayVisibilityChange?.(overlayPreferredVisible)
  }

  function dismissStatus(): void {
    statusVisible.value = false
  }

  function dispose(): void {
    cancel()
    dismissNotice()
    terminateWorker()
    resultCache.clear()
    resultCacheOrder.length = 0
  }

  onBeforeUnmount(dispose)

  return {
    continueTranslation,
    dismissNotice,
    dismissStatus,
    notice,
    overlayVisible,
    processing,
    progress,
    result,
    selectItem,
    statusVisible,
    toggle,
    toggleOverlay,
  }
}
