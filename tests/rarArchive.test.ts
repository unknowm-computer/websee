import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { extractRarEntry, listRarEntries } from '@/services/rarArchive'

async function readArrayBuffer(url: URL): Promise<ArrayBuffer> {
  const buffer = await readFile(url)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

const wasmUrl = new URL('../node_modules/node-unrar-js/esm/js/unrar.wasm', import.meta.url)

describe('RAR decoder', () => {
  it('lists and extracts image entries from a RAR5 CBR', async () => {
    const [data, wasmBinary] = await Promise.all([
      readArrayBuffer(new URL('./fixtures/test-comic-rar5.cbr', import.meta.url)),
      readArrayBuffer(wasmUrl),
    ])

    const entries = await listRarEntries(data, wasmBinary)
    expect(entries.map((entry) => entry.path)).toEqual([
      'page_001.png',
      'page_002.png',
      'page_003.png',
      'ComicInfo.xml',
    ])

    const extracted = await extractRarEntry(data, 'page_002.png', wasmBinary)
    expect([...extracted.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })

  it('preserves Unicode paths while reading a RAR4 archive', async () => {
    const [data, wasmBinary] = await Promise.all([
      readArrayBuffer(new URL('./fixtures/folder-test-rar4.rar', import.meta.url)),
      readArrayBuffer(wasmUrl),
    ])

    const entries = await listRarEntries(data, wasmBinary)
    const unicodePath = 'Folder1/Folder 中文/2中文.txt'
    expect(entries.some((entry) => entry.path === unicodePath)).toBe(true)

    const extracted = await extractRarEntry(data, unicodePath, wasmBinary)
    expect(new TextDecoder().decode(extracted).replace(/^\uFEFF/, '')).toBe('中文中文')
  })
})
