import {
  extractArchiveEntry,
  loadArchiveIndex,
} from '@/services/mediaSources'
import {
  loadTranslationSidecar,
  requestDirectoryWritePermission,
  saveTranslationSidecar,
  type TranslationSidecarTarget,
} from '@/services/imageTranslation/translationSidecar'
import type {
  BatchTranslationEvent,
  BatchTranslationOptions,
  BatchTranslationRun,
} from '@/types/batchTranslation'
import type { ArchiveIndex, MediaItem } from '@/types/media'
import { naturalCompare } from '@/utils/media'

interface CreateBatchTranslationRunOptions {
  directoryHandle: FileSystemDirectoryHandle
  folderLabel: string
  items: readonly MediaItem[]
  translationOptions: BatchTranslationOptions
}

function describeArchiveError(error: unknown): string {
  if (error instanceof Error && /encrypted|password/i.test(error.message)) {
    return '암호화된 압축파일은 지원하지 않습니다.'
  }
  if (error instanceof Error && /multi-volume|volume archive|multi-part/i.test(error.message)) {
    return '분할 RAR 압축파일은 지원하지 않습니다.'
  }
  return error instanceof Error && error.message
    ? error.message
    : '압축파일을 읽지 못했습니다.'
}

async function* createBatchTranslationEvents(
  directoryHandle: FileSystemDirectoryHandle,
  images: readonly MediaItem[],
  archives: readonly MediaItem[],
): AsyncGenerator<BatchTranslationEvent> {
  yield { type: 'discover', count: images.length }

  for (const item of images) {
    const target: TranslationSidecarTarget = { directoryHandle, sourceItem: item }
    yield {
      type: 'task',
      task: {
        item,
        label: item.name,
        loadFile: () => Promise.resolve(item.file),
        loadSavedResult: () => loadTranslationSidecar(target, item),
        saveResult: (result) => saveTranslationSidecar(target, item, result),
      },
    }
  }

  for (const archiveItem of archives) {
    yield { type: 'status', message: `${archiveItem.name}의 이미지 목록을 읽는 중입니다.` }
    let index: ArchiveIndex
    try {
      index = await loadArchiveIndex(archiveItem.file)
    } catch (error) {
      yield {
        type: 'failure',
        label: archiveItem.name,
        message: describeArchiveError(error),
      }
      continue
    }

    const entries = index.items
      .filter((item) => item.kind === 'archive-entry')
      .sort((left, right) => naturalCompare(left.path, right.path))
    yield { type: 'discover', count: entries.length }

    for (const entry of entries) {
      const target: TranslationSidecarTarget = {
        directoryHandle,
        sourceItem: archiveItem,
        archiveEntryPath: entry.path,
      }
      yield {
        type: 'task',
        task: {
          item: entry,
          label: `${archiveItem.name} / ${entry.path}`,
          loadFile: () => extractArchiveEntry(index, entry),
          loadSavedResult: () => loadTranslationSidecar(target, entry),
          saveResult: (result) => saveTranslationSidecar(target, entry, result),
        },
      }
    }
  }
}

export function createBatchTranslationRun(
  options: CreateBatchTranslationRunOptions,
): BatchTranslationRun | undefined {
  const sourceItems = [...options.items]
    .sort((left, right) => naturalCompare(left.path, right.path))
  const images = sourceItems.filter((item) => item.kind === 'image')
  const archives = options.translationOptions.includeArchives
    ? sourceItems.filter((item) => item.kind === 'archive')
    : []
  if (!images.length && !archives.length) return undefined

  return {
    folderLabel: options.folderLabel,
    skipExisting: options.translationOptions.skipExisting,
    requestPermission: () => requestDirectoryWritePermission(options.directoryHandle),
    events: createBatchTranslationEvents(options.directoryHandle, images, archives),
  }
}
