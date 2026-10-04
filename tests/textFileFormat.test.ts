import { describe, expect, it } from 'vitest'

import {
  detectTextFileBom,
  restoreTextLineEndings,
  shouldWriteTextFileBom,
} from '@/services/textFileFormat'

describe('text file BOM preservation', () => {
  it('recognizes complete UTF-8 and UTF-16 BOMs but not partial prefixes', () => {
    expect(detectTextFileBom(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41))).toBe('UTF-8')
    expect(detectTextFileBom(Uint8Array.of(0xff, 0xfe, 0x41, 0))).toBe('UTF-16 LE')
    expect(detectTextFileBom(Uint8Array.of(0xfe, 0xff, 0, 0x41))).toBe('UTF-16 BE')
    expect(detectTextFileBom(Uint8Array.of(0xef, 0xbb))).toBeNull()
    expect(detectTextFileBom(Uint8Array.of(0xff))).toBeNull()
    expect(detectTextFileBom(new Uint8Array())).toBeNull()
  })

  it.each(['UTF-8', 'UTF-16 LE', 'UTF-16 BE'] as const)(
    'keeps the existing BOM decision when saving %s in its original encoding',
    (encoding) => {
      expect(shouldWriteTextFileBom(encoding, encoding, encoding)).toBe(true)
      expect(shouldWriteTextFileBom(encoding, encoding, null)).toBe(false)
    },
  )

  it('uses target defaults only when converting to another encoding', () => {
    expect(shouldWriteTextFileBom('Shift-JIS', 'UTF-8', null)).toBe(false)
    expect(shouldWriteTextFileBom('UTF-8', 'UTF-16 LE', null)).toBe(true)
    expect(shouldWriteTextFileBom('UTF-16 LE', 'UTF-16 BE', null)).toBe(true)
    expect(shouldWriteTextFileBom('UTF-16 BE', 'UTF-8', 'UTF-16 BE')).toBe(false)
    expect(shouldWriteTextFileBom('UTF-8', 'CP949', 'UTF-8')).toBe(false)
  })
})

describe('text file line ending preservation', () => {
  it.each(['\r\n', '\n', '\r'])(
    'keeps uniform %j separators after editing and adding lines',
    (ending) => {
      expect(restoreTextLineEndings('edited\nsecond\nnew\n', `first${ending}second${ending}`))
        .toBe(`edited${ending}second${ending}new${ending}`)
    },
  )

  it('round-trips mixed original separators after the editor normalizes them', () => {
    expect(restoreTextLineEndings('one\ntwo\nthree\nfour', 'one\r\ntwo\nthree\rfour'))
      .toBe('one\r\ntwo\nthree\rfour')
  })

  it('preserves the separator of an edited line in a mixed file', () => {
    expect(restoreTextLineEndings('one\nchanged\nthree\nfour', 'one\r\ntwo\nthree\rfour'))
      .toBe('one\r\nchanged\nthree\rfour')
  })

  it('preserves existing separators when a line is inserted at the beginning', () => {
    expect(restoreTextLineEndings('new\none\ntwo\nthree\nfour', 'one\r\ntwo\nthree\rfour'))
      .toBe('new\r\none\r\ntwo\nthree\rfour')
  })

  it('preserves existing separators when the first line is deleted', () => {
    expect(restoreTextLineEndings('two\nthree\nfour', 'one\r\ntwo\nthree\rfour'))
      .toBe('two\nthree\rfour')
  })

  it('retains mixed separators around multiple insertions and deletions', () => {
    const original = 'heading\r\nremove\r\nkeep A\nkeep B\rkeep C\r\nfooter'
    const edited = 'heading\nkeep A\ninserted\nkeep B\nkeep C\nfooter\nappended'
    expect(restoreTextLineEndings(edited, original))
      .toBe('heading\r\nkeep A\ninserted\r\nkeep B\rkeep C\r\nfooter\r\nappended')
  })

  it('preserves repeated lines around a unique anchor', () => {
    const original = 'start\r\nrepeat\nrepeat\runique\r\nrepeat\nend'
    const edited = 'new\nstart\nrepeat\nrepeat\nunique\nrepeat\nend\nnew'
    expect(restoreTextLineEndings(edited, original))
      .toBe('new\r\nstart\r\nrepeat\nrepeat\runique\r\nrepeat\nend\r\nnew')
  })

  it('does not invent a trailing separator or prevent its removal', () => {
    expect(restoreTextLineEndings('one\nchanged', 'one\r\ntwo\r\n')).toBe('one\r\nchanged')
    expect(restoreTextLineEndings('', 'one\r\ntwo\n')).toBe('')
  })

  it('uses LF for new files without existing separators', () => {
    expect(restoreTextLineEndings('one\ntwo', '')).toBe('one\ntwo')
  })
})
