<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  ref,
  watch,
} from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import {
  readTextFile,
  requestTextFileWritePermission,
  TEXT_VIEWER_MAX_BYTES,
  writeTextFile,
  type TextFileContent,
} from '@/services/textFile'
import type { MediaItem } from '@/types/media'
import { formatBytes, getExtension } from '@/utils/media'

const TextEditor = defineAsyncComponent(() => import('@/components/viewer/TextEditor.vue'))

interface Props {
  item: MediaItem
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'saved', itemId: string, file: File): void
}>()

const root = ref<HTMLElement>()
const contentElement = ref<HTMLElement>()
const content = ref<TextFileContent>()
const editedText = ref('')
const savedText = ref('')
const errorMessage = ref('')
const saveMessage = ref('')
const loading = ref(false)
const editing = ref(false)
const saving = ref(false)
let requestId = 0

const ARROW_SCROLL_STEP = 26

const canEdit = computed(() => Boolean(content.value && !content.value.truncated))
const hasOriginalFileHandle = computed(() =>
  props.item.kind === 'text' && props.item.fileHandle !== undefined,
)
const dirty = computed(() => editing.value && editedText.value !== savedText.value)
const editorFormat = computed(() => getExtension(props.item.name).toUpperCase())

function focusViewer(): void {
  void nextTick(() => root.value?.focus())
}

function confirmDiscardChanges(): boolean {
  return !dirty.value || window.confirm('저장하지 않은 변경사항을 버릴까요?')
}

function requestClose(): void {
  if (confirmDiscardChanges()) emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (editing.value) {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.stopPropagation()
    }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyS') {
      event.preventDefault()
      if (hasOriginalFileHandle.value) void saveOriginal()
      else void saveAs()
    }
    return
  }

  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    requestClose()
    return
  }
  if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return

  event.preventDefault()
  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
  contentElement.value?.scrollBy({
    top: direction * ARROW_SCROLL_STEP,
    behavior: 'auto',
  })
}

async function loadContent(item: MediaItem): Promise<void> {
  const currentRequestId = ++requestId
  content.value = undefined
  editedText.value = ''
  savedText.value = ''
  errorMessage.value = ''
  saveMessage.value = ''
  editing.value = false
  loading.value = true

  try {
    const nextContent = await readTextFile(item.file, TEXT_VIEWER_MAX_BYTES)
    if (currentRequestId !== requestId) return
    content.value = nextContent
    editedText.value = nextContent.text
    savedText.value = nextContent.text
  } catch {
    if (currentRequestId === requestId) {
      errorMessage.value = '텍스트 파일을 읽지 못했습니다.'
    }
  } finally {
    if (currentRequestId === requestId) loading.value = false
  }
}

function startEditing(): void {
  if (!canEdit.value) return
  saveMessage.value = ''
  editedText.value = savedText.value
  editing.value = true
}

function cancelEditing(): void {
  if (!confirmDiscardChanges()) return
  editedText.value = savedText.value
  editing.value = false
  saveMessage.value = ''
  focusViewer()
}

function updateSavedContent(text: string, encoding: TextFileContent['encoding']): void {
  savedText.value = text
  editedText.value = text
  if (content.value) {
    content.value = {
      ...content.value,
      encoding,
      text,
      truncated: false,
    }
  }
}

async function saveOriginal(): Promise<void> {
  const fileHandle = props.item.fileHandle
  const sourceEncoding = content.value?.encoding
  if (!fileHandle || !sourceEncoding || saving.value) return

  saving.value = true
  saveMessage.value = ''
  try {
    if (!await requestTextFileWritePermission(fileHandle)) {
      saveMessage.value = '원본 쓰기 권한이 없습니다. 다른 이름으로 저장해주세요.'
      return
    }

    const result = await writeTextFile(fileHandle, editedText.value, sourceEncoding)
    updateSavedContent(editedText.value, result.encoding)
    emit('saved', props.item.id, result.file)
    saveMessage.value = result.encoding === sourceEncoding
      ? '원본 파일에 저장했습니다.'
      : `${result.encoding} 형식으로 원본 파일에 저장했습니다.`
  } catch {
    saveMessage.value = '원본 파일에 저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

async function saveAs(): Promise<void> {
  const sourceEncoding = content.value?.encoding
  const showSaveFilePicker = window.showSaveFilePicker
  if (!sourceEncoding || !showSaveFilePicker || saving.value) {
    if (!showSaveFilePicker) saveMessage.value = '이 Chrome에서는 다른 이름으로 저장할 수 없습니다.'
    return
  }

  saving.value = true
  saveMessage.value = ''
  try {
    const extension = getExtension(props.item.name)
    const fileHandle = await showSaveFilePicker({
      suggestedName: props.item.name,
      types: [{
        description: '텍스트 파일',
        accept: { 'text/plain': extension ? [`.${extension}`] : ['.txt'] },
      }],
    })
    const result = await writeTextFile(fileHandle, editedText.value, sourceEncoding)
    savedText.value = editedText.value
    saveMessage.value = result.encoding === sourceEncoding
      ? '새 파일로 저장했습니다.'
      : `${result.encoding} 형식의 새 파일로 저장했습니다.`
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      saveMessage.value = '새 파일로 저장하지 못했습니다.'
    }
  } finally {
    saving.value = false
  }
}

watch(
  () => props.item.id,
  () => void loadContent(props.item),
  { immediate: true },
)

onMounted(async () => {
  await nextTick()
  root.value?.focus()
})
</script>

<template>
  <section
    ref="root"
    class="text-viewer"
    tabindex="-1"
    aria-label="텍스트 상세보기"
    @keydown="handleKeydown"
  >
    <header class="text-viewer__toolbar">
      <strong :title="item.path">{{ item.name }}</strong>
      <div class="text-viewer__actions">
        <template v-if="editing">
          <button
            v-if="hasOriginalFileHandle"
            type="button"
            title="저장 (Cmd/Ctrl+S)"
            aria-label="저장"
            :disabled="saving || !dirty"
            @click="saveOriginal"
          >
            <SvgIcon name="save" :size="18" />
          </button>
          <button
            type="button"
            title="다른 이름으로 저장"
            aria-label="다른 이름으로 저장"
            :disabled="saving || !dirty"
            @click="saveAs"
          >
            <SvgIcon name="save-as" :size="18" />
          </button>
          <button
            type="button"
            title="편집 취소"
            aria-label="편집 취소"
            :disabled="saving"
            @click="cancelEditing"
          >
            <SvgIcon name="edit-off" :size="18" />
          </button>
        </template>
        <button
          v-else
          type="button"
          aria-label="편집"
          :disabled="!canEdit"
          :title="content?.truncated ? '일부만 읽은 파일은 편집할 수 없습니다.' : '편집'"
          @click="startEditing"
        >
          <SvgIcon name="edit" :size="18" />
        </button>
        <button type="button" aria-label="텍스트 상세보기 닫기" @click="requestClose">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>
    </header>

    <div v-if="loading" class="text-viewer__state">
      <SvgIcon name="refresh" :size="36" class="is-loading" />
      <strong>텍스트를 읽는 중입니다...</strong>
    </div>
    <div v-else-if="errorMessage" class="text-viewer__state">
      <SvgIcon name="docs" :size="36" />
      <strong>{{ errorMessage }}</strong>
    </div>
    <TextEditor
      v-else-if="editing"
      v-model="editedText"
      :format="editorFormat"
    />
    <pre v-else ref="contentElement" class="text-viewer__content">{{ content?.text }}</pre>

    <footer>
      <span>{{ formatBytes(item.size) }}</span>
      <span>{{ item.format }}</span>
      <span>{{ content?.encoding ?? '인코딩 확인 중' }}</span>
      <span v-if="dirty">수정됨</span>
      <span v-else-if="saveMessage" class="text-viewer__save-message">{{ saveMessage }}</span>
      <span v-else-if="content?.truncated">파일이 커서 앞부분 5 MB만 표시합니다.</span>
      <span v-else-if="editing && content?.encoding === 'CP949'">저장 시 UTF-8로 변환됩니다.</span>
    </footer>
  </section>
</template>

<style lang="scss">
.text-viewer {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  grid-template-rows: 36px minmax(0, 1fr) 27px;
  min-width: 0;
  min-height: 0;
  color: var(--color-window-text);
  background: var(--color-face);
  outline: none;

  &__toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 4px 10px;
    border-bottom: 1px solid var(--color-shadow-dark);
    box-shadow: inset 0 1px var(--color-light);

    strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__actions {
    display: flex;
    flex: 0 0 auto;
    gap: 4px;
  }

  &__actions button {
    display: grid;
    flex: 0 0 28px;
    width: 28px;
    height: 27px;
    padding: 0;
    color: inherit;
    place-items: center;
    background: var(--color-face);
    border: 1px solid;
    border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
      var(--color-light);

    &:active:not(:disabled) {
      border-color: var(--color-shadow-dark) var(--color-light) var(--color-light)
        var(--color-shadow-dark);
    }
  }

  &__content {
    min-width: 0;
    min-height: 0;
    padding: 20px 24px;
    margin: 0;
    overflow: auto;
    font: 16px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    tab-size: 4;
    background: #fff;
  }

  &__state {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    justify-content: center;
    color: var(--color-muted);
    background: #fff;

    .is-loading {
      animation: text-viewer-spin 0.8s linear infinite;
    }
  }

  footer {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-top: 1px solid var(--color-light);

    span {
      min-width: 90px;
      padding: 3px 7px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid;
      border-color: var(--color-shadow) var(--color-light) var(--color-light) var(--color-shadow);

      &:last-child {
        flex: 1;
      }
    }
  }

  &__save-message {
    color: var(--color-selection-dark);
  }
}

@keyframes text-viewer-spin {
  to {
    rotate: 360deg;
  }
}
</style>
