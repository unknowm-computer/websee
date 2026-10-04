import { describe, expect, it, vi } from 'vitest'

import {
  decodeTextBytes,
  encodeTextFile,
  readTextFile,
  TEXT_PREVIEW_MAX_BYTES,
  TEXT_VIEWER_MAX_BYTES,
  writeTextFile,
  TextFileSaveError,
} from '@/services/textFile'

function createMemoryFileHandle(initialFile: File): {
  handle: FileSystemFileHandle
  createWritable: ReturnType<typeof vi.fn>
} {
  let file = initialFile
  const createWritable = vi.fn(async () => ({
    write: async (bytes: Uint8Array): Promise<void> => {
      file = new File([bytes], file.name)
    },
    close: async (): Promise<void> => undefined,
  }))
  return {
    handle: { createWritable, getFile: async () => file } as unknown as FileSystemFileHandle,
    createWritable,
  }
}

// Original Shift-JIS bytes that previously appeared as "붖됗둢귩뵴궚갂…" in Chrome.
const japaneseText = '繁華街を抜け、郊外に入り、さらに奥に進み、山道を走'
const japaneseBytes = Uint8Array.from([
  0x94, 0xc9, 0x89, 0xd8, 0x8a, 0x58, 0x82, 0xf0, 0x94, 0xb2,
  0x82, 0xaf, 0x81, 0x41, 0x8d, 0x78, 0x8a, 0x4f, 0x82, 0xc9,
  0x93, 0xfc, 0x82, 0xe8, 0x81, 0x41, 0x82, 0xb3, 0x82, 0xe7,
  0x82, 0xc9, 0x89, 0x9c, 0x82, 0xc9, 0x90, 0x69, 0x82, 0xdd,
  0x81, 0x41, 0x8e, 0x52, 0x93, 0xb9, 0x82, 0xf0, 0x91, 0x96,
])

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

  it('recognizes the reported Japanese Shift-JIS text instead of CP949', () => {
    expect(decodeTextBytes(japaneseBytes)).toEqual({
      encoding: 'Shift-JIS',
      text: japaneseText,
    })
  })

  it('recognizes EUC-JP Japanese text', () => {
    const bytes = new Uint8Array([0xa4, 0xb3, 0xa4, 0xf3, 0xa4, 0xcb, 0xa4, 0xc1, 0xa4, 0xcf])
    expect(decodeTextBytes(bytes)).toEqual({ encoding: 'EUC-JP', text: 'こんにちは' })
  })

  it('detects Japanese after an ASCII header longer than the detection sample', async () => {
    const header = '; header\n'.repeat(10_000)
    const file = new File([header, japaneseBytes], 'script.txt')
    expect(await readTextFile(file, TEXT_VIEWER_MAX_BYTES)).toMatchObject({
      encoding: 'Shift-JIS', text: header + japaneseText, truncated: false,
    })
  })

  it('keeps Korean CP949 sentences instead of interpreting them as Japanese', () => {
    const bytes = Uint8Array.from([
      0xc7, 0xd1, 0xb1, 0xdb, 0x20, 0xb8, 0xde, 0xb8, 0xf0, 0xc0, 0xd4,
      0xb4, 0xcf, 0xb4, 0xd9, 0x2e, 0x20, 0xbe, 0xc8, 0xb3, 0xe7, 0xc7,
      0xcf, 0xbc, 0xbc, 0xbf, 0xe4, 0x2e,
    ])
    expect(decodeTextBytes(bytes)).toEqual({
      encoding: 'CP949', text: '한글 메모입니다. 안녕하세요.',
    })
  })

  it('allows manual encoding selection for ambiguous bytes', () => {
    // These bytes are both valid CP949 (Korean jamo) and EUC-JP (hiragana).
    const bytes = new Uint8Array([0xa4, 0xa1, 0xa4, 0xa4])
    expect(decodeTextBytes(bytes, 'CP949')).toEqual({ encoding: 'CP949', text: 'ㄱㄴ' })
    expect(decodeTextBytes(bytes, 'EUC-JP')).toEqual({ encoding: 'EUC-JP', text: 'ぁい' })
  })

  it.each(['UTF-16 LE', 'UTF-16 BE'] as const)('recognizes BOM-less %s with ASCII text', async (encoding) => {
    const bytes = (await encodeTextFile('AB\nHello', encoding)).bytes.subarray(2)
    expect(decodeTextBytes(bytes)).toEqual({ encoding, text: 'AB\nHello' })
  })

  it.each([TEXT_PREVIEW_MAX_BYTES, TEXT_VIEWER_MAX_BYTES])(
    'preserves UTF-8 when a %i-byte limit splits a Korean character',
    async (limit) => {
      const file = new File(['가'.repeat(Math.ceil(limit / 3) + 1)], 'large.txt')
      const result = await readTextFile(file, limit)
      expect(result.encoding).toBe('UTF-8')
      expect(result.truncated).toBe(true)
      expect(result.text).toBe('가'.repeat(Math.floor(limit / 3)))
    },
  )

  it('discards only the incomplete trailing Shift-JIS character in a preview', async () => {
    const result = await readTextFile(new File([japaneseBytes], 'japanese.txt'), japaneseBytes.length - 1)
    expect(result).toMatchObject({ encoding: 'Shift-JIS', text: japaneseText.slice(0, -1), truncated: true })
  })

  it('re-reads the original file bytes when a different encoding is selected', async () => {
    const file = new File([japaneseBytes], 'japanese.txt')
    const incorrect = await readTextFile(file, TEXT_VIEWER_MAX_BYTES, 'CP949')
    const corrected = await readTextFile(file, TEXT_VIEWER_MAX_BYTES, 'Shift-JIS')
    expect(incorrect.text).not.toBe(japaneseText)
    expect(corrected).toMatchObject({ encoding: 'Shift-JIS', text: japaneseText, truncated: false })
  })

  it('retains the UTF-8 BOM decision when truncated inside the last character', async () => {
    const file = new File([new Uint8Array([0xef, 0xbb, 0xbf]), '한글'], 'utf8.txt')
    expect(await readTextFile(file, 8)).toMatchObject({ encoding: 'UTF-8', text: '한', truncated: true })
  })

  it('does not drop a malformed trailing byte in a complete file', () => {
    expect(decodeTextBytes(new Uint8Array([0x41, 0xe3]), 'UTF-8').text).toBe('A\ufffd')
  })

  it('preserves UTF-16 byte order and BOM when encoding edited text', async () => {
    expect([...(await encodeTextFile('AB', 'UTF-16 LE')).bytes]).toEqual([
      0xff, 0xfe, 0x41, 0x00, 0x42, 0x00,
    ])
    expect([...(await encodeTextFile('AB', 'UTF-16 BE')).bytes]).toEqual([
      0xfe, 0xff, 0x00, 0x41, 0x00, 0x42,
    ])
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

    const source = await readTextFile(new File(['원문'], 'sample.srt'), TEXT_VIEWER_MAX_BYTES)
    const result = await writeTextFile(fileHandle, '수정됨', source)

    expect(write).toHaveBeenCalledOnce()
    expect(writtenBytes).toBeInstanceOf(Uint8Array)
    if (!writtenBytes) throw new Error('Expected encoded bytes to be written.')
    expect(new TextDecoder().decode(writtenBytes)).toBe('수정됨')
    expect(close).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ encoding: 'UTF-8', file: savedFile })
    expect(result.content.text).toBe('수정됨')
    expect(result.content.bytes).toEqual(writtenBytes)
  })
})

describe('text file save format', () => {
  it.each([
    ['CP949', '한글'],
    ['Shift-JIS', japaneseText],
    ['EUC-JP', 'こんにちは'],
  ] as const)('keeps %s and CRLF when auto-saving edited text', async (encoding, text) => {
    const original = await encodeTextFile(`${text}\r\nsecond\r\n`, encoding)
    const file = new File([original.bytes], 'sample.txt')
    const source = await readTextFile(file, TEXT_VIEWER_MAX_BYTES)
    expect(source.encoding).toBe(encoding)
    const { handle } = createMemoryFileHandle(file)
    const saved = await writeTextFile(handle, `${text}!\nsecond\nnew`, source, 'auto')
    expect(saved.encoding).toBe(encoding)
    expect(saved.content.text).toBe(`${text}!\r\nsecond\r\nnew`)
    expect(saved.content.bytes).toEqual((await encodeTextFile(saved.content.text, encoding)).bytes)
    expect(saved.content.truncated).toBe(false)
  })

  it.each(['UTF-8', 'UTF-16 LE', 'UTF-16 BE'] as const)(
    'preserves presence or absence of BOM when editing %s', async (encoding) => {
      for (const bom of [true, false]) {
        const original = await encodeTextFile('first\r\nsecond', encoding, bom)
        const file = new File([original.bytes], 'sample.txt')
        const source = await readTextFile(file, TEXT_VIEWER_MAX_BYTES)
        const { handle } = createMemoryFileHandle(file)
        const saved = await writeTextFile(handle, 'changed\nsecond', source)
        expect(saved.content.bytes).toEqual((await encodeTextFile('changed\r\nsecond', encoding, bom)).bytes)
      }
    },
  )

  it('converts a Japanese file to UTF-8 only when explicitly selected', async () => {
    const file = new File([japaneseBytes, '\r\n'], 'sample.txt')
    const source = await readTextFile(file, TEXT_VIEWER_MAX_BYTES)
    const { handle } = createMemoryFileHandle(file)
    const saved = await writeTextFile(handle, `${japaneseText}\n`, source, 'UTF-8')
    expect(saved.encoding).toBe('UTF-8')
    expect(saved.content.bytes).toEqual(new TextEncoder().encode(`${japaneseText}\r\n`))
    // Source metadata remains available if this was Save As rather than an overwrite.
    expect(source.encoding).toBe('Shift-JIS')
  })

  it.each(['CP949', 'Shift-JIS', 'EUC-JP', 'UTF-16 LE', 'UTF-16 BE'] as const)(
    'converts Unicode text to the selected %s format', async (encoding) => {
      const text = encoding === 'CP949' ? '한글' : '日本語'
      const file = new File([`${text}\n`], 'sample.txt')
      const source = await readTextFile(file, TEXT_VIEWER_MAX_BYTES)
      const { handle } = createMemoryFileHandle(file)
      const saved = await writeTextFile(handle, `${text}\n`, source, encoding)
      expect(saved.encoding).toBe(encoding)
      expect(saved.content.bytes).toEqual((await encodeTextFile(`${text}\n`, encoding)).bytes)
    },
  )

  it('keeps exact original bytes when normalized editor content is unchanged', async () => {
    // Shift-JIS has multiple byte sequences for some characters (e.g. 纊).
    const original = Uint8Array.of(0xfa, 0x5c, 0x0d, 0x0a, 0x41, 0x0a, 0x42)
    const file = new File([original], 'sample.txt')
    const source = await readTextFile(file, TEXT_VIEWER_MAX_BYTES, 'Shift-JIS')
    const { handle } = createMemoryFileHandle(file)
    const saved = await writeTextFile(handle, source.text.replace(/\r\n/g, '\n'), source)
    expect(saved.content.bytes).toEqual(original)
  })

  it.each(['CP949', 'Shift-JIS', 'EUC-JP'] as const)(
    'rejects an unrepresentable character before opening the writable stream for %s', async (encoding) => {
      const file = new File(['abc'], 'sample.txt')
      const source = await readTextFile(file, TEXT_VIEWER_MAX_BYTES, encoding)
      const { handle, createWritable } = createMemoryFileHandle(file)
      await expect(writeTextFile(handle, 'abc 😀', source)).rejects.toThrow(TextFileSaveError)
      expect(createWritable).not.toHaveBeenCalled()
      expect(await (await handle.getFile()).text()).toBe('abc')
    },
  )

  it('rejects saving partially loaded content without touching the destination', async () => {
    const file = new File(['abcdef'], 'large.txt')
    const source = await readTextFile(file, 3)
    const { handle, createWritable } = createMemoryFileHandle(file)
    await expect(writeTextFile(handle, 'changed', source)).rejects.toThrow('일부만 읽은 파일')
    expect(createWritable).not.toHaveBeenCalled()
  })

  it('does not overwrite malformed source bytes with replacement characters after editing', async () => {
    const original = Uint8Array.of(0xef, 0xbb, 0xbf, 0x41, 0xff)
    const file = new File([original], 'invalid.txt')
    const source = await readTextFile(file, TEXT_VIEWER_MAX_BYTES)
    const { handle, createWritable } = createMemoryFileHandle(file)
    expect(source.text).toBe('A\ufffd')
    await expect(writeTextFile(handle, `B${source.text}`, source)).rejects.toThrow('읽지 못한 문자')
    expect(createWritable).not.toHaveBeenCalled()
    // An unchanged copy can still preserve the original bytes exactly.
    const copy = await writeTextFile(handle, source.text, source)
    expect(copy.content.bytes).toEqual(original)
  })

  it('uses the newly saved encoding as the source for subsequent automatic saves', async () => {
    const file = new File([japaneseBytes], 'sample.txt')
    const source = await readTextFile(file, TEXT_VIEWER_MAX_BYTES)
    const { handle } = createMemoryFileHandle(file)
    const first = await writeTextFile(handle, japaneseText, source, 'UTF-8')
    const second = await writeTextFile(handle, `${japaneseText}!`, first.content, 'auto')
    expect(second.encoding).toBe('UTF-8')
    expect(second.content.bytes).toEqual(new TextEncoder().encode(`${japaneseText}!`))
  })
})
