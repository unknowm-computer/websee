const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const UTF8_FLAG = 0x0800
const UNICODE_PATH_EXTRA_FIELD = 0x7075
const MAX_ZIP_COMMENT_LENGTH = 65_535

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const legacyKoreanDecoder = createLegacyKoreanDecoder()

function createLegacyKoreanDecoder(): TextDecoder | undefined {
  try {
    return new TextDecoder('euc-kr', { fatal: true })
  } catch {
    return undefined
  }
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0
}

function decode(decoder: TextDecoder | undefined, bytes: Uint8Array): string | undefined {
  if (!decoder) return undefined

  try {
    return decoder.decode(bytes)
  } catch {
    return undefined
  }
}

function decodeLatin1(bytes: Uint8Array): string {
  let result = ''
  for (const byte of bytes) result += String.fromCharCode(byte)
  return result
}

function containsKoreanOrCjk(value: string): boolean {
  return /[\u3130-\u318f\u3400-\u9fff\uac00-\ud7a3]/u.test(value)
}

function readUnicodePathExtraField(
  bytes: Uint8Array,
  offset: number,
  length: number,
): string | undefined {
  const end = offset + length
  let cursor = offset

  while (cursor + 4 <= end) {
    const fieldId = readUint16(bytes, cursor)
    const fieldLength = readUint16(bytes, cursor + 2)
    const dataStart = cursor + 4
    const dataEnd = dataStart + fieldLength
    if (dataEnd > end) return undefined

    if (fieldId === UNICODE_PATH_EXTRA_FIELD && fieldLength >= 5 && bytes[dataStart] === 1) {
      return decode(utf8Decoder, bytes.subarray(dataStart + 5, dataEnd))
    }

    cursor = dataEnd
  }

  return undefined
}

function decodeZipEntryName(
  rawName: Uint8Array,
  utf8Flagged: boolean,
  unicodePath: string | undefined,
): string {
  if (unicodePath) return unicodePath

  const utf8Name = decode(utf8Decoder, rawName)
  if (utf8Flagged || utf8Name) return utf8Name ?? decodeLatin1(rawName)

  const koreanName = decode(legacyKoreanDecoder, rawName)
  if (koreanName && containsKoreanOrCjk(koreanName)) return koreanName

  return decodeLatin1(rawName)
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.length - 22 - MAX_ZIP_COMMENT_LENGTH)

  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(bytes, offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset
  }

  return -1
}

export function readZipEntryNames(bytes: Uint8Array): string[] {
  const endOffset = findEndOfCentralDirectory(bytes)
  if (endOffset < 0) return []

  const entryCount = readUint16(bytes, endOffset + 10)
  let cursor = readUint32(bytes, endOffset + 16)
  if (entryCount === 0xffff || cursor === 0xffffffff) return []

  const names: string[] = []

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || readUint32(bytes, cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      return []
    }

    const flags = readUint16(bytes, cursor + 8)
    const nameLength = readUint16(bytes, cursor + 28)
    const extraLength = readUint16(bytes, cursor + 30)
    const commentLength = readUint16(bytes, cursor + 32)
    const nameStart = cursor + 46
    const extraStart = nameStart + nameLength
    const nextCursor = extraStart + extraLength + commentLength
    if (nextCursor > bytes.length) return []

    const rawName = bytes.subarray(nameStart, extraStart)
    const unicodePath = readUnicodePathExtraField(bytes, extraStart, extraLength)
    names.push(decodeZipEntryName(rawName, Boolean(flags & UTF8_FLAG), unicodePath))
    cursor = nextCursor
  }

  return names
}

export function isMacosArchiveMetadata(path: string): boolean {
  const segments = path.replaceAll('\\', '/').split('/').filter(Boolean)
  const fileName = segments.at(-1) ?? ''

  return segments.some((segment) => {
    const normalizedSegment = segment.toLowerCase()
    return normalizedSegment === '__macosx' || normalizedSegment === '.appledouble'
  })
    || fileName.startsWith('._')
    || fileName.toLowerCase() === '.ds_store'
}
