import iconv from 'iconv-lite'

export type LegacyTextEncoding = 'CP949' | 'Shift-JIS' | 'EUC-JP'

const codecNames: Record<LegacyTextEncoding, string> = {
  CP949: 'cp949',
  'Shift-JIS': 'shift_jis',
  'EUC-JP': 'euc-jp',
}

export class TextEncodingError extends Error {
  readonly encoding: LegacyTextEncoding
  readonly characters: readonly string[]

  constructor(encoding: LegacyTextEncoding, characters: readonly string[]) {
    const examples = characters.map((character) => {
      const codePoint = character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')
      return `${JSON.stringify(character)} (U+${codePoint})`
    }).join(', ')

    super(`${encoding}로 저장할 수 없는 문자가 있습니다${examples ? `: ${examples}` : ''}. UTF-8을 선택해 저장해 주세요.`)
    this.name = 'TextEncodingError'
    this.encoding = encoding
    this.characters = characters
  }
}

function findUnrepresentableCharacters(text: string, codecName: string): string[] {
  const checked = new Set<string>()
  const characters: string[] = []

  for (const character of text) {
    if (checked.has(character)) continue
    checked.add(character)

    if (iconv.decode(iconv.encode(character, codecName), codecName) !== character) {
      characters.push(character)
      if (characters.length === 5) break
    }
  }

  return characters
}

export function encodeLegacyText(text: string, encoding: LegacyTextEncoding): Uint8Array {
  const codecName = codecNames[encoding]
  const bytes = iconv.encode(text, codecName)

  // iconv-lite replaces unrepresentable characters with '?'. Reject any lossy
  // conversion, including non-identical best-fit mappings, before writing a file.
  if (iconv.decode(bytes, codecName) !== text) {
    throw new TextEncodingError(encoding, findUnrepresentableCharacters(text, codecName))
  }

  return new Uint8Array(bytes)
}
