import { describe, expect, it } from 'vitest'

import type { MediaItem } from '@/types/media'
import {
  buildDirectoryTree,
  formatBytes,
  getFileFormat,
  isArchiveFileName,
  isImageFileName,
  isSupportedMediaFileName,
  isTextFileName,
  naturalCompare,
  sortMediaItems,
} from '@/utils/media'

function mediaItem(name: string, path: string, size = 100): MediaItem {
  return {
    id: path,
    kind: isArchiveFileName(name) ? 'archive' : isTextFileName(name) ? 'text' : 'image',
    name,
    path,
    directoryPath: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
    file: {} as File,
    size,
    format: getFileFormat(name),
    lastModified: size,
  }
}

function folderItem(name: string, path: string): MediaItem {
  return {
    id: `folder:${path}`,
    kind: 'folder',
    name,
    path,
    directoryPath: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
    file: {} as File,
    size: 0,
    format: '폴더',
    lastModified: 0,
    navigationPath: path,
  }
}

describe('media utilities', () => {
  it('recognizes supported images, text files, and archives case-insensitively', () => {
    expect(isImageFileName('photo.JPG')).toBe(true)
    expect(isImageFileName('notes.txt')).toBe(false)
    expect(isTextFileName('notes.TXT')).toBe(true)
    expect(isTextFileName('notes.TEXT')).toBe(true)
    expect(isTextFileName('data.JSON')).toBe(true)
    expect(isTextFileName('subtitle.SRT')).toBe(true)
    expect(isTextFileName('subtitle.SMI')).toBe(true)
    expect(isTextFileName('notes.md')).toBe(false)
    expect(isSupportedMediaFileName('notes.txt')).toBe(true)
    expect(isSupportedMediaFileName('notes.text')).toBe(true)
    expect(isArchiveFileName('comic.CBZ')).toBe(true)
    expect(isArchiveFileName('comic.rar')).toBe(true)
    expect(isArchiveFileName('comic.CBR')).toBe(true)
    expect(isArchiveFileName('comic.7z')).toBe(false)
  })

  it('sorts numbered file names naturally', () => {
    const names = ['10.jpg', '2.jpg', '1.jpg']
    expect(names.sort(naturalCompare)).toEqual(['1.jpg', '2.jpg', '10.jpg'])
  })

  it('sorts by size and uses names as a stable secondary key', () => {
    const items = [
      mediaItem('10.jpg', '10.jpg', 200),
      mediaItem('2.jpg', '2.jpg', 100),
      mediaItem('1.jpg', '1.jpg', 100),
    ]

    expect(sortMediaItems(items, 'size', true).map((item) => item.name)).toEqual([
      '1.jpg',
      '2.jpg',
      '10.jpg',
    ])
  })

  it('keeps folders before files in both sort directions', () => {
    const items = [mediaItem('1.jpg', '1.jpg'), folderItem('pages', 'pages')]

    expect(sortMediaItems(items, 'name', true).map((item) => item.name)).toEqual([
      'pages',
      '1.jpg',
    ])
    expect(sortMediaItems(items, 'name', false).map((item) => item.name)).toEqual([
      'pages',
      '1.jpg',
    ])
  })

  it('builds nested directories with direct and total image counts', () => {
    const tree = buildDirectoryTree('sample.zip', [
      mediaItem('cover.jpg', 'cover.jpg'),
      mediaItem('1.jpg', 'chapter-1/1.jpg'),
      mediaItem('2.jpg', 'chapter-1/pages/2.jpg'),
    ])

    expect(tree.directCount).toBe(1)
    expect(tree).toMatchObject({ id: 'folder:', kind: 'folder' })
    expect(tree.children[0]).toMatchObject({
      id: 'folder:chapter-1',
      kind: 'folder',
      name: 'chapter-1',
      directCount: 1,
    })
    expect(tree.children[0].children[0]).toMatchObject({
      id: 'folder:chapter-1/pages',
      kind: 'folder',
      name: 'pages',
      directCount: 1,
    })
  })

  it('adds archive files to their physical folder in the navigation tree', () => {
    const tree = buildDirectoryTree('library', [
      mediaItem('cover.jpg', 'books/cover.jpg'),
      mediaItem('chapter.cbz', 'books/chapter.cbz'),
    ])

    expect(tree.children[0].children[0]).toMatchObject({
      kind: 'archive',
      name: 'chapter.cbz',
      path: 'books/chapter.cbz',
      indexed: false,
    })
  })

  it('formats compact file information', () => {
    expect(getFileFormat('photo.jpg')).toBe('JPEG')
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(2048)).toBe('2.00 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB')
  })
})
