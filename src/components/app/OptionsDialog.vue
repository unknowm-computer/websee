<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import SvgIcon from "@/components/common/SvgIcon.vue";
import {
  clearCachedTranslationModelData,
  getCachedTranslationModelData,
  type CachedTranslationModelData,
} from "@/services/imageTranslation/modelCache";
import {
  IMAGE_TRANSLATION_MODELS,
  IMAGE_TRANSLATION_MODEL_TOTAL_BYTES,
} from "@/services/imageTranslation/modelManifest";
import { requestDirectoryWritePermission } from "@/services/imageTranslation/translationSidecar";
import {
  deleteAllTranslationSidecars,
  deleteOrphanedTranslationSidecars,
  scanTranslationSidecars,
  type TranslationSidecarSummary,
} from "@/services/imageTranslation/translationSidecarManagement";
import type {
  MediaListColumnKey,
  MediaListColumnVisibility,
} from "@/types/media";
import { formatBytes } from "@/utils/media";

interface Props {
  fileListColumns: MediaListColumnVisibility;
  translationDirectoryHandle?: FileSystemDirectoryHandle;
  translationFolderLabel?: string;
  translationManagementDisabled?: boolean;
}

type TranslationDataAction = "all" | "orphans";

const props = withDefaults(defineProps<Props>(), {
  translationDirectoryHandle: undefined,
  translationFolderLabel: "현재 폴더",
  translationManagementDisabled: false,
});

const emit = defineEmits<{
  (event: "close"): void;
  (event: "set-file-list-column", column: MediaListColumnKey, visible: boolean): void;
}>();

const fileListColumnOptions: ReadonlyArray<{
  key: MediaListColumnKey;
  label: string;
}> = [
  { key: "size", label: "크기" },
  { key: "format", label: "형식" },
  { key: "resolution", label: "해상도" },
  { key: "modified", label: "수정일" },
];

const cachedData = ref<CachedTranslationModelData>({ bytes: 0, count: 0 });
const modelLoading = ref(true);
const modelClearing = ref(false);
const modelMessage = ref("");
const modelFailed = ref(false);

const emptyTranslationSummary = (): TranslationSidecarSummary => ({
  fileCount: 0,
  orphanBytes: 0,
  orphanCount: 0,
  totalBytes: 0,
});
const translationSummary = ref<TranslationSidecarSummary>(
  emptyTranslationSummary(),
);
const translationLoading = ref(true);
const translationDeleting = ref(false);
const translationMessage = ref("");
const translationFailed = ref(false);
const pendingTranslationAction = ref<TranslationDataAction>();

const cacheDescription = computed(() => {
  if (modelLoading.value) return "저장된 모델 데이터를 확인하는 중입니다.";
  if (!cachedData.value.count) return "저장된 모델 데이터가 없습니다.";
  return `${cachedData.value.count}/${IMAGE_TRANSLATION_MODELS.length}개 모델 · ${formatBytes(cachedData.value.bytes)}`;
});

const translationDescription = computed(() => {
  if (!props.translationDirectoryHandle)
    return "폴더 열기로 연 현재 폴더에서만 관리할 수 있습니다.";
  if (translationLoading.value)
    return "저장된 번역 데이터를 확인하는 중입니다.";
  if (!translationSummary.value.fileCount)
    return "저장된 번역 데이터가 없습니다.";

  const description = `${translationSummary.value.fileCount}개 JSON · ${formatBytes(translationSummary.value.totalBytes)}`;
  if (!translationSummary.value.orphanCount) return description;
  return `${description} · 사용하지 않는 데이터 ${translationSummary.value.orphanCount}개 (${formatBytes(translationSummary.value.orphanBytes)})`;
});

const confirmationDescription = computed(() => {
  if (pendingTranslationAction.value === "orphans") {
    return `원본 파일이 없는 번역 데이터 ${translationSummary.value.orphanCount}개를 삭제합니다.`;
  }
  return `'${props.translationFolderLabel}'의 번역 데이터 ${translationSummary.value.fileCount}개를 모두 삭제합니다.`;
});

const dialogBusy = computed(
  () => modelClearing.value || translationDeleting.value,
);
const translationActionsDisabled = computed(
  () =>
    !props.translationDirectoryHandle ||
    translationLoading.value ||
    dialogBusy.value ||
    props.translationManagementDisabled,
);

function requestClose(): void {
  if (!dialogBusy.value) emit("close");
}

function setFileListColumn(column: MediaListColumnKey, event: Event): void {
  const checkbox = event.currentTarget;
  if (!(checkbox instanceof HTMLInputElement)) return;
  emit("set-file-list-column", column, checkbox.checked);
}

async function refreshCachedData(): Promise<void> {
  modelLoading.value = true;
  modelFailed.value = false;
  modelMessage.value = "";
  try {
    cachedData.value = await getCachedTranslationModelData();
  } catch (error) {
    modelFailed.value = true;
    modelMessage.value =
      error instanceof Error
        ? error.message
        : "저장된 이미지 번역 모델을 확인하지 못했습니다.";
  } finally {
    modelLoading.value = false;
  }
}

async function clearModelData(): Promise<void> {
  if (dialogBusy.value) return;
  modelClearing.value = true;
  modelFailed.value = false;
  modelMessage.value = "";
  try {
    await clearCachedTranslationModelData();
    cachedData.value = { bytes: 0, count: 0 };
    modelMessage.value = "다운로드한 이미지 번역 모델을 삭제했습니다.";
  } catch (error) {
    modelFailed.value = true;
    modelMessage.value =
      error instanceof Error
        ? error.message
        : "이미지 번역 모델을 삭제하지 못했습니다.";
  } finally {
    modelClearing.value = false;
  }
}

async function refreshTranslationData(clearMessage = true): Promise<void> {
  const directoryHandle = props.translationDirectoryHandle;
  translationLoading.value = true;
  translationFailed.value = false;
  if (clearMessage) translationMessage.value = "";
  if (!directoryHandle) {
    translationSummary.value = emptyTranslationSummary();
    translationLoading.value = false;
    return;
  }

  try {
    translationSummary.value = await scanTranslationSidecars(directoryHandle);
  } catch (error) {
    translationFailed.value = true;
    translationMessage.value =
      error instanceof Error
        ? error.message
        : "저장된 폴더 번역 데이터를 확인하지 못했습니다.";
  } finally {
    translationLoading.value = false;
  }
}

function requestTranslationAction(action: TranslationDataAction): void {
  translationMessage.value = "";
  translationFailed.value = false;
  pendingTranslationAction.value = action;
}

async function confirmTranslationAction(): Promise<void> {
  const directoryHandle = props.translationDirectoryHandle;
  const action = pendingTranslationAction.value;
  if (
    !directoryHandle ||
    !action ||
    dialogBusy.value ||
    props.translationManagementDisabled
  )
    return;

  translationDeleting.value = true;
  translationFailed.value = false;
  translationMessage.value = "";
  try {
    const permissionGranted =
      await requestDirectoryWritePermission(directoryHandle);
    if (!permissionGranted)
      throw new Error("현재 폴더의 쓰기 권한이 필요합니다.");

    if (action === "orphans") {
      const deletedCount =
        await deleteOrphanedTranslationSidecars(directoryHandle);
      translationMessage.value = `사용하지 않는 번역 데이터 ${deletedCount}개를 삭제했습니다.`;
    } else {
      await deleteAllTranslationSidecars(directoryHandle);
      translationMessage.value = "현재 폴더의 번역 데이터를 모두 삭제했습니다.";
    }
    pendingTranslationAction.value = undefined;
    await refreshTranslationData(false);
  } catch (error) {
    translationFailed.value = true;
    translationMessage.value =
      error instanceof Error
        ? error.message
        : "폴더 번역 데이터를 삭제하지 못했습니다.";
  } finally {
    translationDeleting.value = false;
  }
}

onMounted(() => {
  void refreshCachedData();
  void refreshTranslationData();
});
</script>

<template>
  <div class="dialog-backdrop" @click.self="requestClose">
    <section
      class="options-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-title"
      :aria-busy="dialogBusy"
      @keydown.esc.stop.prevent="requestClose"
    >
      <header>
        <strong id="options-title">WebSee 옵션</strong>
        <button
          type="button"
          aria-label="옵션 닫기"
          :disabled="dialogBusy"
          @click="requestClose"
        >
          <SvgIcon name="close" :size="17" />
        </button>
      </header>

      <div class="options-dialog__body">
        <section aria-labelledby="file-list-columns-title">
          <h2 id="file-list-columns-title">파일 목록 표시 항목</h2>
          <p>목록 보기에서 파일명 옆에 표시할 정보를 선택합니다. 파일명은 항상 표시됩니다.</p>
          <div class="options-dialog__checkboxes">
            <label v-for="option in fileListColumnOptions" :key="option.key">
              <input
                type="checkbox"
                :checked="fileListColumns[option.key]"
                @change="setFileListColumn(option.key, $event)"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </section>

        <section aria-labelledby="translation-model-title">
          <h2 id="translation-model-title">이미지 번역 모델</h2>
          <p>
            최초 번역 시 내려받은 영역 감지·OCR 모델을 이 브라우저에 보관합니다.
            전체 크기는 약
            {{ formatBytes(IMAGE_TRANSLATION_MODEL_TOTAL_BYTES) }}입니다.
          </p>
          <div class="options-dialog__status">
            <span>{{ cacheDescription }}</span>
            <button
              type="button"
              :disabled="modelLoading || dialogBusy || cachedData.count === 0"
              @click="clearModelData"
            >
              {{ modelClearing ? "삭제 중" : "모델 데이터 삭제" }}
            </button>
          </div>
          <p
            v-if="modelMessage"
            class="options-dialog__message"
            :class="{ 'is-error': modelFailed }"
            :role="modelFailed ? 'alert' : 'status'"
          >
            {{ modelMessage }}
          </p>
          <p class="options-dialog__note">
            삭제 후 이미지 번역을 다시 사용하면 필요한 모델을 다시 내려받습니다.
          </p>
        </section>

        <section aria-labelledby="translation-data-title">
          <h2 id="translation-data-title">폴더 번역 데이터</h2>
          <p>
            <strong>{{ translationFolderLabel }}</strong
            >의 <code>.websee</code>에 저장된 번역 결과를 관리합니다. 압축파일은
            내부 이미지가 여러 장이어도 JSON 하나로 셉니다.
          </p>
          <div
            class="options-dialog__status options-dialog__translation-status"
          >
            <span>{{ translationDescription }}</span>
            <div class="options-dialog__translation-actions">
              <button
                type="button"
                :disabled="
                  translationActionsDisabled ||
                  translationSummary.orphanCount === 0
                "
                @click="requestTranslationAction('orphans')"
              >
                사용하지 않는 데이터 정리
              </button>
              <button
                type="button"
                :disabled="
                  translationActionsDisabled ||
                  translationSummary.fileCount === 0
                "
                @click="requestTranslationAction('all')"
              >
                현재 폴더 데이터 삭제
              </button>
            </div>
          </div>

          <div
            v-if="pendingTranslationAction"
            class="options-dialog__confirmation"
            role="alertdialog"
            aria-labelledby="translation-confirmation-title"
          >
            <strong id="translation-confirmation-title">삭제할까요?</strong>
            <span>{{ confirmationDescription }}</span>
            <div>
              <button
                type="button"
                :disabled="dialogBusy"
                @click="confirmTranslationAction"
              >
                {{ translationDeleting ? "삭제 중" : "삭제" }}
              </button>
              <button
                type="button"
                :disabled="dialogBusy"
                @click="pendingTranslationAction = undefined"
              >
                취소
              </button>
            </div>
          </div>

          <p
            v-if="translationMessage"
            class="options-dialog__message"
            :class="{ 'is-error': translationFailed }"
            :role="translationFailed ? 'alert' : 'status'"
          >
            {{ translationMessage }}
          </p>
          <p v-if="translationManagementDisabled" class="options-dialog__note">
            일괄 번역 중에는 폴더 번역 데이터를 관리할 수 없습니다.
          </p>
          <p v-else class="options-dialog__note">
            사용하지 않는 데이터 정리는 원본 이미지나 압축파일이 사라진 JSON만
            삭제합니다.
          </p>
        </section>
      </div>

      <footer>
        <button
          type="button"
          autofocus
          :disabled="dialogBusy"
          @click="requestClose"
        >
          확인
        </button>
      </footer>
    </section>
  </div>
</template>

<style lang="scss">
.options-dialog {
  width: min(600px, 100%);
  color: var(--color-window-text);
  background: var(--color-face);
  border: 1px solid var(--color-shadow-dark);
  box-shadow:
    inset 1px 1px var(--color-light),
    4px 5px 15px rgb(0 0 0 / 35%);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    padding: 3px 4px 3px 8px;
    color: #fff;
    background: var(--color-selection);

    button {
      display: grid;
      place-items: center;
      width: 23px;
      height: 22px;
      padding: 0;
      background: var(--color-face);
      border: 1px solid;
      border-color: var(--color-light) var(--color-shadow-dark)
        var(--color-shadow-dark) var(--color-light);
    }
  }

  &__body {
    display: grid;
    gap: 12px;
    max-height: min(72vh, 680px);
    padding: 16px;
    overflow-y: auto;

    section {
      padding: 12px;
      background: #fff;
      border: 1px solid var(--color-shadow);
    }

    h2 {
      margin: 0 0 8px;
      font-size: inherit;
    }

    p {
      margin: 0 0 12px;
    }
  }

  &__status {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-height: 40px;
    padding: 7px 9px;
    background: var(--color-face);
    border: 1px solid var(--color-shadow);

    > button,
    > div {
      flex: 0 0 auto;
    }
  }

  &__checkboxes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 16px;
    padding: 9px;
    background: var(--color-face);
    border: 1px solid var(--color-shadow);

    label {
      display: flex;
      gap: 7px;
      align-items: center;
    }
  }

  &__translation-status {
    align-items: flex-start;
  }

  &__translation-actions {
    display: grid;
    gap: 5px;
  }

  &__confirmation {
    display: grid;
    gap: 7px;
    padding: 9px;
    margin-top: 10px;
    background: #fff7db;
    border: 1px solid #a7832d;

    > div {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
  }

  &__message {
    margin-top: 10px !important;
    color: #165e25;

    &.is-error {
      color: #8e2424;
    }
  }

  &__note {
    margin: 10px 0 0 !important;
    color: var(--color-muted);
  }

  code {
    font: inherit;
  }

  button {
    min-height: 27px;
    padding: 3px 9px;
    font: inherit;
    color: var(--color-window-text);
    background: var(--color-face);
    border: 1px solid;
    border-color: var(--color-light) var(--color-shadow-dark)
      var(--color-shadow-dark) var(--color-light);

    &:disabled {
      color: var(--color-disabled);
    }
  }

  footer {
    display: flex;
    justify-content: flex-end;
    padding: 0 12px 12px;

    button {
      min-width: 76px;
    }
  }
}
</style>
