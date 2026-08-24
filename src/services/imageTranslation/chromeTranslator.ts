import type {
  ImageTranslationProgress,
  ImageTranslationRegion,
  RecognizedTextRegion,
} from '@/types/imageTranslation'

export type SupportedSourceLanguage = 'en' | 'ja' | 'ko' | 'zh'
export type ModelAvailability = Availability
export type LanguageDetectorInstance = LanguageDetector

interface ChromeAiGlobals {
  Translator?: typeof Translator
  LanguageDetector?: typeof LanguageDetector
}

type ProgressCallback = (progress: ImageTranslationProgress) => void

function getChromeAiGlobals(): ChromeAiGlobals {
  return globalThis as unknown as ChromeAiGlobals
}

export function isChromeTranslatorSupported(): boolean {
  return getChromeAiGlobals().Translator !== undefined
}

export function isTranslationUnavailable(availability: ModelAvailability): boolean {
  return availability === 'unavailable'
}

function inferLanguageFromCharacters(text: string): SupportedSourceLanguage {
  if (/[\u3040-\u30ff]/u.test(text)) return 'ja'
  if (/[\uac00-\ud7af]/u.test(text)) return 'ko'
  if (/\p{Script=Han}/u.test(text)) return 'ja'
  if (/[A-Za-z]/u.test(text)) return 'en'
  return 'ja'
}

function normalizeDetectedLanguage(language: string): SupportedSourceLanguage | undefined {
  const primary = language.toLowerCase().split('-')[0]
  if (primary === 'en' || primary === 'ja' || primary === 'ko' || primary === 'zh') {
    return primary
  }
  return undefined
}

export function prepareLanguageDetector(
  onProgress: ProgressCallback,
  signal: AbortSignal,
): Promise<LanguageDetectorInstance | undefined> {
  const factory = getChromeAiGlobals().LanguageDetector
  if (!factory) return Promise.resolve(undefined)

  return factory.create({
    signal,
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => {
        onProgress({
          phase: 'preparing',
          message: '원문 언어 확인 기능을 준비하는 중입니다.',
          completed: Math.round(event.loaded * 100),
          total: 100,
        })
      })
    },
  }).catch(() => undefined)
}

export async function detectSourceLanguage(
  regions: readonly RecognizedTextRegion[],
  detector: LanguageDetectorInstance | undefined,
  signal?: AbortSignal,
): Promise<SupportedSourceLanguage> {
  const sample = regions.map((region) => region.sourceText).join('\n').slice(0, 4_000)
  const fallback = inferLanguageFromCharacters(sample)
  if (!detector) return fallback
  try {
    const results = await detector.detect(sample, { signal })
    const detected = results
      .filter((result) => (result.confidence ?? 0) >= 0.35)
      .map((result) => result.detectedLanguage
        ? normalizeDetectedLanguage(result.detectedLanguage)
        : undefined)
      .find((language) => language !== undefined)
    return detected ?? fallback
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return fallback
  } finally {
    detector?.destroy()
  }
}

export async function getTranslationAvailability(
  sourceLanguage: SupportedSourceLanguage,
): Promise<ModelAvailability> {
  if (sourceLanguage === 'ko') return 'available'
  const factory = getChromeAiGlobals().Translator
  if (!factory) return 'unavailable'
  return factory.availability({ sourceLanguage, targetLanguage: 'ko' })
}

export function isTranslationImmediatelyAvailable(availability: ModelAvailability): boolean {
  return availability === 'available'
}

function createTranslator(
  sourceLanguage: SupportedSourceLanguage,
  onProgress: ProgressCallback,
  signal: AbortSignal,
): Promise<Translator> {
  const factory = getChromeAiGlobals().Translator
  if (!factory) {
    throw new Error('이 Chrome에서는 내장 번역 기능을 사용할 수 없습니다. Chrome을 최신 버전으로 업데이트해주세요.')
  }

  return factory.create({
    sourceLanguage,
    targetLanguage: 'ko',
    signal,
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => {
        onProgress({
          phase: 'translating',
          message: 'Chrome 번역 모델을 준비하는 중입니다.',
          completed: Math.round(event.loaded * 100),
          total: 100,
        })
      })
    },
  })
}

export async function translateRecognizedRegions(
  regions: readonly RecognizedTextRegion[],
  sourceLanguage: SupportedSourceLanguage,
  onProgress: ProgressCallback,
  signal: AbortSignal,
): Promise<ImageTranslationRegion[]> {
  if (!regions.length) return []
  if (sourceLanguage === 'ko') {
    return regions.map((region) => ({ ...region, translatedText: region.sourceText }))
  }

  const translator = await createTranslator(sourceLanguage, onProgress, signal)
  try {
    const translated: ImageTranslationRegion[] = []
    for (let index = 0; index < regions.length; index += 1) {
      onProgress({
        phase: 'translating',
        message: `한국어로 번역하는 중입니다. (${index + 1}/${regions.length})`,
        completed: index,
        total: regions.length,
      })
      const region = regions[index]
      const translatedText = (await translator.translate(region.sourceText, { signal })).trim()
      translated.push({
        ...region,
        translatedText: translatedText || region.sourceText,
      })
    }
    return translated
  } finally {
    translator.destroy()
  }
}
