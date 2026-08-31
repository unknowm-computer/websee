import { getSearchQuery } from '@codemirror/search'
import type { EditorState, Transaction } from '@codemirror/state'

export type TextEditorActivityStatus =
  | { kind: 'search'; current: number; total: number }
  | { kind: 'replace'; count: number }

export function getTextEditorSearchStatus(
  state: EditorState,
): TextEditorActivityStatus | undefined {
  const query = getSearchQuery(state)
  if (!query.valid || !query.search) return undefined

  const selection = state.selection.main
  let total = 0
  let selectedMatch = 0
  let nextMatch = 0
  const cursor = query.getCursor(state)

  while (true) {
    const result = cursor.next()
    if (result.done) break

    total += 1
    if (result.value.from === selection.from && result.value.to === selection.to) {
      selectedMatch = total
    }
    if (!nextMatch && result.value.from >= selection.head) nextMatch = total
  }

  return {
    kind: 'search',
    current: total ? selectedMatch || nextMatch || 1 : 0,
    total,
  }
}

export function getTextEditorReplacementStatus(
  transactions: readonly Transaction[],
): TextEditorActivityStatus | undefined {
  let count = 0

  for (const transaction of transactions) {
    if (!transaction.isUserEvent('input.replace') || !transaction.docChanged) continue
    transaction.changes.iterChanges(() => {
      count += 1
    })
  }

  return count ? { kind: 'replace', count } : undefined
}
