export type TextFileBom = 'UTF-8' | 'UTF-16 LE' | 'UTF-16 BE' | null
type LineEnding = '\r\n' | '\n' | '\r'

export function detectTextFileBom(bytes: Uint8Array): TextFileBom {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'UTF-8'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'UTF-16 LE'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'UTF-16 BE'
  return null
}

export function shouldWriteTextFileBom(
  sourceEncoding: string,
  targetEncoding: string,
  sourceBom: TextFileBom,
): boolean {
  if (sourceEncoding === targetEncoding) return sourceBom === targetEncoding
  return targetEncoding === 'UTF-16 LE' || targetEncoding === 'UTF-16 BE'
}

interface LineRange {
  originalStart: number
  originalEnd: number
  editedStart: number
  editedEnd: number
}

interface LineAnchor {
  original: number
  edited: number
}

function matchRangeEdges(
  original: readonly string[],
  edited: readonly string[],
  mapping: Int32Array,
  range: LineRange,
): LineRange {
  let { originalStart, originalEnd, editedStart, editedEnd } = range
  while (originalStart < originalEnd && editedStart < editedEnd
    && original[originalStart] === edited[editedStart]) {
    mapping[editedStart++] = originalStart++
  }
  while (originalStart < originalEnd && editedStart < editedEnd
    && original[originalEnd - 1] === edited[editedEnd - 1]) {
    mapping[--editedEnd] = --originalEnd
  }
  return { originalStart, originalEnd, editedStart, editedEnd }
}

function uniquePositions(lines: readonly string[], start: number, end: number): Map<string, number> {
  const positions = new Map<string, number>()
  for (let index = start; index < end; index += 1) {
    const line = lines[index]!
    positions.set(line, positions.has(line) ? -1 : index)
  }
  return positions
}

function findOrderedAnchors(
  original: readonly string[],
  edited: readonly string[],
  range: LineRange,
): LineAnchor[] {
  const originalPositions = uniquePositions(original, range.originalStart, range.originalEnd)
  const editedPositions = uniquePositions(edited, range.editedStart, range.editedEnd)
  const candidates: LineAnchor[] = []
  for (let index = range.editedStart; index < range.editedEnd; index += 1) {
    const line = edited[index]!
    const originalIndex = originalPositions.get(line)
    if (originalIndex !== undefined && originalIndex >= 0 && editedPositions.get(line) === index) {
      candidates.push({ original: originalIndex, edited: index })
    }
  }

  // A longest increasing sequence of unique lines gives stable anchors without
  // a quadratic text diff, even when a large file has many edits or moved lines.
  const tails: number[] = []
  const previous = new Int32Array(candidates.length).fill(-1)
  for (let index = 0; index < candidates.length; index += 1) {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (candidates[tails[middle]!]!.original < candidates[index]!.original) low = middle + 1
      else high = middle
    }
    if (low > 0) previous[index] = tails[low - 1]!
    tails[low] = index
  }
  const anchors: LineAnchor[] = []
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]!) {
    anchors.push(candidates[index]!)
  }
  return anchors.reverse()
}

function mapChangedRange(
  original: readonly string[],
  edited: readonly string[],
  mapping: Int32Array,
  range: LineRange,
): void {
  const remaining = matchRangeEdges(original, edited, mapping, range)
  if (remaining.originalEnd - remaining.originalStart === remaining.editedEnd - remaining.editedStart) {
    // Replacing the contents of a line does not change its existing separator.
    for (let index = remaining.editedStart; index < remaining.editedEnd; index += 1) {
      mapping[index] = remaining.originalStart + index - remaining.editedStart
    }
  }
}

export function restoreTextLineEndings(text: string, originalText: string): string {
  const normalized = text.replace(/\r\n|\r/g, '\n')
  const endings = originalText.match(/\r\n|\r|\n/g) as LineEnding[] | null
  if (!endings?.length) return normalized
  if (normalized === originalText.replace(/\r\n|\r/g, '\n')) return originalText

  const counts = new Map<LineEnding, number>()
  for (const ending of endings) counts.set(ending, (counts.get(ending) ?? 0) + 1)
  let preferred = endings[0]!
  for (const [ending, count] of counts) {
    if (count > counts.get(preferred)!) preferred = ending
  }
  if (counts.size === 1) return normalized.replace(/\n/g, preferred)

  const originalLines = originalText.split(/\r\n|\r|\n/)
  const editedLines = normalized.split('\n')
  const mapping = new Int32Array(editedLines.length).fill(-1)
  const range = matchRangeEdges(originalLines, editedLines, mapping, {
    originalStart: 0,
    originalEnd: originalLines.length,
    editedStart: 0,
    editedEnd: editedLines.length,
  })
  const anchors = findOrderedAnchors(originalLines, editedLines, range)
  let originalStart = range.originalStart
  let editedStart = range.editedStart
  for (const anchor of [...anchors, { original: range.originalEnd, edited: range.editedEnd }]) {
    mapChangedRange(originalLines, editedLines, mapping, {
      originalStart,
      originalEnd: anchor.original,
      editedStart,
      editedEnd: anchor.edited,
    })
    if (anchor.edited < range.editedEnd) mapping[anchor.edited] = anchor.original
    originalStart = anchor.original + 1
    editedStart = anchor.edited + 1
  }

  return editedLines.map((line, index) => {
    if (index === editedLines.length - 1) return line
    return line + (endings[mapping[index]!] ?? preferred)
  }).join('')
}
