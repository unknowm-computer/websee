import { describe, expect, it } from 'vitest'

import { decodeTextBytes } from '@/services/textFile'

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
})
