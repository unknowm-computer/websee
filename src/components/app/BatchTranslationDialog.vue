<script setup lang="ts">
import { computed, ref } from "vue";

import TranslationDataManagement from "@/components/app/TranslationDataManagement.vue";
import SvgIcon from "@/components/common/SvgIcon.vue";
import type {
  BatchTranslationOptions,
  BatchTranslationState,
} from "@/types/batchTranslation";
import type { MediaItem } from "@/types/media";
import type { TranslationEngineId } from "@/types/translationEngine";

interface Props {
  archiveCount: number;
  directoryHandle?: FileSystemDirectoryHandle;
  folderLabel: string;
  imageCount: number;
  initialSelectedItemId?: string;
  items: readonly MediaItem[];
  state: BatchTranslationState;
  translationEngine: TranslationEngineId;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "continue"): void;
  (event: "pause"): void;
  (event: "resume"): void;
  (event: "start", options: BatchTranslationOptions): void;
  (event: "stop"): void;
}>();

const includeArchives = ref(true);
const selectFiles = ref(false);
const selectedItemIds = ref<string[]>(
  props.initialSelectedItemId &&
    props.items.some((item) => item.id === props.initialSelectedItemId)
    ? [props.initialSelectedItemId]
    : [],
);
const skipExisting = ref(true);
const translationDataBusy = ref(false);

const active = computed(() =>
  [
    "requesting-permission",
    "running",
    "awaiting-translation",
    "pausing",
    "paused",
    "stopping",
  ].includes(props.state.phase),
);
const awaitingTranslation = computed(
  () => props.state.phase === "awaiting-translation",
);
const terminal = computed(() =>
  ["completed", "stopped", "error"].includes(props.state.phase),
);
const selectedItemCount = computed(() => selectedItemIds.value.length);
const canStart = computed(
  () =>
    !translationDataBusy.value &&
    (selectFiles.value
      ? selectedItemCount.value > 0
      : props.imageCount > 0 ||
        (includeArchives.value && props.archiveCount > 0)),
);

function selectAllItems(): void {
  selectedItemIds.value = props.items.map((item) => item.id);
}

function clearSelectedItems(): void {
  selectedItemIds.value = [];
}

function start(): void {
  if (translationDataBusy.value) return;
  emit("start", {
    includeArchives: selectFiles.value ? true : includeArchives.value,
    selectedItemIds: selectFiles.value ? [...selectedItemIds.value] : undefined,
    skipExisting: skipExisting.value,
  });
}

function handleBackdropClick(): void {
  if (!active.value) requestClose();
}

function requestClose(): void {
  if (!translationDataBusy.value) emit("close");
}

function handleEscape(): void {
  if (!active.value) requestClose();
}
</script>

<template>
  <div class="dialog-backdrop" @click.self="handleBackdropClick">
    <section
      class="batch-translation-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-translation-title"
      :aria-busy="translationDataBusy"
      @keydown.esc.stop.prevent="handleEscape"
    >
      <header>
        <strong id="batch-translation-title">
          <SvgIcon name="auto" :size="19" />
          폴더 일괄 번역
        </strong>
        <button
          type="button"
          :aria-label="active ? '일괄 번역 창 숨기기' : '일괄 번역 창 닫기'"
          :disabled="translationDataBusy"
          @click="requestClose"
        >
          <SvgIcon name="close" :size="17" />
        </button>
      </header>

      <div class="batch-translation-dialog__body">
        <section v-if="!active" class="batch-translation-dialog__settings">
          <strong>{{ state.folderLabel || folderLabel }}</strong>
          <label>
            <input type="checkbox" checked disabled />
            현재 폴더의 이미지 {{ imageCount }}개
          </label>
          <label v-if="!selectFiles">
            <input
              v-model="includeArchives"
              type="checkbox"
              :disabled="archiveCount === 0"
            />
            압축파일 {{ archiveCount }}개 내부 이미지 포함
          </label>
          <label>
            <input v-model="skipExisting" type="checkbox" />
            저장된 번역 결과가 있으면 건너뛰기
          </label>
          <label>
            <input
              v-model="selectFiles"
              type="checkbox"
              aria-controls="batch-translation-file-selection"
              :aria-expanded="selectFiles"
            />
            번역할 파일 직접 선택
          </label>
          <section
            v-if="selectFiles"
            id="batch-translation-file-selection"
            class="batch-translation-dialog__file-selection"
            aria-label="번역할 파일 선택"
          >
            <div class="batch-translation-dialog__file-selection-heading">
              <strong
                >선택 {{ selectedItemCount }}개 / 전체
                {{ items.length }}개</strong
              >
              <span>
                <button type="button" @click="selectAllItems">전체 선택</button>
                <button type="button" @click="clearSelectedItems">
                  전체 해제
                </button>
              </span>
            </div>
            <div class="batch-translation-dialog__file-selection-list">
              <label
                v-for="selectableItem in items"
                :key="selectableItem.id"
                class="batch-translation-dialog__file-selection-item"
                :title="selectableItem.path"
              >
                <input
                  v-model="selectedItemIds"
                  type="checkbox"
                  :value="selectableItem.id"
                />
                <span>{{ selectableItem.name }}</span>
              </label>
            </div>
          </section>
          <p>
            하위 폴더는 포함하지 않습니다. 압축파일은 하나씩 열어 내부 이미지를
            순서대로 처리합니다.
          </p>
          <p>시작할 때 원본 폴더의 쓰기 권한을 요청합니다.</p>
        </section>

        <TranslationDataManagement
          v-if="!active"
          :directory-handle="directoryHandle"
          :folder-label="folderLabel"
          @busy-change="translationDataBusy = $event"
        />

        <section
          v-if="active || terminal"
          class="batch-translation-dialog__progress"
          :aria-live="active ? 'polite' : 'off'"
        >
          <div class="batch-translation-dialog__progress-heading">
            <strong>{{ state.message }}</strong>
            <span>{{ state.counts.processed }}개 처리</span>
          </div>
          <progress v-if="active" />
          <progress
            v-else
            :value="state.counts.processed"
            :max="Math.max(1, state.counts.discovered)"
          />
          <span
            v-if="state.currentItemName"
            class="batch-translation-dialog__current"
          >
            {{ state.currentItemName }}
          </span>
          <dl>
            <div>
              <dt>발견</dt>
              <dd>{{ state.counts.discovered }}</dd>
            </div>
            <div>
              <dt>완료</dt>
              <dd>{{ state.counts.translated }}</dd>
            </div>
            <div>
              <dt>건너뜀</dt>
              <dd>{{ state.counts.skipped }}</dd>
            </div>
            <div>
              <dt>실패</dt>
              <dd>{{ state.counts.failed }}</dd>
            </div>
          </dl>
          <details
            v-if="state.errors.length"
            class="batch-translation-dialog__errors"
          >
            <summary>처리하지 못한 항목 {{ state.errors.length }}개</summary>
            <ul>
              <li v-for="error in state.errors" :key="error">{{ error }}</li>
            </ul>
          </details>
        </section>

        <p v-if="active" class="batch-translation-dialog__note">
          바깥 영역이나 Esc로는 닫히지 않습니다. 창 숨기기를 눌러도 작업은
          계속됩니다.
        </p>
      </div>

      <footer>
        <button
          v-if="awaitingTranslation"
          class="batch-translation-dialog__model-download"
          type="button"
          @click="emit('continue')"
        >
          <SvgIcon name="download-for-offline" :size="18" />
          {{ translationEngine === 'apple' ? '번역 계속' : '번역 모델 받기' }}
        </button>
        <template v-if="active">
          <button
            v-if="state.phase === 'running'"
            type="button"
            @click="emit('pause')"
          >
            일시정지
          </button>
          <button
            v-if="state.phase === 'paused'"
            type="button"
            @click="emit('resume')"
          >
            계속
          </button>
          <button
            type="button"
            :disabled="state.phase === 'stopping'"
            @click="emit('stop')"
          >
            {{ state.phase === "stopping" ? "중지 중" : "중지" }}
          </button>
        </template>
        <button v-else type="button" :disabled="!canStart" @click="start">
          {{ terminal ? "다시 실행" : "시작" }}
        </button>
        <button
          type="button"
          :disabled="translationDataBusy"
          @click="requestClose"
        >
          {{ active ? "창 숨기기" : "닫기" }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style lang="scss">
.batch-translation-dialog {
  width: min(560px, 100%);
  color: var(--color-window-text);
  background: var(--color-face);
  border: 1px solid var(--color-shadow-dark);
  box-shadow:
    inset 1px 1px var(--color-light),
    4px 5px 15px rgb(0 0 0 / 35%);

  > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    padding: 3px 4px 3px 8px;
    color: #fff;
    background: var(--color-selection);

    strong {
      display: inline-flex;
      gap: 5px;
      align-items: center;
    }

    button {
      display: grid;
      place-items: center;
      width: 23px;
      height: 22px;
      padding: 0;
    }
  }

  &__body {
    display: grid;
    gap: 10px;
    max-height: min(72vh, 680px);
    padding: 16px;
    overflow-y: auto;
  }

  &__settings,
  &__progress {
    display: grid;
    gap: 10px;
    padding: 12px;
    background: #fff;
    border: 1px solid var(--color-shadow);
  }

  &__settings {
    > label {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    p {
      margin: 0;
      color: var(--color-muted);
    }
  }

  &__file-selection {
    display: grid;
    gap: 6px;
    padding: 8px;
    background: var(--color-face);
    border: 1px solid;
    border-color: var(--color-shadow) var(--color-light) var(--color-light)
      var(--color-shadow);
  }

  &__file-selection-heading {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    > span {
      display: flex;
      gap: 4px;
    }

    button {
      min-height: 24px;
      padding: 2px 7px;
    }
  }

  &__file-selection-list {
    display: grid;
    max-height: 190px;
    overflow-y: auto;
    background: #fff;
    border: 1px solid var(--color-shadow);
  }

  &__file-selection-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 7px;
    align-items: center;
    min-height: 27px;
    padding: 3px 7px;
    border-bottom: 1px solid var(--color-face);

    &:last-child {
      border-bottom: 0;
    }

    &:hover {
      background: var(--color-highlight);
    }

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__progress-heading {
    display: flex;
    gap: 10px;
    justify-content: space-between;

    strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  progress {
    width: 100%;
    height: 17px;
  }

  &__current {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin: 0;
    border: 1px solid var(--color-shadow);

    div {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px;
      padding: 5px 7px;
      border-right: 1px solid var(--color-shadow);

      &:last-child {
        border-right: 0;
      }
    }

    dt,
    dd {
      margin: 0;
    }
  }

  &__errors {
    color: #8e2424;

    ul {
      max-height: 120px;
      padding-left: 24px;
      margin-bottom: 0;
      overflow: auto;
    }
  }

  &__note {
    margin: 0;
    color: var(--color-muted);
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
    gap: 6px;
    justify-content: flex-end;
    padding: 0 12px 12px;

    .batch-translation-dialog__model-download {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      margin-right: auto;
      font-weight: 700;
      color: #fff;
      background: var(--color-selection);
    }
  }
}
</style>
