import { describe, expect, it, vi } from 'vitest'

import { decodeTextBytes, encodeTextFile, writeTextFile } from '@/services/textFile'

describe('text file decoding', () => {
  it('decodes UTF-8 text and removes its BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('한글 메모')])

    expect(decodeTextBytes(bytes)).toEqual({
      encoding: 'UTF-8',
      text: '한글 메모',
    })
  })

  it('decodes UTF-16 little-endian text with a BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00])

    expect(decodeTextBytes(bytes)).toEqual({
      encoding: 'UTF-16 LE',
      text: 'AB',
    })
  })

  it('falls back to CP949 when the bytes are not valid UTF-8', () => {
    const bytes = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb])

    expect(decodeTextBytes(bytes)).toEqual({
      encoding: 'CP949',
      text: '한글',
    })
  })

  it('preserves UTF-16 byte order and BOM when encoding edited text', () => {
    expect([...encodeTextFile('AB', 'UTF-16 LE').bytes]).toEqual([
      0xff, 0xfe, 0x41, 0x00, 0x42, 0x00,
    ])
    expect([...encodeTextFile('AB', 'UTF-16 BE').bytes]).toEqual([
      0xfe, 0xff, 0x00, 0x41, 0x00, 0x42,
    ])
  })

  it('converts CP949 source text to UTF-8 when saving', () => {
    const encoded = encodeTextFile('한글', 'CP949')

    expect(encoded.encoding).toBe('UTF-8')
    expect(new TextDecoder().decode(encoded.bytes)).toBe('한글')
  })

  it('writes encoded bytes and returns the refreshed file', async () => {
    const savedFile = new File(['수정됨'], 'sample.srt', { lastModified: 123 })
    let writtenBytes: Uint8Array | undefined
    const write = vi.fn(async (bytes: Uint8Array) => {
      writtenBytes = bytes
    })
    const close = vi.fn(async () => undefined)
    const fileHandle = {
      createWritable: vi.fn(async () => ({ write, close })),
      getFile: vi.fn(async () => savedFile),
    } as unknown as FileSystemFileHandle

    const result = await writeTextFile(fileHandle, '수정됨', 'UTF-8')

    expect(write).toHaveBeenCalledOnce()
    expect(writtenBytes).toBeInstanceOf(Uint8Array)
    if (!writtenBytes) throw new Error('Expected encoded bytes to be written.')
    expect(new TextDecoder().decode(writtenBytes)).toBe('수정됨')
    expect(close).toHaveBeenCalledOnce()
    expect(result).toEqual({ encoding: 'UTF-8', file: savedFile })
  })
})
