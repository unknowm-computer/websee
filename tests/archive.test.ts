import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  extractArchiveEntry,
  loadArchiveIndex,
  loadSelectedFiles,
} from '@/services/mediaSources'
import { sortMediaItems } from '@/utils/media'

function replaceBytes(source: Uint8Array, target: Uint8Array, replacement: Uint8Array): Uint8Array {
  expect(replacement).toHaveLength(target.length)
  const result = source.slice()

  for (let offset = 0; offset <= result.length - target.length; offset += 1) {
    if (!target.every((byte, index) => result[offset + index] === byte)) continue
    result.set(replacement, offset)
    offset += target.length - 1
  }

  return result
}

describe('archive sources', () => {
  it('keeps archives beside images without opening archive contents', () => {
    const image = new File([strToU8('image')], '01.jpg', { type: 'image/jpeg' })
    const archive = new File([strToU8('not opened')], '02.cbz', { type: 'application/zip' })
    const rarArchive = new File([strToU8('not opened')], '03.cbr', { type: 'application/vnd.rar' })
    const text = new File([strToU8('memo')], 'notes.txt', { type: 'text/plain' })

    const collection = loadSelectedFiles([image, archive, rarArchive, text])

    expect(collection.items.map((item) => [item.name, item.kind])).toEqual([
      ['01.jpg', 'image'],
      ['02.cbz', 'archive'],
      ['03.cbr', 'archive'],
      ['notes.txt', 'text'],
    ])
  })

  it('indexes supported image and text metadata, then extracts only the selected entry', async () => {
    const archiveBytes = zipSync({
      'chapter/10.jpg': strToU8('ten'),
      'chapter/2.jpg': strToU8('two'),
      'chapter/1.jpg': strToU8('one'),
      'chapter/readme.txt': strToU8('ignore'),
    })
    const archive = new File([archiveBytes], 'sample.cbz', { type: 'application/zip' })

    const index = await loadArchiveIndex(archive)
    const sortedItems = sortMediaItems(index.items, 'name', true)
    const names = sortedItems.map((item) => item.name)

    expect(index.archiveFile).toBe(archive)
    expect(index.format).toBe('zip')
    expect(index.tree.children[0]).toMatchObject({
      kind: 'folder',
      name: 'chapter',
      directCount: 4,
    })
    expect(index.items.map((item) => item.kind)).toEqual([
      'archive-entry',
      'archive-entry',
      'archive-entry',
      'archive-text-entry',
    ])
    expect(index.items.every((item) => item.file === archive)).toBe(true)
    expect(names).toEqual(['1.jpg', '2.jpg', '10.jpg', 'readme.txt'])

    const extracted = await extractArchiveEntry(index, sortedItems[1])
    expect(extracted.name).toBe('2.jpg')
    expect(new TextDecoder().decode(await extracted.arrayBuffer())).toBe('two')

    const extractedText = await extractArchiveEntry(index, sortedItems[3])
    expect(extractedText.name).toBe('readme.txt')
    expect(extractedText.type).toBe('text/plain')
    expect(new TextDecoder().decode(await extractedText.arrayBuffer())).toBe('ignore')
  })

  it('decodes legacy CP949 Korean entry names and still extracts the selected image', async () => {
    const placeholderName = '1234.jpg'
    const cp949KoreanName = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb, 0x2e, 0x6a, 0x70, 0x67])
    const archiveBytes = replaceBytes(
      zipSync({ [placeholderName]: strToU8('korean image') }),
      strToU8(placeholderName),
      cp949KoreanName,
    )
    const archive = new File([archiveBytes], 'legacy-korean.zip', { type: 'application/zip' })

    const index = await loadArchiveIndex(archive)

    expect(index.items).toHaveLength(1)
    expect(index.items[0]).toMatchObject({
      name: '한글.jpg',
      path: '한글.jpg',
      format: 'JPEG',
    })

    const extracted = await extractArchiveEntry(index, index.items[0])
    expect(extracted.name).toBe('한글.jpg')
    expect(new TextDecoder().decode(await extracted.arrayBuffer())).toBe('korean image')
  })

  it('filters macOS AppleDouble metadata from archive image lists', async () => {
    const archiveBytes = zipSync({
      'photo.jpg': strToU8('image'),
      '__MACOSX/._photo.jpg': strToU8('appledouble'),
      '.AppleDouble/cover.png': strToU8('appledouble directory'),
      'chapter/._page.png': strToU8('appledouble file'),
      '.DS_Store': strToU8('finder metadata'),
    })
    const archive = new File([archiveBytes], 'macos.zip', { type: 'application/zip' })

    const index = await loadArchiveIndex(archive)

    expect(index.items.map((item) => item.path)).toEqual(['photo.jpg'])
  })

  it('reports nested archives when no directly supported media exists', async () => {
    const nestedArchiveBytes = zipSync({
      'page.jpg': strToU8('image'),
    })
    const archiveBytes = zipSync({
      'zz/IMG_5.zip': nestedArchiveBytes,
    })
    const archive = new File([archiveBytes], 'zz.zip', { type: 'application/zip' })

    const index = await loadArchiveIndex(archive)

    expect(index.items).toHaveLength(0)
    expect(index.nestedArchivePaths).toEqual(['zz/IMG_5.zip'])
  })
})
