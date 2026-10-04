import { describe, expect, it } from 'vitest'

import { encodeLegacyText, TextEncodingError } from '@/services/legacyTextEncoding'

describe('legacy text encoding', () => {
  it('encodes Korean CP949, including Hangul outside the EUC-KR subset', () => {
    expect([...encodeLegacyText('한글 뷁 힣', 'CP949')]).toEqual([
      0xc7, 0xd1, 0xb1, 0xdb, 0x20, 0x94, 0xee, 0x20, 0xc6, 0x52,
    ])
  })

  it('encodes the reported Japanese text back to its Shift-JIS bytes', () => {
    expect([...encodeLegacyText('繁華街を抜け、郊外に入り、さらに奥に進み、山道を走', 'Shift-JIS')]).toEqual([
      0x94, 0xc9, 0x89, 0xd8, 0x8a, 0x58, 0x82, 0xf0, 0x94, 0xb2,
      0x82, 0xaf, 0x81, 0x41, 0x8d, 0x78, 0x8a, 0x4f, 0x82, 0xc9,
      0x93, 0xfc, 0x82, 0xe8, 0x81, 0x41, 0x82, 0xb3, 0x82, 0xe7,
      0x82, 0xc9, 0x89, 0x9c, 0x82, 0xc9, 0x90, 0x69, 0x82, 0xdd,
      0x81, 0x41, 0x8e, 0x52, 0x93, 0xb9, 0x82, 0xf0, 0x91, 0x96,
    ])
  })

  it('encodes EUC-JP with its half-width katakana prefix', () => {
    expect([...encodeLegacyText('こんにちは ｱ', 'EUC-JP')]).toEqual([
      0xa4, 0xb3, 0xa4, 0xf3, 0xa4, 0xcb, 0xa4, 0xc1, 0xa4, 0xcf, 0x20, 0x8e, 0xb1,
    ])
  })

  it.each(['CP949', 'Shift-JIS', 'EUC-JP'] as const)('preserves ASCII, actual question marks and line endings in %s', (encoding) => {
    const text = 'Hello?\r\nA\nB\rC\u0000'
    expect(encodeLegacyText(text, encoding)).toEqual(new TextEncoder().encode(text))
    expect(encodeLegacyText('', encoding)).toEqual(new Uint8Array())
  })

  it.each(['CP949', 'Shift-JIS', 'EUC-JP'] as const)('rejects emoji instead of silently replacing it in %s', (encoding) => {
    expect(() => encodeLegacyText('abc 😀 xyz', encoding)).toThrow(TextEncodingError)
    expect(() => encodeLegacyText('abc 😀 xyz', encoding)).toThrow('"😀" (U+1F600)')
  })

  it('rejects Korean text when Shift-JIS cannot represent it', () => {
    expect(() => encodeLegacyText('日本語 한글', 'Shift-JIS')).toThrow('"한" (U+D55C)')
  })

  it('rejects lossy Shift-JIS aliases such as yen becoming a backslash', () => {
    expect(() => encodeLegacyText('¥100', 'Shift-JIS')).toThrow('"¥" (U+00A5)')
    expect([...encodeLegacyText('\\100', 'Shift-JIS')]).toEqual([0x5c, 0x31, 0x30, 0x30])
  })

  it('reports distinct unsupported characters, with a short maximum list', () => {
    try {
      encodeLegacyText('😀😀😃😄😁😆😅😂', 'CP949')
      throw new Error('Expected conversion to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(TextEncodingError)
      if (!(error instanceof TextEncodingError)) throw error
      expect(error.encoding).toBe('CP949')
      expect(error.characters).toEqual(['😀', '😃', '😄', '😁', '😆'])
      expect(error.message).toContain('UTF-8')
    }
  })

  it('rejects unpaired surrogates instead of dropping them', () => {
    expect(() => encodeLegacyText('a\ud800b', 'CP949')).toThrow('U+D800')
  })
})
