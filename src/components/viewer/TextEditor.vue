<script setup lang="ts">
import { basicSetup } from 'codemirror'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { searchPanelOpen } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  getTextEditorReplacementStatus,
  getTextEditorSearchStatus,
  type TextEditorActivityStatus,
} from '@/services/textEditorStatus'
import { CODEMIRROR_CSP_NONCE } from '@/utils/contentSecurityPolicy'

interface Props {
  format: string
  modelValue: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'activity-status', status?: TextEditorActivityStatus): void
  (event: 'update:modelValue', value: string): void
}>()

const editorContainer = ref<HTMLElement>()
let editorView: EditorView | undefined
let searchStatusTimer: number | undefined

const KOREAN_EDITOR_PHRASES = {
  'Find': '찾기',
  'Replace': '바꾸기',
  'next': '다음',
  'previous': '이전',
  'all': '모두',
  'match case': '대/소문자 구분',
  'regexp': '정규식',
  'by word': '단어 단위',
  'replace': '바꾸기',
  'replace all': '모두 바꾸기',
  'close': '닫기',
  'current match': '현재 일치 항목',
  'on line': '줄',
  'replaced match on line $': '$번째 줄의 일치 항목을 바꿨습니다',
  'replaced $ matches': '일치 항목 $개를 바꿨습니다',
  'Selection deleted': '선택 영역을 삭제했습니다',
} satisfies Record<string, string>

function getLanguageExtension(format: string): Extension[] {
  if (format === 'JSON') return [json()]
  if (format === 'SMI') return [html()]
  return []
}

function clearSearchStatusTimer(): void {
  if (searchStatusTimer !== undefined) window.clearTimeout(searchStatusTimer)
  searchStatusTimer = undefined
}

function scheduleSearchStatus(): void {
  clearSearchStatusTimer()
  searchStatusTimer = window.setTimeout(() => {
    searchStatusTimer = undefined
    const state = editorView?.state
    if (!state || !searchPanelOpen(state)) {
      emit('activity-status')
      return
    }
    emit('activity-status', getTextEditorSearchStatus(state))
  }, 80)
}

function updateActivityStatus(update: ViewUpdate): void {
  const replacementStatus = getTextEditorReplacementStatus(update.transactions)
  if (replacementStatus) {
    clearSearchStatusTimer()
    emit('activity-status', replacementStatus)
    return
  }

  if (!update.transactions.length) return
  scheduleSearchStatus()
}

onMounted(async () => {
  const parent = editorContainer.value
  if (!parent) return

  editorView = new EditorView({
    parent,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        EditorView.cspNonce.of(CODEMIRROR_CSP_NONCE),
        EditorState.phrases.of(KOREAN_EDITOR_PHRASES),
        EditorView.contentAttributes.of({ 'aria-label': '텍스트 편집기' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
          updateActivityStatus(update)
        }),
        ...getLanguageExtension(props.format),
      ],
    }),
  })

  await nextTick()
  editorView.focus()
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editorView || editorView.state.doc.toString() === value) return
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: value },
    })
  },
)

onBeforeUnmount(() => {
  clearSearchStatusTimer()
  editorView?.destroy()
})
</script>

<template>
  <div ref="editorContainer" class="text-editor" />
</template>

<style lang="scss">
.text-editor {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #fff;

  .cm-editor {
    position: relative !important;
    display: flex !important;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    box-sizing: border-box;
    font: 15px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .cm-scroller {
    position: relative;
    z-index: 0;
    display: flex !important;
    align-items: flex-start !important;
    height: 100%;
    overflow: auto;
    overflow-anchor: none;
  }

  .cm-announced {
    position: fixed;
    top: -10000px;
  }

  .cm-content {
    display: block;
    flex-grow: 2;
    flex-shrink: 0;
    box-sizing: border-box;
    min-height: 100%;
    padding: 4px 0;
    margin: 0;
    caret-color: #000;
    white-space: pre;
    overflow-wrap: normal;
    outline: none;

    &[contenteditable='true'] {
      -webkit-user-modify: read-write-plaintext-only;
    }
  }

  .cm-lineWrapping {
    flex-shrink: 1;
    white-space: break-spaces;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .cm-line {
    display: block;
    padding: 0 2px 0 6px;
  }

  .cm-layer {
    position: absolute;
    top: 0;
    left: 0;
    contain: size style;
    user-select: none;

    > * {
      position: absolute;
    }
  }

  .cm-selectionBackground {
    background: #d7d4f0;
  }

  .cm-cursorLayer {
    pointer-events: none;
  }

  .cm-cursor,
  .cm-dropCursor {
    margin-left: -0.6px;
    pointer-events: none;
    border-left: 1.2px solid #000;
  }

  .cm-cursor {
    display: none;
  }

  .cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor {
    display: block;
    animation: text-editor-cursor-blink 1.2s steps(1) infinite;
  }

  .cm-dropCursor {
    position: absolute;
  }

  .cm-gutters {
    z-index: 200;
    display: flex;
    flex-shrink: 0;
    box-sizing: border-box;
    height: 100%;
    color: #6c6c6c;
    background: #f5f5f5;
    border: 0 solid #ddd;
  }

  .cm-gutters-before {
    inset-inline-start: 0;
    border-right-width: 1px;
  }

  .cm-gutters-after {
    inset-inline-end: 0;
    border-left-width: 1px;
  }

  .cm-gutter {
    display: flex !important;
    flex-direction: column;
    flex-shrink: 0;
    box-sizing: border-box;
    min-height: 100%;
    overflow: hidden;
  }

  .cm-gutterElement {
    box-sizing: border-box;
  }

  .cm-lineNumbers .cm-gutterElement {
    min-width: 20px;
    padding: 0 3px 0 5px;
    text-align: right;
    white-space: nowrap;
  }

  .cm-activeLine {
    background: #cceeff44;
  }

  .cm-activeLineGutter {
    background: #e2f2ff;
  }

  .cm-panels {
    position: sticky;
    right: 0;
    left: 0;
    z-index: 300;
    box-sizing: border-box;
    color: #000;
    background: #f5f5f5;
  }

  .cm-panels-top {
    top: 0;
    border-bottom: 1px solid #ddd;
  }

  .cm-panels-bottom {
    bottom: 0;
    border-top: 1px solid #ddd;
  }

  .cm-dialog {
    position: relative;
    padding: 2px 19px 4px 6px;
  }

  .cm-search {
    padding: 4px 30px 4px 6px;

    .cm-textfield {
      width: clamp(140px, 18vw, 220px);
      height: 24px;
      padding: 2px 6px;
      margin: 2px 4px 2px 0;
      color: var(--color-window-text);
      font: inherit;
      font-size: 12px;
      vertical-align: middle;
      background: #fff;
      border: 1px solid;
      border-color: var(--color-shadow-dark) var(--color-light) var(--color-light)
        var(--color-shadow-dark);
      border-radius: 0;
    }

    .cm-button {
      min-width: 42px;
      height: 24px;
      padding: 0 8px;
      margin: 2px 4px 2px 0;
      color: inherit;
      font: inherit;
      font-size: 12px;
      vertical-align: middle;
      background: var(--color-face);
      border: 1px solid;
      border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
        var(--color-light);
      border-radius: 0;

      &:active {
        background: var(--color-pressed);
        border-color: var(--color-shadow-dark) var(--color-light) var(--color-light)
          var(--color-shadow-dark);
      }
    }

    label {
      display: inline-flex;
      gap: 3px;
      align-items: center;
      margin: 2px 6px 2px 0;
      font-size: 12px;
      line-height: 1;
      vertical-align: middle;
      white-space: nowrap;
    }

    input[type='checkbox'] {
      width: 14px;
      height: 14px;
      margin: 0;
      accent-color: var(--color-selection);
    }
  }

  .cm-dialog-close,
  .cm-search.cm-panel button[name='close'] {
    position: absolute;
    top: 4px;
    right: 4px;
    display: grid;
    width: 22px;
    height: 22px;
    padding: 0 0 2px;
    color: inherit;
    font: inherit;
    font-size: 14px;
    line-height: 1;
    place-items: center;
    background: var(--color-face);
    border: 1px solid;
    border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
      var(--color-light);

    &:active {
      border-color: var(--color-shadow-dark) var(--color-light) var(--color-light)
        var(--color-shadow-dark);
    }
  }

  .cm-focused {
    outline: 1px solid var(--color-selection);
    outline-offset: -1px;
  }
}

@media print {
  .text-editor .cm-announced {
    display: none;
  }
}

@keyframes text-editor-cursor-blink {
  50% {
    opacity: 0;
  }
}
</style>
