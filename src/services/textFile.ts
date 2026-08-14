export interface TextFileContent {
  encoding: string
  text: string
  truncated: boolean
}

export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024
export const TEXT_VIEWER_MAX_BYTES = 5 * 1024 * 1024

interface DecodedText {
  encoding: string
  text: string
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
