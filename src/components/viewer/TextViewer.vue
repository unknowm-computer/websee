<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  ref,
  watch,
} from "vue";

import SvgIcon from "@/components/common/SvgIcon.vue";
import type { TextEditorActivityStatus } from "@/services/textEditorStatus";
import {
  readTextFile,
  requestTextFileWritePermission,
  TEXT_FILE_ENCODINGS,
  TEXT_VIEWER_MAX_BYTES,
  TextFileSaveError,
  writeTextFile,
  type TextFileContent,
  type TextFileEncoding,
  type TextFileEncodingSelection,
} from "@/services/textFile";
import type { MediaItem } from "@/types/media";
import { formatBytes, getExtension } from "@/utils/media";

const TextEditor = defineAsyncComponent(
  () => import("@/components/viewer/TextEditor.vue"),
);

interface Props {
  item: MediaItem;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "saved", itemId: string, file: File): void;
}>();

const root = ref<HTMLElement>();
const contentElement = ref<HTMLElement>();
const content = ref<TextFileContent>();
const editedText = ref("");
const savedText = ref("");
const errorMessage = ref("");
const saveMessage = ref("");
const loading = ref(false);
const editing = ref(false);
const saving = ref(false);
const editorActivityStatus = ref<TextEditorActivityStatus>();
const encodingSelection = ref<TextFileEncodingSelection>("auto");
const readEncodingSelection = ref<TextFileEncodingSelection>("auto");
const savedEncoding = ref<TextFileEncoding>();
let sourceFile = props.item.file;
let requestId = 0;

const ARROW_SCROLL_STEP = 26;

const canEdit = computed(() =>
  Boolean(content.value && !content.value.truncated),
);
const hasOriginalFileHandle = computed(
  () => props.item.kind === "text" && props.item.fileHandle !== undefined,
);
const saveEncoding = computed(() =>
  encodingSelection.value === "auto"
    ? content.value?.encoding
    : encodingSelection.value,
);
const dirty = computed(
  () => editing.value && (
    editedText.value !== savedText.value ||
    saveEncoding.value !== savedEncoding.value
  ),
);
const encodingStatusText = computed(() => {
  const sourceEncoding = content.value?.encoding;
  if (!sourceEncoding || !saveEncoding.value) return "";
  if (encodingSelection.value === "auto") return `${sourceEncoding} 원본 형식 유지`;
  return sourceEncoding === saveEncoding.value
    ? `${saveEncoding.value} 형식으로 저장`
    : `${sourceEncoding} → ${saveEncoding.value}로 저장 예정`;
});
const editorFormat = computed(() =>
  getExtension(props.item.name).toUpperCase(),
);
const editorActivityText = computed(() => {
  const status = editorActivityStatus.value;
  if (!status) return "";
  if (status.kind === "replace") return `${status.count}개 변경됨`;
  if (!status.total) return "찾기 결과 없음";
  return `찾기 ${status.current} / ${status.total}`;
});

function focusViewer(): void {
  void nextTick(() => root.value?.focus());
}

function updateEditedText(value: string): void {
  editedText.value = value;
  if (value !== savedText.value) saveMessage.value = "";
}

function updateEditorActivityStatus(status?: TextEditorActivityStatus): void {
  editorActivityStatus.value = status;
  if (status) saveMessage.value = "";
}

function confirmDiscardChanges(): boolean {
  return !dirty.value || window.confirm("저장하지 않은 변경사항을 버릴까요?");
}

function requestClose(): void {
  if (confirmDiscardChanges()) emit("close");
}

function handleKeydown(event: KeyboardEvent): void {
  if (editing.value) {
    if (event.key === "Enter" || event.key === "Escape") {
      event.stopPropagation();
    }
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyS") {
      event.preventDefault();
      if (hasOriginalFileHandle.value) void saveOriginal();
      else void saveAs();
    }
    return;
  }

  if (event.key === "Enter" || event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    requestClose();
    return;
  }
  if (!["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key))
    return;

  event.preventDefault();
  const direction =
    event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
  contentElement.value?.scrollBy({
    top: direction * ARROW_SCROLL_STEP,
    behavior: "auto",
  });
}

function toEditorText(text: string): string {
  // CodeMirror uses LF internally. Keep the decoded source unchanged so saving
  // can restore its original line endings without marking normalization as edits.
  return text.replace(/\r\n?/g, "\n");
}

async function loadContent(): Promise<void> {
  const currentRequestId = ++requestId;
  content.value = undefined;
  editedText.value = "";
  savedText.value = "";
  savedEncoding.value = undefined;
  errorMessage.value = "";
  saveMessage.value = "";
  editorActivityStatus.value = undefined;
  editing.value = false;
  saving.value = false;
  loading.value = true;

  try {
    const nextContent = await readTextFile(
      sourceFile,
      TEXT_VIEWER_MAX_BYTES,
      readEncodingSelection.value,
    );
    if (currentRequestId !== requestId) return;
    content.value = nextContent;
    editedText.value = toEditorText(nextContent.text);
    savedText.value = editedText.value;
    savedEncoding.value = nextContent.encoding;
  } catch {
    if (currentRequestId === requestId) {
      errorMessage.value = "텍스트 파일을 읽지 못했습니다.";
    }
  } finally {
    if (currentRequestId === requestId) loading.value = false;
  }
}

function changeEncoding(event: Event): void {
  const select = event.currentTarget;
  if (!(select instanceof HTMLSelectElement)) return;
  const selection = select.value;
  const nextEncoding = selection === "auto"
    ? "auto"
    : TEXT_FILE_ENCODINGS.find((encoding) => encoding === selection);
  if (!nextEncoding || nextEncoding === encodingSelection.value) return;
  if (loading.value || saving.value) {
    select.value = encodingSelection.value;
    return;
  }

  encodingSelection.value = nextEncoding;
  saveMessage.value = "";
  if (editing.value) return;

  readEncodingSelection.value = nextEncoding;
  void loadContent();
}

function startEditing(): void {
  if (!canEdit.value || !content.value) return;
  saveMessage.value = "";
  encodingSelection.value = readEncodingSelection.value;
  savedText.value = toEditorText(content.value.text);
  editedText.value = savedText.value;
  savedEncoding.value = content.value.encoding;
  editorActivityStatus.value = undefined;
  editing.value = true;
}

function cancelEditing(): void {
  if (!confirmDiscardChanges()) return;
  savedText.value = toEditorText(content.value?.text ?? "");
  editedText.value = savedText.value;
  savedEncoding.value = content.value?.encoding;
  encodingSelection.value = readEncodingSelection.value;
  editorActivityStatus.value = undefined;
  editing.value = false;
  saveMessage.value = "";
  focusViewer();
}

async function saveOriginal(): Promise<void> {
  const fileHandle = props.item.fileHandle;
  const sourceContent = content.value;
  if (!fileHandle || !sourceContent || saving.value || !editing.value) return;

  const currentRequestId = requestId;
  const itemId = props.item.id;
  const textToSave = editedText.value;
  const selectionToSave = encodingSelection.value;

  saving.value = true;
  saveMessage.value = "";
  try {
    if (!(await requestTextFileWritePermission(fileHandle))) {
      if (currentRequestId === requestId) {
        saveMessage.value =
          "원본 쓰기 권한이 없습니다. 다른 이름으로 저장해주세요.";
      }
      return;
    }

    const result = await writeTextFile(
      fileHandle,
      textToSave,
      sourceContent,
      selectionToSave,
    );
    emit("saved", itemId, result.file);
    if (currentRequestId !== requestId) return;
    sourceFile = result.file;
    content.value = result.content;
    savedText.value = textToSave;
    savedEncoding.value = result.encoding;
    readEncodingSelection.value = selectionToSave;
    saveMessage.value =
      result.encoding === sourceContent.encoding
        ? "원본 파일에 저장했습니다."
        : `${result.encoding} 형식으로 원본 파일에 저장했습니다.`;
  } catch (error) {
    if (currentRequestId === requestId) {
      saveMessage.value = error instanceof TextFileSaveError
        ? error.message
        : "원본 파일에 저장하지 못했습니다.";
    }
  } finally {
    if (currentRequestId === requestId) saving.value = false;
  }
}

async function saveAs(): Promise<void> {
  const sourceContent = content.value;
  const showSaveFilePicker = window.showSaveFilePicker;
  if (!sourceContent || !showSaveFilePicker || saving.value || !editing.value) {
    if (!showSaveFilePicker)
      saveMessage.value = "이 Chrome에서는 다른 이름으로 저장할 수 없습니다.";
    return;
  }

  const currentRequestId = requestId;
  const textToSave = editedText.value;
  const selectionToSave = encodingSelection.value;
  saving.value = true;
  saveMessage.value = "";
  try {
    const extension = getExtension(props.item.name);
    const fileHandle = await showSaveFilePicker({
      suggestedName: props.item.name,
      types: [
        {
          description: "텍스트 파일",
          accept: { "text/plain": extension ? [`.${extension}`] : [".txt"] },
        },
      ],
    });
    const result = await writeTextFile(
      fileHandle,
      textToSave,
      sourceContent,
      selectionToSave,
    );
    if (currentRequestId !== requestId) return;
    savedText.value = textToSave;
    savedEncoding.value = result.encoding;
    saveMessage.value =
      result.encoding === sourceContent.encoding
        ? "새 파일로 저장했습니다."
        : `${result.encoding} 형식의 새 파일로 저장했습니다.`;
  } catch (error) {
    if (currentRequestId === requestId &&
      !(error instanceof DOMException && error.name === "AbortError")) {
      saveMessage.value = error instanceof TextFileSaveError
        ? error.message
        : "새 파일로 저장하지 못했습니다.";
    }
  } finally {
    if (currentRequestId === requestId) saving.value = false;
  }
}

watch(
  () => props.item.id,
  () => {
    sourceFile = props.item.file;
    encodingSelection.value = "auto";
    readEncodingSelection.value = "auto";
    void loadContent();
  },
  { immediate: true },
);

onMounted(async () => {
  await nextTick();
  root.value?.focus();
});
</script>

<template>
  <section
    ref="root"
    class="text-viewer"
    tabindex="-1"
    aria-label="텍스트 상세보기"
    @keydown="handleKeydown"
  >
    <header class="text-viewer__toolbar notranslate" translate="no">
      <strong :title="item.path">{{ item.name }}</strong>
      <div class="text-viewer__actions">
        <select
          class="text-viewer__encoding"
          aria-label="텍스트 인코딩"
          :title="editing
            ? '저장할 인코딩 선택 (자동 감지는 원본 유지)'
            : '텍스트 인코딩을 선택하여 다시 읽기'"
          :value="encodingSelection"
          :disabled="loading || saving"
          @change="changeEncoding"
          @keydown.stop
        >
          <option value="auto">자동 감지 (원본 유지)</option>
          <option
            v-for="encoding in TEXT_FILE_ENCODINGS"
            :key="encoding"
            :value="encoding"
          >
            {{ encoding }}
          </option>
        </select>
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
          :title="
            content?.truncated
              ? '일부만 읽은 파일은 편집할 수 없습니다.'
              : '편집'
          "
          @click="startEditing"
        >
          <SvgIcon name="edit" :size="18" />
        </button>
        <button
          type="button"
          aria-label="텍스트 상세보기 닫기"
          @click="requestClose"
        >
          <SvgIcon name="close" :size="18" />
        </button>
      </div>
    </header>

    <div v-if="loading" class="text-viewer__state notranslate" translate="no">
      <SvgIcon name="refresh" :size="36" class="is-loading" />
      <strong>텍스트를 읽는 중입니다...</strong>
    </div>
    <div v-else-if="errorMessage" class="text-viewer__state notranslate" translate="no">
      <SvgIcon name="docs" :size="36" />
      <strong>{{ errorMessage }}</strong>
    </div>
    <TextEditor
      v-else-if="editing"
      class="notranslate"
      translate="no"
      :model-value="editedText"
      :format="editorFormat"
      @activity-status="updateEditorActivityStatus"
      @update:model-value="updateEditedText"
    />
    <pre v-else ref="contentElement" class="text-viewer__content" translate="yes">{{
      content?.text
    }}</pre>

    <footer class="notranslate" translate="no">
      <span>{{ formatBytes(item.size) }}</span>
      <span>{{ item.format }}</span>
      <span>{{ content?.encoding ?? "인코딩 확인 중" }}</span>
      <div class="text-viewer__status">
        <span v-if="saveMessage" class="text-viewer__save-message">{{
          saveMessage
        }}</span>
        <span v-else-if="editorActivityText">{{ editorActivityText }}</span>
        <span v-else-if="!dirty && content?.truncated"
          >파일이 커서 앞부분 5 MB만 표시합니다.</span
        >
        <span v-else-if="editing">{{ encodingStatusText }}</span>
        <span v-if="dirty">수정됨</span>
      </div>
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

  &__encoding {
    height: 27px;
    background: var(--color-light);
    border: 1px solid var(--color-shadow-dark);
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
    border-color: var(--color-light) var(--color-shadow-dark)
      var(--color-shadow-dark) var(--color-light);

    &:active:not(:disabled) {
      border-color: var(--color-shadow-dark) var(--color-light)
        var(--color-light) var(--color-shadow-dark);
    }

    &:disabled {
      color: var(--color-disabled);
    }
  }

  &__content {
    min-width: 0;
    min-height: 0;
    padding: 20px 24px;
    margin: 0;
    overflow: auto;
    font:
      16px/1.6 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
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

    > span {
      min-width: 90px;
      padding: 3px 7px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid;
      border-color: var(--color-shadow) var(--color-light) var(--color-light)
        var(--color-shadow);
    }
  }

  &__status {
    display: flex;
    flex: 1;
    gap: 6px;
    justify-content: flex-end;
    min-width: 0;
    padding: 3px 7px;
    overflow: hidden;
    text-align: right;
    white-space: nowrap;
    border: 1px solid;
    border-color: var(--color-shadow) var(--color-light) var(--color-light)
      var(--color-shadow);

    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;

      + span::before {
        margin-right: 6px;
        color: var(--color-muted);
        content: "·";
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
