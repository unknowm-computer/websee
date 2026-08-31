import { SearchQuery, search, setSearchQuery } from '@codemirror/search'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import {
  getTextEditorReplacementStatus,
  getTextEditorSearchStatus,
} from '@/services/textEditorStatus'

function createSearchState(selectionFrom = 0, selectionTo = selectionFrom): EditorState {
  const state = EditorState.create({
    doc: 'apple banana apple apple',
    extensions: [search()],
    selection: EditorSelection.single(selectionFrom, selectionTo),
  })

  return state.update({
    effects: setSearchQuery.of(new SearchQuery({ search: 'apple' })),
  }).state
}

describe('text editor search status', () => {
  it('reports the selected match and total match count', () => {
    expect(getTextEditorSearchStatus(createSearchState(13, 18))).toEqual({
      kind: 'search',
      current: 2,
      total: 3,
    })
  })

  it('uses the next match from the cursor when no match is selected', () => {
    expect(getTextEditorSearchStatus(createSearchState(8))).toEqual({
      kind: 'search',
      current: 2,
      total: 3,
    })
  })

  it('reports an empty search result', () => {
    const state = createSearchState().update({
      effects: setSearchQuery.of(new SearchQuery({ search: 'orange' })),
    }).state
    expect(getTextEditorSearchStatus(state)).toEqual({
      kind: 'search',
      current: 0,
      total: 0,
    })
  })
})

describe('text editor replacement status', () => {
  it('counts changed ranges from replace-all transactions', () => {
    const state = EditorState.create({ doc: 'one one one' })
    const transaction = state.update({
      changes: [
        { from: 0, to: 3, insert: 'two' },
        { from: 4, to: 7, insert: 'two' },
        { from: 8, to: 11, insert: 'two' },
      ],
      userEvent: 'input.replace.all',
    })

    expect(getTextEditorReplacementStatus([transaction])).toEqual({
      kind: 'replace',
      count: 3,
    })
  })
})
