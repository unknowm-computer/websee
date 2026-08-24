import { describe, expect, it } from 'vitest'

import {
  deleteAllTranslationSidecars,
  deleteOrphanedTranslationSidecars,
  scanTranslationSidecars,
} from '@/services/imageTranslation/translationSidecarManagement'

interface FakeFileRecord {
  text: string
}

interface FakeDirectory {
  addDirectory(name: string): FakeDirectory
  addFile(name: string, text: string): void
  directories: Map<string, FakeDirectory>
  files: Map<string, FakeFileRecord>
  handle: FileSystemDirectoryHandle
}

function createFakeDirectory(name = 'root'): FakeDirectory {
  const directories = new Map<string, FakeDirectory>()
  const files = new Map<string, FakeFileRecord>()
  const fakeDirectory = {} as FakeDirectory
  const createFileHandle = (
    fileName: string,
    record: FakeFileRecord,
  ): FileSystemFileHandle => ({
    kind: 'file',
    name: fileName,
    async getFile() {
      return new File([record.text], fileName, { type: 'application/json' })
    },
  }) as FileSystemFileHandle
  const handle = {
    kind: 'directory',
    name,
    async *entries() {
      for (const [entryName, directory] of directories) {
        yield [entryName, directory.handle] as const
      }
      for (const [entryName, record] of files) {
        yield [entryName, createFileHandle(entryName, record)] as const
      }
    },
    async getDirectoryHandle(childName: string, options?: FileSystemGetDirectoryOptions) {
      const existing = directories.get(childName)
      if (existing) return existing.handle
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError')
      return fakeDirectory.addDirectory(childName).handle
    },
    async getFileHandle(fileName: string, options?: FileSystemGetFileOptions) {
      let record = files.get(fileName)
      if (!record && !options?.create) throw new DOMException('Not found', 'NotFoundError')
      if (!record) {
        record = { text: '' }
        files.set(fileName, record)
      }
      return createFileHandle(fileName, record)
    },
    async removeEntry(entryName: string, options?: FileSystemRemoveOptions) {
      if (files.delete(entryName)) return
      const directory = directories.get(entryName)
      if (!directory) throw new DOMException('Not found', 'NotFoundError')
      if (!options?.recursive && (directory.files.size || directory.directories.size)) {
        throw new DOMException('Directory is not empty', 'InvalidModificationError')
      }
      directories.delete(entryName)
    },
  } as unknown as FileSystemDirectoryHandle

  Object.assign(fakeDirectory, {
    directories,
    files,
    handle,
    addDirectory(childName: string): FakeDirectory {
      const directory = createFakeDirectory(childName)
      directories.set(childName, directory)
      return directory
    },
    addFile(fileName: string, text: string): void {
      files.set(fileName, { text })
    },
  })
  return fakeDirectory
}

function createDirectoryWithTranslationData(): FakeDirectory {
  const directory = createFakeDirectory()
  directory.addFile('001.jpg', 'image')
  directory.addFile('book.cbz', 'archive')
  const storage = directory.addDirectory('.websee')
  storage.addFile('001.jpg.json', 'valid-image')
  storage.addFile('book.cbz.json', 'valid-archive')
  storage.addFile('missing.png.json', 'orphan')
  storage.addFile('notes.tmp', 'not-managed')
  return directory
}

describe('translation sidecar management', () => {
  it('counts JSON sidecars, bytes, and sidecars without source files', async () => {
    const directory = createDirectoryWithTranslationData()

    await expect(scanTranslationSidecars(directory.handle)).resolves.toEqual({
      fileCount: 3,
      orphanBytes: 6,
      orphanCount: 1,
      totalBytes: 30,
    })
  })

  it('returns an empty summary when the storage directory does not exist', async () => {
    const directory = createFakeDirectory()

    await expect(scanTranslationSidecars(directory.handle)).resolves.toEqual({
      fileCount: 0,
      orphanBytes: 0,
      orphanCount: 0,
      totalBytes: 0,
    })
  })

  it('deletes only JSON sidecars whose source file no longer exists', async () => {
    const directory = createDirectoryWithTranslationData()

    await expect(deleteOrphanedTranslationSidecars(directory.handle)).resolves.toBe(1)

    const storage = directory.directories.get('.websee')
    expect(storage?.files.has('missing.png.json')).toBe(false)
    expect(storage?.files.has('001.jpg.json')).toBe(true)
    expect(storage?.files.has('book.cbz.json')).toBe(true)
    expect(storage?.files.has('notes.tmp')).toBe(true)
  })

  it('deletes the current directory storage recursively', async () => {
    const directory = createDirectoryWithTranslationData()

    await deleteAllTranslationSidecars(directory.handle)

    expect(directory.directories.has('.websee')).toBe(false)
    await expect(deleteAllTranslationSidecars(directory.handle)).resolves.toBeUndefined()
  })
})
