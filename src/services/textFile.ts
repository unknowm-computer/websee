import {
  detectTextFileBom,
  restoreTextLineEndings,
  shouldWriteTextFileBom,
} from '@/services/textFileFormat'

export const TEXT_FILE_ENCODINGS = [
  'UTF-8', 'CP949', 'Shift-JIS', 'EUC-JP', 'UTF-16 LE', 'UTF-16 BE',
] as const

export type TextFileEncoding = typeof TEXT_FILE_ENCODINGS[number]
export type TextFileEncodingSelection = 'auto' | TextFileEncoding
export interface TextFileContent {
  encoding: TextFileEncoding
  text: string
  truncated: boolean
  bytes: Uint8Array
}

export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024
export const TEXT_VIEWER_MAX_BYTES = 5 * 1024 * 1024

interface DecodedText {
  encoding: TextFileEncoding
  text: string
}

export interface EncodedTextFile {
  bytes: Uint8Array
  encoding: TextFileEncoding
}

export class TextFileSaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TextFileSaveError'
  }
}

const DECODER_LABELS: Record<TextFileEncoding, string> = {
  'UTF-8': 'utf-8',
  'CP949': 'euc-kr',
  'Shift-JIS': 'shift_jis',
  'EUC-JP': 'euc-jp',
  'UTF-16 LE': 'utf-16le',
  'UTF-16 BE': 'utf-16be',
}
const DETECTION_SAMPLE_BYTES = 64 * 1024

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value)
}

function decode(
  bytes: Uint8Array,
  encoding: TextFileEncoding,
  truncated: boolean,
  fatal = false,
): string {
  // A byte-limited preview may end inside a character. Leave that incomplete
  // character buffered instead of treating the whole file as another encoding.
  return new TextDecoder(DECODER_LABELS[encoding], { fatal }).decode(bytes, { stream: truncated })
}

function detectBomlessUtf16(bytes: Uint8Array): TextFileEncoding | undefined {
  const pairs = Math.floor(Math.min(bytes.length, DETECTION_SAMPLE_BYTES) / 2)
  if (pairs < 2) return undefined

  let evenZeros = 0
  let oddZeros = 0
  for (let index = 0; index < pairs * 2; index += 2) {
    if (bytes[index] === 0) evenZeros += 1
    if (bytes[index + 1] === 0) oddZeros += 1
  }
  if (oddZeros / pairs > 0.6 && evenZeros / pairs < 0.1) return 'UTF-16 LE'
  if (evenZeros / pairs > 0.6 && oddZeros / pairs < 0.1) return 'UTF-16 BE'
  return undefined
}

function japaneseTextScore(text: string): number {
  const nonAsciiCount = text.match(/[^\x00-\x7f]/g)?.length ?? 0
  const kanaCount = text.match(/[\u3041-\u3096\u30a1-\u30fa]/g)?.length ?? 0
  // Full-width kana provide stronger evidence than half-width kana, which
  // commonly appear when Korean bytes are decoded incorrectly as Shift-JIS.
  if (kanaCount < 2 || kanaCount / nonAsciiCount < 0.15) return 0
  return kanaCount / nonAsciiCount
}

function detectLegacyEncoding(bytes: Uint8Array, truncated: boolean): TextFileEncoding {
  // Long ASCII headers contain no evidence for distinguishing these encodings.
  // Start at the first non-ASCII byte, which is a character boundary in all candidates.
  const sampleStart = Math.max(0, bytes.findIndex((byte) => byte >= 0x80))
  const sample = bytes.subarray(sampleStart, sampleStart + DETECTION_SAMPLE_BYTES)
  const sampleTruncated = truncated || sampleStart + sample.length < bytes.length
  let fallback: TextFileEncoding | undefined
  let bestEncoding: TextFileEncoding | undefined
  let bestScore = 0

  for (const encoding of ['CP949', 'Shift-JIS', 'EUC-JP'] as const) {
    try {
      const text = decode(sample, encoding, sampleTruncated, true)
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) continue
      fallback ??= encoding
      if (encoding === 'CP949') continue
      const score = japaneseTextScore(text)
      if (score > bestScore) {
        bestEncoding = encoding
        bestScore = score
      }
    } catch {
      // Invalid bytes exclude this candidate; manual selection remains available
      // for short or ambiguous files where automatic detection is inconclusive.
    }
  }
  return bestEncoding ?? fallback ?? 'CP949'
}

export function decodeTextBytes(
  bytes: Uint8Array,
  selection: TextFileEncodingSelection = 'auto',
  truncated = false,
): DecodedText {
  if (selection !== 'auto') {
    return { encoding: selection, text: decode(bytes, selection, truncated) }
  }

  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    return {
      encoding: 'UTF-8',
      text: decode(bytes, 'UTF-8', truncated),
    }
  }

  if (startsWith(bytes, [0xff, 0xfe])) {
    return {
      encoding: 'UTF-16 LE',
      text: decode(bytes, 'UTF-16 LE', truncated),
    }
  }

  if (startsWith(bytes, [0xfe, 0xff])) {
    return {
      encoding: 'UTF-16 BE',
      text: decode(bytes, 'UTF-16 BE', truncated),
    }
  }

  const utf16Encoding = detectBomlessUtf16(bytes)
  if (utf16Encoding) {
    return { encoding: utf16Encoding, text: decode(bytes, utf16Encoding, truncated) }
  }

  try {
    return {
      encoding: 'UTF-8',
      text: decode(bytes, 'UTF-8', truncated, true),
    }
  } catch {
    const encoding = detectLegacyEncoding(bytes, truncated)
    return { encoding, text: decode(bytes, encoding, truncated) }
  }
}

export async function readTextFile(
  file: File,
  maxBytes: number,
  selection: TextFileEncodingSelection = 'auto',
): Promise<TextFileContent> {
  const truncated = file.size > maxBytes
  const bytes = new Uint8Array(await file.slice(0, maxBytes).arrayBuffer())
  const decoded = decodeTextBytes(bytes, selection, truncated)

  return {
    ...decoded,
    truncated,
    bytes,
  }
}

function encodeUtf16(text: string, littleEndian: boolean, bom: boolean): Uint8Array {
  const prefixLength = bom ? 2 : 0
  const bytes = new Uint8Array(prefixLength + text.length * 2)
  if (bom) {
    bytes[0] = littleEndian ? 0xff : 0xfe
    bytes[1] = littleEndian ? 0xfe : 0xff
  }

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index)
    const offset = prefixLength + index * 2
    bytes[offset] = littleEndian ? codeUnit & 0xff : codeUnit >> 8
    bytes[offset + 1] = littleEndian ? codeUnit >> 8 : codeUnit & 0xff
  }

  return bytes
}

export async function encodeTextFile(
  text: string,
  encoding: TextFileEncoding,
  bom = encoding === 'UTF-16 LE' || encoding === 'UTF-16 BE',
): Promise<EncodedTextFile> {
  if (encoding === 'UTF-16 LE') {
    return { bytes: encodeUtf16(text, true, bom), encoding }
  }
  if (encoding === 'UTF-16 BE') {
    return { bytes: encodeUtf16(text, false, bom), encoding }
  }

  if (encoding === 'UTF-8') {
    return { bytes: new TextEncoder().encode(bom ? `\ufeff${text}` : text), encoding }
  }

  const { encodeLegacyText } = await import('@/services/legacyTextEncoding')
  try {
    return { bytes: encodeLegacyText(text, encoding), encoding }
  } catch (error) {
    if (error instanceof Error && error.name === 'TextEncodingError') {
      throw new TextFileSaveError(error.message)
    }
    throw error
  }
}

export async function requestTextFileWritePermission(
  fileHandle: FileSystemFileHandle,
): Promise<boolean> {
  const permissionHandle = fileHandle as FileSystemFileHandle & {
    queryPermission?: (
      descriptor?: { mode?: 'read' | 'readwrite' },
    ) => Promise<PermissionState>
    requestPermission?: (
      descriptor?: { mode?: 'read' | 'readwrite' },
    ) => Promise<PermissionState>
  }
  const descriptor = { mode: 'readwrite' } as const

  if (await permissionHandle.queryPermission?.(descriptor) === 'granted') return true
  if (!permissionHandle.requestPermission) return false
  return await permissionHandle.requestPermission(descriptor) === 'granted'
}

export async function writeTextFile(
  fileHandle: FileSystemFileHandle,
  text: string,
  source: TextFileContent,
  selection: TextFileEncodingSelection = 'auto',
): Promise<{ encoding: TextFileEncoding; file: File; content: TextFileContent }> {
  if (source.truncated) throw new TextFileSaveError('일부만 읽은 파일은 저장할 수 없습니다.')
  const encoding = selection === 'auto' ? source.encoding : selection
  const restoredText = restoreTextLineEndings(text, source.text)
  const bom = shouldWriteTextFileBom(source.encoding, encoding, detectTextFileBom(source.bytes))
  // Preserve the exact original bytes for unchanged content, including legacy
  // characters with multiple byte representations or undecodable source bytes.
  const unchanged = encoding === source.encoding && restoredText === source.text
  if (!unchanged) {
    try {
      decode(source.bytes, source.encoding, false, true)
    } catch {
      throw new TextFileSaveError(
        '원본에 현재 인코딩으로 읽지 못한 문자가 있습니다. 편집을 취소하고 올바른 인코딩으로 다시 열어주세요.',
      )
    }
  }
  const encoded = unchanged
    ? { bytes: source.bytes, encoding }
    : await encodeTextFile(restoredText, encoding, bom)

  // Finish validation before opening a writable stream so unrepresentable
  // characters never cause the original file to be overwritten with '?'.
  const writable = await fileHandle.createWritable()
  await writable.write(encoded.bytes)
  await writable.close()

  return {
    encoding: encoded.encoding,
    file: await fileHandle.getFile(),
    content: { encoding, text: restoredText, bytes: encoded.bytes, truncated: false },
  }
}
