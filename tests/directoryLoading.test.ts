import { describe, expect, it, vi } from 'vitest'

import { loadDirectoryHandle, loadDirectoryLevel } from '@/services/mediaSources'

interface FakeEntry {
  kind: 'file' | 'directory'
  getFile?: ReturnType<typeof vi.fn>
  entries?: () => AsyncGenerator<[string, FakeEntry]>
}

function createFileHandle(name: string): FakeEntry {
  return {
    kind: 'file',
    getFile: vi.fn(async () => new File(['image'], name, { type: 'image/jpeg' })),
  }
}

function createDirectoryHandle(entries: Array<[string, FakeEntry]>): FakeEntry {
  return {
    kind: 'directory',
    entries: async function* () {
      yield* entries
    },
  }
}

function asDirectoryHandle(entry: FakeEntry): FileSystemDirectoryHandle {
  return entry as unknown as FileSystemDirectoryHandle
}

describe('directory lazy loading', () => {
  it('loads only the root level when opening a directory', async () => {
    const nestedImage = createFileHandle('nested.jpg')
    const childDirectory = createDirectoryHandle([['nested.jpg', nestedImage]])
    const rootImage = createFileHandle('root.jpg')
    const rootDirectory = createDirectoryHandle([
      ['child', childDirectory],
      ['root.jpg', rootImage],
    ])

    const loaded = await loadDirectoryHandle(asDirectoryHandle(rootDirectory))

    expect(loaded.collection.items.map((item) => item.path)).toEqual(['root.jpg'])
    expect(loaded.collection.tree.children.map((node) => node.path)).toEqual(['child'])
    expect(loaded.collection.tree.children[0].loaded).toBe(false)
    expect(nestedImage.getFile).not.toHaveBeenCalled()
  })

  it('loads a child directory only when that level is requested', async () => {
    const nestedImage = createFileHandle('nested.jpg')
    const grandchild = createDirectoryHandle([])
    const childDirectory = createDirectoryHandle([
      ['grandchild', grandchild],
      ['nested.jpg', nestedImage],
    ])

    const level = await loadDirectoryLevel(asDirectoryHandle(childDirectory), 'child')

    expect(level.items.map((item) => item.path)).toEqual(['child/nested.jpg'])
    expect(level.children.map((node) => node.path)).toEqual(['child/grandchild'])
    expect(nestedImage.getFile).toHaveBeenCalledOnce()
  })

  it('hides the internal translation sidecar directory', async () => {
    const sidecarDirectory = createDirectoryHandle([])
    const image = createFileHandle('root.jpg')
    const rootDirectory = createDirectoryHandle([
      ['.websee', sidecarDirectory],
      ['root.jpg', image],
    ])

    const loaded = await loadDirectoryHandle(asDirectoryHandle(rootDirectory))

    expect(loaded.collection.tree.children).toEqual([])
    expect(loaded.handles.has('.websee')).toBe(false)
    expect(loaded.collection.items.map((item) => item.name)).toEqual(['root.jpg'])
  })
})
