/// <reference types="chrome-types" />

import type { SupportedSourceLanguage } from './chromeTranslator'
import type { AppleTranslationModel } from '@/types/translationEngine'
import type { ImageTranslationProgress, ImageTranslationRegion, RecognizedTextRegion } from '@/types/imageTranslation'

const HOST_NAME = 'com.websee.translation'
const HOST_ERROR = 'macOS 도우미에 연결하지 못했습니다. 옵션 → 이미지 번역의 설치 안내를 확인해주세요.'

interface HostMessage {
  type: 'result' | 'progress' | 'error'
  value?: unknown
  completed?: number
  total?: number
  message?: string
}

function isHostMessage(value: unknown): value is HostMessage {
  if (typeof value !== 'object' || value === null) return false
  return 'type' in value && ['result', 'progress', 'error'].includes(String(value.type))
}

export function getAppleTranslationExtensionId(): string | undefined {
  return globalThis.chrome?.runtime?.id
}

export function requestAppleTranslation(
  request: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<unknown> {
  if (signal?.aborted) return Promise.reject(new DOMException('번역 작업이 취소되었습니다.', 'AbortError'))
  const runtime = globalThis.chrome?.runtime
  if (!runtime?.id) {
    const message = globalThis.location?.protocol === 'chrome-extension:'
      ? 'WebSee의 Chrome 확장 연결이 해제되었습니다. 기존 WebSee 탭을 모두 닫고 Chrome 툴바의 WebSee 아이콘으로 다시 열어주세요.'
      : 'macOS 번역·OCR은 macOS용 Chrome 확장 프로그램에서 사용할 수 있습니다. 개발 서버에서는 Chrome 내장 번역과 기본 OCR을 선택해주세요.'
    return Promise.reject(new Error(message))
  }
  if (typeof runtime.connectNative !== 'function') {
    try {
      const hasPermission = runtime.getManifest().permissions?.includes('nativeMessaging') === true
      const message = hasPermission
        ? 'nativeMessaging 권한은 있으나 Chrome에서 도우미 연결 API를 제공하지 않습니다. Chrome 버전과 확장 프로그램 정책을 확인해주세요.'
        : 'Chrome에 로드된 WebSee에 도우미 연결 권한(nativeMessaging)이 없습니다. chrome://extensions에서 WebSee를 새로고침하고 기존 WebSee 탭을 닫은 후 다시 열어주세요.'
      return Promise.reject(new Error(message))
    } catch {
      return Promise.reject(new Error('Chrome 확장 정보를 읽을 수 없습니다. 기존 WebSee 탭을 닫고 Chrome 툴바의 WebSee 아이콘으로 다시 열어주세요.'))
    }
  }

  return new Promise((resolve, reject) => {
    let port: chrome.runtime.Port
    try {
      port = runtime.connectNative(HOST_NAME)
    } catch {
      reject(new Error(HOST_ERROR))
      return
    }
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (error?: Error, value?: unknown): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      port.onMessage.removeListener(receive)
      port.onDisconnect.removeListener(disconnect)
      port.disconnect()
      if (error) reject(error)
      else resolve(value)
    }
    const resetTimer = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => finish(new Error('macOS 도우미의 응답 시간이 초과되었습니다.')), request.operation === 'translate' || request.operation === 'ocr' ? 120_000 : 15_000)
    }
    const abort = (): void => finish(new DOMException('번역 작업이 취소되었습니다.', 'AbortError'))
    const disconnect = (): void => {
      // lastError는 콜백 안에서 읽어 Chrome의 미처리 오류 경고를 방지합니다.
      const reason = (runtime as typeof runtime & { lastError?: { message?: string } }).lastError?.message
      finish(new Error(reason ? `${HOST_ERROR} (${reason})` : HOST_ERROR))
    }
    const receive = (message: unknown): void => {
      if (!isHostMessage(message)) {
        finish(new Error('macOS 도우미의 응답 형식이 올바르지 않습니다.'))
        return
      }
      resetTimer()
      if (message.type === 'error') finish(new Error(message.message || 'macOS 도우미의 작업에 실패했습니다.'))
      else if (message.type === 'result') finish(undefined, message.value)
      else if (typeof message.completed === 'number' && typeof message.total === 'number') {
        onProgress?.(message.completed, message.total)
      }
    }
    port.onMessage.addListener(receive)
    port.onDisconnect.addListener(disconnect)
    signal?.addEventListener('abort', abort, { once: true })
    resetTimer()
    try { port.postMessage(request) } catch { finish(new Error(HOST_ERROR)) }
  })
}

export async function checkAppleTranslation(
  signal?: AbortSignal,
  model: AppleTranslationModel = 'low-latency',
): Promise<void> {
  const result = await requestAppleTranslation({ operation: 'ping', model }, signal)
  if (result !== 'websee-translation-v2' && result !== 'websee-translation-v3') {
    throw new Error('설치된 Apple 번역 도우미는 모델 선택을 지원하지 않습니다. 설치 안내의 명령을 다시 실행해 도우미를 업데이트해주세요.')
  }
}

export async function detectAppleSourceLanguage(
  regions: readonly RecognizedTextRegion[],
  signal?: AbortSignal,
): Promise<SupportedSourceLanguage> {
  const value = await requestAppleTranslation({
    operation: 'detect',
    text: regions.map((region) => region.sourceText).join('\n').slice(0, 4000),
  }, signal)
  if (value !== 'en' && value !== 'ja' && value !== 'zh' && value !== 'ko') {
    throw new Error('Apple 번역에서 인식한 원문 언어를 지원하지 않습니다. 영어·일본어·중국어·한국어를 지원합니다.')
  }
  return value
}

export async function getAppleTranslationAvailability(
  sourceLanguage: SupportedSourceLanguage,
  signal?: AbortSignal,
  model: AppleTranslationModel = 'low-latency',
): Promise<Availability> {
  if (sourceLanguage === 'ko') return 'available'
  const value = await requestAppleTranslation({ operation: 'availability', sourceLanguage, model }, signal)
  if (value !== 'available' && value !== 'downloadable' && value !== 'unavailable') {
    throw new Error('Apple 번역의 언어팩 상태를 확인하지 못했습니다.')
  }
  return value
}

export async function translateAppleRegions(
  regions: readonly RecognizedTextRegion[],
  sourceLanguage: SupportedSourceLanguage,
  onProgress: (progress: ImageTranslationProgress) => void,
  signal: AbortSignal,
  model: AppleTranslationModel = 'low-latency',
): Promise<ImageTranslationRegion[]> {
  if (!regions.length || sourceLanguage === 'ko') {
    return regions.map((region) => ({ ...region, translatedText: region.sourceText }))
  }
  const translations = await requestAppleTranslation({
    operation: 'translate', sourceLanguage, model, texts: regions.map((region) => region.sourceText),
  }, signal, (completed, total) => onProgress({
    phase: 'translating', message: `Apple 번역으로 한국어로 번역하는 중입니다. (${completed}/${total})`, completed, total,
  }))
  if (!Array.isArray(translations) || translations.length !== regions.length
    || !translations.every((text): text is string => typeof text === 'string')) {
    throw new Error('Apple 번역 결과가 원문 영역과 일치하지 않습니다.')
  }
  return regions.map((region, index) => ({ ...region, translatedText: translations[index].trim() || region.sourceText }))
}
