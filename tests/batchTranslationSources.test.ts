import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

import { createBatchTranslationRun } from '@/services/imageTranslation/batchTranslationSources'
import type { BatchTranslationTask } from '@/types/batchTranslation'
import { createMediaItem } from '@/utils/media'

function createDirectoryHandle(): {
  handle: FileSystemDirectoryHandle
  requestPermission: ReturnType<typeof vi.fn>
} {
  const requestPermission = vi.fn(async () => 'granted' as PermissionState)
  const handle = {
    kind: 'directory',
    name: 'samples',
    requestPermission,
  } as unknown as FileSystemDirectoryHandle
  return {
    handle,
    requestPermission,
  }
}

describe('batch translation sources', () => {
  it('queues folder images and supported archive images in natural path order', async () => {
    const directory = createDirectoryHandle()
    const image = createMediaItem(new File(['image'], 'cover.jpg', { type: 'image/jpeg' }))
    const archive = createMediaItem(new File([zipSync({
      'chapter/10.jpg': strToU8('ten'),
      'chapter/2.jpg': strToU8('two'),
      'chapter/note.txt': strToU8('text'),
    })], 'book.cbz', { type: 'application/zip' }))
    const run = createBatchTranslationRun({
      directoryHandle: directory.handle,
      folderLabel: 'samples',
      items: [archive, image],
      translationOptions: { includeArchives: true, skipExisting: true },
    })
    expect(run).toBeDefined()
    await expect(run?.requestPermission()).resolves.toBe(true)

    const discovered: number[] = []
    const tasks: BatchTranslationTask[] = []
    for await (const event of run?.events ?? []) {
      if (event.type === 'discover') discovered.push(event.count)
      if (event.type === 'task') tasks.push(event.task)
    }

    expect(discovered).toEqual([1, 2])
    expect(tasks.map((task) => task.label)).toEqual([
      'cover.jpg',
      'book.cbz / chapter/2.jpg',
      'book.cbz / chapter/10.jpg',
    ])
    expect(new TextDecoder().decode(await (await tasks[1].loadFile()).arrayBuffer())).toBe('two')
    expect(directory.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
  })

  it('can exclude archives from a folder run', async () => {
    const directory = createDirectoryHandle()
    const image = createMediaItem(new File(['image'], 'cover.jpg', { type: 'image/jpeg' }))
    const archive = createMediaItem(new File([zipSync({
      '001.jpg': strToU8('one'),
    })], 'book.cbz', { type: 'application/zip' }))
    const run = createBatchTranslationRun({
      directoryHandle: directory.handle,
      folderLabel: 'samples',
      items: [image, archive],
      translationOptions: { includeArchives: false, skipExisting: true },
    })

    const labels: string[] = []
    for await (const event of run?.events ?? []) {
      if (event.type === 'task') labels.push(event.task.label)
    }
    expect(labels).toEqual(['cover.jpg'])
  })

  it('queues only explicitly selected top-level files', async () => {
    const directory = createDirectoryHandle()
    const firstImage = createMediaItem(new File(['first'], '001.jpg', { type: 'image/jpeg' }))
    const secondImage = createMediaItem(new File(['second'], '002.jpg', { type: 'image/jpeg' }))
    const archive = createMediaItem(new File([zipSync({
      '003.jpg': strToU8('third'),
    })], 'book.cbz', { type: 'application/zip' }))
    const run = createBatchTranslationRun({
      directoryHandle: directory.handle,
      folderLabel: 'samples',
      items: [firstImage, secondImage, archive],
      translationOptions: {
        includeArchives: true,
        selectedItemIds: [secondImage.id, archive.id],
        skipExisting: true,
      },
    })

    const labels: string[] = []
    for await (const event of run?.events ?? []) {
      if (event.type === 'task') labels.push(event.task.label)
    }
    expect(labels).toEqual(['002.jpg', 'book.cbz / 003.jpg'])
  })
})
