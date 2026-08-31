import type { MediaItem } from '@/types/media'

export const TRANSLATION_DIRECTORY_PICKER_ID = 'websee-translation-source'

export interface TranslationDirectoryPickerOptions {
  id: string
  mode: 'readwrite'
  startIn: FileSystemFileHandle
}

export type TranslationDirectoryPicker = (
  options: TranslationDirectoryPickerOptions,
) => Promise<FileSystemDirectoryHandle>

export class TranslationSourceDirectoryMismatchError extends Error {
  constructor() {
    super('선택한 폴더에 드래그한 원본 파일이 없습니다.')
    this.name = 'TranslationSourceDirectoryMismatchError'
  }
}

export async function pickTranslationSourceDirectory(
  sourceItem: MediaItem,
  picker: TranslationDirectoryPicker,
): Promise<FileSystemDirectoryHandle | undefined> {
  const sourceFileHandle = sourceItem.fileHandle
  if (!sourceFileHandle) return undefined

  const directoryHandle = await picker({
    id: TRANSLATION_DIRECTORY_PICKER_ID,
    mode: 'readwrite',
    startIn: sourceFileHandle,
  })

  try {
    const selectedSourceHandle = await directoryHandle.getFileHandle(sourceItem.name)
    if (!await selectedSourceHandle.isSameEntry(sourceFileHandle)) {
      throw new TranslationSourceDirectoryMismatchError()
    }
  } catch (error) {
    if (error instanceof TranslationSourceDirectoryMismatchError) throw error
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      throw new TranslationSourceDirectoryMismatchError()
    }
    throw error
  }

  return directoryHandle
}
