import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { createSevenZipReader } from '@/services/sevenZipReader'

async function openFixture(name: string) {
  const [archive, wasm] = await Promise.all([
    readFile(new URL(`./fixtures/${name}.7z`, import.meta.url)),
    readFile(new URL('../node_modules/libarchive.js/dist/libarchive.wasm', import.meta.url)),
  ])
  return createSevenZipReader(new File([archive], `${name}.7z`), Uint8Array.from(wasm).buffer)
}

describe('7z reader', () => {
  it('lists Unicode names and reads entries of a solid block in either direction', async () => {
    const reader = await openFixture('solid-pages')
    const entries = reader.list()
    expect(entries.map(entry => entry.path)).toEqual(['노트.txt', '하위/페이지.svg'])
    const [note, page] = entries
    const decode = (index: number): string => new TextDecoder().decode(reader.extract(index))
    expect(decode(note.index)).toBe('안녕 7z')
    expect(decode(page.index)).toContain('BLUE MOUNTAIN')
    expect(decode(note.index)).toBe('안녕 7z')
  })

  it.each(['encrypted-pages', 'encrypted-headers'])('rejects %s', async name => {
    const reader = await openFixture(name)
    expect(() => reader.list()).toThrow(/encrypted/i)
  })

  it('rejects a file with an unrelated signature', async () => {
    await expect(createSevenZipReader(new File(['PK'], 'invalid.7z'))).rejects.toThrow(/7z/)
  })
})
