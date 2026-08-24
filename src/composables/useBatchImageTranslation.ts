import { computed, onBeforeUnmount, reactive } from 'vue'

import { ImageTranslationRunner } from '@/services/imageTranslation/imageTranslationRunner'
import {
  isChromeTranslatorSupported,
  type SupportedSourceLanguage,
} from '@/services/imageTranslation/chromeTranslator'
import type {
  BatchTranslationRun,
  BatchTranslationState,
  BatchTranslationTask,
} from '@/types/batchTranslation'

const ACTIVE_PHASES = new Set<BatchTranslationState['phase']>([
  'requesting-permission',
  'running',
  'awaiting-translation',
  'pausing',
  'paused',
  'stopping',
])

interface PendingTranslationStart {
  continue: () => void
  reject: (reason: unknown) => void
}

function createInitialState(): BatchTranslationState {
  return {
    phase: 'idle',
    folderLabel: '',
    currentItemName: '',
    message: '',
    progress: { phase: 'idle', message: '' },
    counts: {
      discovered: 0,
      processed: 0,
      translated: 0,
      skipped: 0,
      failed: 0,
    },
    errors: [],
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useBatchImageTranslation() {
  const state = reactive<BatchTranslationState>(createInitialState())
  const active = computed(() => ACTIVE_PHASES.has(state.phase))
  let runner: ImageTranslationRunner | undefined
  let controller: AbortController | undefined
  let runSequence = 0
  let pauseRequested = false
  let stopRequested = false
  let resumePausedRun: (() => void) | undefined
  let pendingTranslationStart: PendingTranslationStart | undefined

  function resetState(folderLabel: string): void {
    Object.assign(state, createInitialState())
    state.folderLabel = folderLabel
  }

  function addFailure(label: string, message: string, countAsTask = true): void {
    if (countAsTask) {
      state.counts.discovered += 1
      state.counts.processed += 1
    }
    state.counts.failed += 1
    state.errors.push(`${label}: ${message}`)
    if (state.errors.length > 20) state.errors.shift()
  }

  function waitForTranslationStart(
    sourceLanguage: SupportedSourceLanguage,
    signal: AbortSignal,
  ): Promise<void> {
    state.phase = 'awaiting-translation'
    state.message = `${sourceLanguage.toUpperCase()} → 한국어 번역 모델을 준비하려면 번역 계속을 눌러주세요.`
    return new Promise<void>((resolve, reject) => {
      const handleAbort = (): void => {
        pendingTranslationStart = undefined
        reject(new DOMException('번역 작업이 취소되었습니다.', 'AbortError'))
      }
      signal.addEventListener('abort', handleAbort, { once: true })
      pendingTranslationStart = {
        continue: () => {
          signal.removeEventListener('abort', handleAbort)
          pendingTranslationStart = undefined
          state.phase = stopRequested ? 'stopping' : pauseRequested ? 'pausing' : 'running'
          resolve()
        },
        reject: (reason) => {
          signal.removeEventListener('abort', handleAbort)
          pendingTranslationStart = undefined
          reject(reason)
        },
      }
    })
  }

  function continueTranslation(): void {
    pendingTranslationStart?.continue()
  }

  async function waitWhilePaused(sequence: number): Promise<void> {
    if (!pauseRequested || stopRequested || sequence !== runSequence) return
    state.phase = 'paused'
    state.message = '일괄 번역을 일시정지했습니다.'
    await new Promise<void>((resolve) => {
      resumePausedRun = resolve
    })
    resumePausedRun = undefined
    if (!stopRequested && sequence === runSequence) {
      state.phase = 'running'
      state.message = '일괄 번역을 다시 시작했습니다.'
    }
  }

  async function processTask(
    task: BatchTranslationTask,
    run: BatchTranslationRun,
    signal: AbortSignal,
  ): Promise<void> {
    state.currentItemName = task.label
    if (run.skipExisting) {
      try {
        const savedResult = await task.loadSavedResult()
        if (savedResult) {
          state.counts.skipped += 1
          state.counts.processed += 1
          state.message = `${task.label}의 저장된 번역을 건너뛰었습니다.`
          return
        }
      } catch {
        // 읽기 오류가 있어도 새 번역과 저장을 시도합니다.
      }
    }

    const file = await task.loadFile()
    const result = await runner?.translate(file, task.item.id, {
      signal,
      onProgress: (progress) => {
        state.progress = progress
        state.message = progress.message
      },
      waitForTranslationStart: (sourceLanguage) =>
        waitForTranslationStart(sourceLanguage, signal),
    })
    if (!result) throw new Error('이미지 번역 엔진이 준비되지 않았습니다.')
    await task.saveResult(result)
    state.counts.translated += 1
    state.counts.processed += 1
    state.message = `${task.label}의 번역 결과를 저장했습니다.`
  }

  async function start(run: BatchTranslationRun): Promise<void> {
    if (active.value) return
    const sequence = ++runSequence
    resetState(run.folderLabel)
    pauseRequested = false
    stopRequested = false
    controller = new AbortController()
    runner = new ImageTranslationRunner()
    if (!isChromeTranslatorSupported()) {
      state.phase = 'error'
      state.message = '이미지 번역에는 Chrome 138 이상 데스크톱 버전의 내장 번역 기능이 필요합니다.'
      runner.dispose()
      runner = undefined
      controller = undefined
      return
    }
    state.phase = 'requesting-permission'
    state.message = '번역 결과를 저장할 폴더 권한을 확인하는 중입니다.'

    try {
      const permissionGranted = await run.requestPermission()
      if (sequence !== runSequence) return
      if (stopRequested) {
        state.phase = 'stopped'
        state.message = '일괄 번역을 시작하지 않았습니다.'
        return
      }
      if (!permissionGranted) {
        throw new Error('일괄 번역에는 원본 폴더의 쓰기 권한이 필요합니다.')
      }

      state.phase = 'running'
      state.message = '일괄 번역 대상을 확인하는 중입니다.'
      for await (const event of run.events) {
        if (sequence !== runSequence || controller.signal.aborted || stopRequested) break

        if (event.type === 'discover') {
          state.counts.discovered += event.count
          continue
        }
        if (event.type === 'status') {
          state.message = event.message
          continue
        }
        if (event.type === 'failure') {
          addFailure(event.label, event.message)
          continue
        }

        await waitWhilePaused(sequence)
        if (sequence !== runSequence || controller.signal.aborted || stopRequested) break
        try {
          await processTask(event.task, run, controller.signal)
        } catch (error) {
          if (isAbortError(error)) {
            if (stopRequested || controller.signal.aborted) break
            throw error
          }
          state.counts.processed += 1
          addFailure(
            event.task.label,
            describeError(error, '이미지를 번역하지 못했습니다.'),
            false,
          )
        }

        if (stopRequested) break
        await waitWhilePaused(sequence)
      }

      if (sequence !== runSequence) return
      if (stopRequested) {
        state.phase = 'stopped'
        state.message = '일괄 번역을 중지했습니다. 다시 실행하면 저장되지 않은 항목부터 이어집니다.'
      } else {
        state.phase = 'completed'
        state.message = state.counts.failed
          ? `일괄 번역을 마쳤습니다. ${state.counts.failed}개 항목은 처리하지 못했습니다.`
          : '일괄 번역을 마쳤습니다.'
      }
    } catch (error) {
      if (sequence !== runSequence || isAbortError(error)) return
      state.phase = 'error'
      state.message = describeError(error, '일괄 번역을 시작하지 못했습니다.')
    } finally {
      if (sequence === runSequence) {
        runner?.dispose()
        runner = undefined
        controller = undefined
        pendingTranslationStart = undefined
        resumePausedRun = undefined
      }
    }
  }

  function pause(): void {
    if (state.phase !== 'running') return
    pauseRequested = true
    state.phase = 'pausing'
    state.message = '현재 이미지를 저장한 후 일시정지합니다.'
  }

  function resume(): void {
    if (state.phase !== 'paused') return
    pauseRequested = false
    resumePausedRun?.()
  }

  function stop(): void {
    if (!active.value) return
    stopRequested = true
    pauseRequested = false
    state.phase = 'stopping'
    state.message = pendingTranslationStart
      ? '번역 모델 준비 대기를 취소하고 있습니다.'
      : '현재 이미지를 저장한 후 일괄 번역을 중지합니다.'
    if (pendingTranslationStart) {
      pendingTranslationStart.reject(new DOMException('번역 작업이 취소되었습니다.', 'AbortError'))
      controller?.abort()
    }
    resumePausedRun?.()
  }

  function dispose(): void {
    runSequence += 1
    controller?.abort()
    pendingTranslationStart?.reject(new DOMException('번역 작업이 취소되었습니다.', 'AbortError'))
    resumePausedRun?.()
    runner?.dispose()
    runner = undefined
    controller = undefined
    pendingTranslationStart = undefined
    resumePausedRun = undefined
  }

  onBeforeUnmount(dispose)

  return {
    active,
    continueTranslation,
    pause,
    resume,
    start,
    state,
    stop,
  }
}
