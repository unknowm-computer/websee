export type TextFileEncoding = 'CP949' | 'UTF-16 BE' | 'UTF-16 LE' | 'UTF-8'

export interface TextFileContent {
  encoding: TextFileEncoding
  text: string
  truncated: boolean
}

export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024
export const TEXT_VIEWER_MAX_BYTES = 5 * 1024 * 1024

interface DecodedText {
  encoding: TextFileEncoding
  text: string
}

export interface EncodedTextFile {
  bytes: Uint8Array
  encoding: Exclude<TextFileEncoding, 'CP949'>
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value)
}

export function decodeTextBytes(bytes: Uint8Array): DecodedText {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    return {
      encoding: 'UTF-8',
      text: new TextDecoder('utf-8').decode(bytes.subarray(3)),
    }
  }

  if (startsWith(bytes, [0xff, 0xfe])) {
    return {
      encoding: 'UTF-16 LE',
      text: new TextDecoder('utf-16le').decode(bytes.subarray(2)),
    }
  }

  if (startsWith(bytes, [0xfe, 0xff])) {
    return {
      encoding: 'UTF-16 BE',
      text: new TextDecoder('utf-16be').decode(bytes.subarray(2)),
    }
  }

  try {
    return {
      encoding: 'UTF-8',
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    }
  } catch {
    return {
      encoding: 'CP949',
      text: new TextDecoder('euc-kr').decode(bytes),
    }
  }
}

export async function readTextFile(file: File, maxBytes: number): Promise<TextFileContent> {
  const truncated = file.size > maxBytes
  const bytes = new Uint8Array(await file.slice(0, maxBytes).arrayBuffer())
  const decoded = decodeTextBytes(bytes)

  return {
    ...decoded,
    truncated,
  }
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2)
  bytes[0] = littleEndian ? 0xff : 0xfe
  bytes[1] = littleEndian ? 0xfe : 0xff

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index)
    const offset = 2 + index * 2
    bytes[offset] = littleEndian ? codeUnit & 0xff : codeUnit >> 8
    bytes[offset + 1] = littleEndian ? codeUnit >> 8 : codeUnit & 0xff
  }

  return bytes
}

export function encodeTextFile(text: string, sourceEncoding: TextFileEncoding): EncodedTextFile {
  if (sourceEncoding === 'UTF-16 LE') {
    return { bytes: encodeUtf16(text, true), encoding: sourceEncoding }
  }
  if (sourceEncoding === 'UTF-16 BE') {
    return { bytes: encodeUtf16(text, false), encoding: sourceEncoding }
  }

  return {
    bytes: new TextEncoder().encode(text),
    encoding: 'UTF-8',
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
  sourceEncoding: TextFileEncoding,
): Promise<{ encoding: Exclude<TextFileEncoding, 'CP949'>; file: File }> {
  const encoded = encodeTextFile(text, sourceEncoding)
  const writable = await fileHandle.createWritable()
  await writable.write(encoded.bytes)
  await writable.close()

  return {
    encoding: encoded.encoding,
    file: await fileHandle.getFile(),
  }
}
