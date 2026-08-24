import { describe, expect, it, vi } from 'vitest'

import {
  loadTranslationSidecar,
  requestTranslationSidecarPermission,
  saveTranslationSidecar,
  type TranslationSidecarTarget,
} from '@/services/imageTranslation/translationSidecar'
import type { ImageTranslationResult } from '@/types/imageTranslation'
import type { MediaItem } from '@/types/media'

interface FakeFileRecord {
  text: string
}

interface FakeDirectory {
  directories: Map<string, FakeDirectory>
  files: Map<string, FakeFileRecord>
  handle: FileSystemDirectoryHandle
  requestPermission: ReturnType<typeof vi.fn>
}

function createFakeDirectory(name = 'root'): FakeDirectory {
  const directories = new Map<string, FakeDirectory>()
  const files = new Map<string, FakeFileRecord>()
  const requestPermission = vi.fn(async () => 'granted' as PermissionState)
  const handle = {
    kind: 'directory',
    name,
    requestPermission,
    async getDirectoryHandle(childName: string, options?: FileSystemGetDirectoryOptions) {
      const existing = directories.get(childName)
      if (existing) return existing.handle
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError')
      const created = createFakeDirectory(childName)
      directories.set(childName, created)
      return created.handle
    },
    async getFileHandle(fileName: string, options?: FileSystemGetFileOptions) {
      let record = files.get(fileName)
      if (!record && !options?.create) throw new DOMException('Not found', 'NotFoundError')
      if (!record) {
        record = { text: '' }
        files.set(fileName, record)
      }
      const activeRecord = record
      return {
        kind: 'file',
        name: fileName,
        async getFile() {
          return new File([activeRecord.text], fileName, { type: 'application/json' })
        },
        async createWritable() {
          return {
            async write(data: FileSystemWriteChunkType) {
              if (typeof data !== 'string') throw new Error('The test writer expects a string.')
              activeRecord.text = data
            },
            async close() {},
          } as FileSystemWritableFileStream
        },
      } as FileSystemFileHandle
    },
  } as unknown as FileSystemDirectoryHandle

  return { directories, files, handle, requestPermission }
}

function createItem(
  name: string,
  kind: MediaItem['kind'],
  options: { id?: string; lastModified?: number; path?: string; size?: number } = {},
): MediaItem {
  const file = new File(['source'], name, { lastModified: options.lastModified ?? 100 })
  const path = options.path ?? name
  return {
    id: options.id ?? `${kind}:${path}`,
    kind,
    name,
    path,
    directoryPath: '',
    file,
    size: options.size ?? file.size,
    format: name.split('.').at(-1)?.toUpperCase() ?? '',
    lastModified: options.lastModified ?? file.lastModified,
  }
}

function createResult(itemId: string, translatedText: string): ImageTranslationResult {
  return {
    itemId,
    imageWidth: 1200,
    imageHeight: 1800,
    regions: [{
      id: 'region-1',
      kind: 'bubble',
      bounds: { x: 100, y: 200, width: 300, height: 180 },
      sourceText: 'こんにちは',
      translatedText,
      detectionScore: 0.95,
    }],
  }
}

describe('translation sidecar', () => {
  it('stores an image result and restores it with the current runtime item id', async () => {
    const directory = createFakeDirectory()
    const item = createItem('001.jpg', 'image')
    const target: TranslationSidecarTarget = {
      directoryHandle: directory.handle,
      sourceItem: item,
    }

    await saveTranslationSidecar(target, item, createResult(item.id, '안녕하세요'))

    const reopenedItem = { ...item, id: 'image:reopened' }
    const restored = await loadTranslationSidecar(
      { ...target, sourceItem: reopenedItem },
      reopenedItem,
    )
    expect(restored?.itemId).toBe('image:reopened')
    expect(restored?.regions[0].translatedText).toBe('안녕하세요')
    expect(directory.directories.get('.websee')?.files.has('001.jpg.json')).toBe(true)
  })

  it('does not restore an image result after the source file changes', async () => {
    const directory = createFakeDirectory()
    const item = createItem('001.jpg', 'image')
    const target: TranslationSidecarTarget = {
      directoryHandle: directory.handle,
      sourceItem: item,
    }
    await saveTranslationSidecar(target, item, createResult(item.id, '저장 결과'))

    const changedItem = createItem('001.jpg', 'image', { lastModified: 200 })
    await expect(loadTranslationSidecar(
      { ...target, sourceItem: changedItem },
      changedItem,
    )).resolves.toBeUndefined()
  })

  it('keeps multiple archive entry results in one archive sidecar', async () => {
    const directory = createFakeDirectory()
    const archive = createItem('book.cbz', 'archive', { size: 2048 })
    const first = createItem('001.jpg', 'archive-entry', {
      path: 'chapter/001.jpg',
      size: 512,
    })
    const second = createItem('002.jpg', 'archive-entry', {
      path: 'chapter/002.jpg',
      size: 768,
    })
    const target = (item: MediaItem): TranslationSidecarTarget => ({
      directoryHandle: directory.handle,
      sourceItem: archive,
      archiveEntryPath: item.path,
    })

    await saveTranslationSidecar(target(first), first, createResult(first.id, '첫 장'))
    await saveTranslationSidecar(target(second), second, createResult(second.id, '둘째 장'))

    await expect(loadTranslationSidecar(target(first), first)).resolves.toMatchObject({
      regions: [{ translatedText: '첫 장' }],
    })
    await expect(loadTranslationSidecar(target(second), second)).resolves.toMatchObject({
      regions: [{ translatedText: '둘째 장' }],
    })
    expect(directory.directories.get('.websee')?.files.size).toBe(1)
    expect(directory.directories.get('.websee')?.files.has('book.cbz.json')).toBe(true)
  })

  it('requests read-write permission from the source directory', async () => {
    const directory = createFakeDirectory()
    const item = createItem('001.jpg', 'image')

    await expect(requestTranslationSidecarPermission({
      directoryHandle: directory.handle,
      sourceItem: item,
    })).resolves.toBe(true)
    expect(directory.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
  })
})
