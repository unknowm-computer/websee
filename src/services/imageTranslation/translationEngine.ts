import * as chromeTranslator from './chromeTranslator'
import * as appleTranslator from './appleTranslator'
import type { AppleTranslationModel, TranslationEngineId } from '@/types/translationEngine'
import type { ImageTranslationRegion } from '@/types/imageTranslation'

export interface TranslationEngine {
  id: TranslationEngineId
  name: string
  unavailableMessage: string
  downloadMessage: string
  assertReady(signal?: AbortSignal): Promise<void>
  prepareLanguageDetector: typeof chromeTranslator.prepareLanguageDetector
  detectSourceLanguage: typeof chromeTranslator.detectSourceLanguage
  getAvailability(sourceLanguage: chromeTranslator.SupportedSourceLanguage, signal?: AbortSignal): Promise<Availability>
  translate: typeof chromeTranslator.translateRecognizedRegions
}

function joinOcrLines(text: string): string {
  return text
    // 일본어·중국어 글자 사이의 개행은 단어 사이 공백으로 바꾸지 않습니다.
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[^\S\r\n]*[\r\n]+[^\S\r\n]*(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function createTranslationEngine(
  id: TranslationEngineId,
  appleModel: AppleTranslationModel = 'low-latency',
): TranslationEngine {
  const apple = id === 'apple'
  return {
    id,
    name: apple ? 'Apple 번역' : 'Chrome 번역',
    unavailableMessage: apple
      ? 'Apple 번역에서 해당 언어의 한국어 번역을 지원하지 않습니다.'
      : '이 Chrome에서는 해당 언어의 내장 한국어 번역 기능을 사용할 수 없습니다.',
    downloadMessage: apple
      ? '시스템 설정 → 일반 → 언어 및 지역 → 번역 언어에서 원문 언어와 한국어를 다운로드한 후 번역 계속을 눌러주세요.'
      : 'Chrome 한국어 번역 모델을 받으려면 번역 계속을 눌러주세요.',
    async assertReady(signal?: AbortSignal): Promise<void> {
      if (apple) return appleTranslator.checkAppleTranslation(signal, appleModel)
      if (!chromeTranslator.isChromeTranslatorSupported()) {
        throw new Error('이미지 번역에는 Chrome 138 이상 데스크톱 버전의 내장 번역 기능이 필요합니다.')
      }
    },
    prepareLanguageDetector: apple
      ? async (): Promise<undefined> => undefined
      : chromeTranslator.prepareLanguageDetector,
    detectSourceLanguage: apple
      ? (regions: Parameters<typeof chromeTranslator.detectSourceLanguage>[0], _detector: chromeTranslator.LanguageDetectorInstance | undefined, signal?: AbortSignal) =>
        appleTranslator.detectAppleSourceLanguage(regions, signal)
      : chromeTranslator.detectSourceLanguage,
    getAvailability: apple
      ? (sourceLanguage, signal) => appleTranslator.getAppleTranslationAvailability(sourceLanguage, signal, appleModel)
      : chromeTranslator.getTranslationAvailability,
    async translate(regions, sourceLanguage, onProgress, signal): Promise<ImageTranslationRegion[]> {
      const input = regions.map((region) => ({ ...region, sourceText: joinOcrLines(region.sourceText) }))
      const translated = apple
        ? await appleTranslator.translateAppleRegions(input, sourceLanguage, onProgress, signal, appleModel)
        : await chromeTranslator.translateRecognizedRegions(input, sourceLanguage, onProgress, signal)
      // 원문 툴팁과 저장 데이터에는 실제 OCR 결과를 보존합니다.
      return translated.map((region, index) => ({ ...region, sourceText: regions[index].sourceText }))
    },
  }
}
