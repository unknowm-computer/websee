import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  checkAppleTranslation,
  getAppleTranslationExtensionId,
} from '@/services/imageTranslation/appleTranslator'
import { checkAppleOcr } from '@/services/imageTranslation/appleOcr'
import type { AppleTranslationModel, OcrEngineId, TranslationEngineId } from '@/types/translationEngine'

type ConnectionState = 'idle' | 'checking' | 'connected' | 'error'

export function useAppleTranslationConnection(
  getEngine: () => TranslationEngineId,
  getAppleModel: () => AppleTranslationModel,
  getOcrEngine: () => OcrEngineId,
) {
  const extensionId = getAppleTranslationExtensionId()
  const state = ref<ConnectionState>('idle')
  const message = ref('')
  let controller: AbortController | undefined

  function reset(): void {
    controller?.abort()
    controller = undefined
    state.value = 'idle'
    message.value = ''
  }

  async function checkConnection(): Promise<void> {
    if ((getEngine() !== 'apple' && getOcrEngine() !== 'apple-vision') || state.value === 'checking') return
    const request = new AbortController()
    controller = request
    state.value = 'checking'
    message.value = ''
    try {
      if (getEngine() === 'apple') await checkAppleTranslation(request.signal, getAppleModel())
      if (getOcrEngine() === 'apple-vision') await checkAppleOcr(request.signal)
      if (request.signal.aborted) return
      state.value = 'connected'
      message.value = getEngine() === 'apple'
        ? '도우미에 정상 연결했습니다. 번역 언어팩 상태는 번역할 때 확인합니다.'
        : '도우미에 정상 연결했습니다. macOS Vision OCR을 사용할 수 있습니다.'
    } catch (error) {
      if (request.signal.aborted) return
      state.value = 'error'
      message.value = error instanceof Error
        ? error.message.replace(/ \([^)]*\)$/, '')
        : '도우미에 연결하지 못했습니다. 설치 후 다시 확인해주세요.'
    } finally {
      if (controller === request) controller = undefined
    }
  }

  function checkOnReturn(): void {
    if (!document.hidden && state.value === 'error') void checkConnection()
  }

  watch([getEngine, getAppleModel, getOcrEngine], () => {
    reset()
    if (getEngine() === 'apple' || getOcrEngine() === 'apple-vision') void checkConnection()
  }, { immediate: true })

  onMounted(() => {
    window.addEventListener('focus', checkOnReturn)
    document.addEventListener('visibilitychange', checkOnReturn)
  })
  onBeforeUnmount(() => {
    reset()
    window.removeEventListener('focus', checkOnReturn)
    document.removeEventListener('visibilitychange', checkOnReturn)
  })

  return { extensionId, state, message, checkConnection }
}
