import { describe, expect, it, vi } from 'vitest'

import {
  pickTranslationSourceDirectory,
  TRANSLATION_DIRECTORY_PICKER_ID,
  TranslationSourceDirectoryMismatchError,
  type TranslationDirectoryPicker,
} from '@/services/imageTranslation/translationSourceDirectory'
import type { MediaItem } from '@/types/media'

function createItem(fileHandle?: FileSystemFileHandle): MediaItem {
  const file = new File(['image'], 'sample.png', { lastModified: 100 })
  return {
    id: 'sample.png:5:100',
    kind: 'image',
    name: file.name,
    path: file.name,
    directoryPath: '',
    file,
    fileHandle,
    size: file.size,
    format: 'PNG',
    lastModified: file.lastModified,
  }
}

function createFileHandle(name = 'sample.png'): FileSystemFileHandle {
  return { kind: 'file', name } as FileSystemFileHandle
}

describe('translation source directory', () => {
  it('opens the parent folder picker from the dropped file and accepts the same entry', async () => {
    const droppedFileHandle = createFileHandle()
    const selectedFileHandle = {
      ...createFileHandle(),
      isSameEntry: vi.fn(async () => true),
    } as FileSystemFileHandle
    const directoryHandle = {
      kind: 'directory',
      name: 'images',
      getFileHandle: vi.fn(async () => selectedFileHandle),
    } as unknown as FileSystemDirectoryHandle
    const picker = vi.fn(async () => directoryHandle) as TranslationDirectoryPicker

    await expect(pickTranslationSourceDirectory(
      createItem(droppedFileHandle),
      picker,
    )).resolves.toBe(directoryHandle)
    expect(picker).toHaveBeenCalledWith({
      id: TRANSLATION_DIRECTORY_PICKER_ID,
      mode: 'readwrite',
      startIn: droppedFileHandle,
    })
    expect(directoryHandle.getFileHandle).toHaveBeenCalledWith('sample.png')
    expect(selectedFileHandle.isSameEntry).toHaveBeenCalledWith(droppedFileHandle)
  })

  it('rejects a folder containing a different file with the same name', async () => {
    const directoryHandle = {
      kind: 'directory',
      name: 'other',
      getFileHandle: vi.fn(async () => ({
        ...createFileHandle(),
        isSameEntry: vi.fn(async () => false),
      })),
    } as unknown as FileSystemDirectoryHandle
    const picker = vi.fn(async () => directoryHandle) as TranslationDirectoryPicker

    await expect(pickTranslationSourceDirectory(
      createItem(createFileHandle()),
      picker,
    )).rejects.toBeInstanceOf(TranslationSourceDirectoryMismatchError)
  })

  it('does not open a picker when the item has no dropped file handle', async () => {
    const picker = vi.fn() as unknown as TranslationDirectoryPicker

    await expect(pickTranslationSourceDirectory(createItem(), picker)).resolves.toBeUndefined()
    expect(picker).not.toHaveBeenCalled()
  })
})
