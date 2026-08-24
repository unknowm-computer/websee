import type { ImageTranslationProgress, ImageTranslationResult } from '@/types/imageTranslation'
import type { MediaItem } from '@/types/media'

export type BatchTranslationPhase =
  | 'idle'
  | 'requesting-permission'
  | 'running'
  | 'awaiting-translation'
  | 'pausing'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'stopped'
  | 'error'

export interface BatchTranslationOptions {
  includeArchives: boolean
  skipExisting: boolean
}

export interface BatchTranslationCounts {
  discovered: number
  failed: number
  processed: number
  skipped: number
  translated: number
}

export interface BatchTranslationState {
  counts: BatchTranslationCounts
  currentItemName: string
  errors: string[]
  folderLabel: string
  message: string
  phase: BatchTranslationPhase
  progress: ImageTranslationProgress
}

export interface BatchTranslationTask {
  item: MediaItem
  label: string
  loadFile: () => Promise<File>
  loadSavedResult: () => Promise<ImageTranslationResult | undefined>
  saveResult: (result: ImageTranslationResult) => Promise<void>
}

export type BatchTranslationEvent =
  | { type: 'discover'; count: number }
  | { type: 'failure'; label: string; message: string }
  | { type: 'status'; message: string }
  | { type: 'task'; task: BatchTranslationTask }

export interface BatchTranslationRun {
  events: AsyncIterable<BatchTranslationEvent>
  folderLabel: string
  requestPermission: () => Promise<boolean>
  skipExisting: boolean
}
