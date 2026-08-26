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
import type {
  MediaListColumnKey,
  MediaListColumnVisibility,
} from "@/types/media";
import { formatBytes } from "@/utils/media";
import {
  VIEWER_SLIDESHOW_INTERVAL_OPTIONS,
  type ViewerSlideshowPreference,
} from "@/utils/viewerPreferences";

interface Props {
  fileListColumns: MediaListColumnVisibility;
  slideshowPreference: ViewerSlideshowPreference;
  translationEnabled: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "set-file-list-column", column: MediaListColumnKey, visible: boolean): void;
  (
    event: "update-slideshow-preference",
    preference: ViewerSlideshowPreference,
  ): void;
  (event: "update-translation-enabled", enabled: boolean): void;
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

const cacheDescription = computed(() => {
  if (modelLoading.value) return "저장된 모델 데이터를 확인하는 중입니다.";
  if (!cachedData.value.count) return "저장된 모델 데이터가 없습니다.";
  return `${cachedData.value.count}/${IMAGE_TRANSLATION_MODELS.length}개 모델 · ${formatBytes(cachedData.value.bytes)}`;
});

const dialogBusy = computed(() => modelClearing.value);

function requestClose(): void {
  if (!dialogBusy.value) emit("close");
}

function setFileListColumn(column: MediaListColumnKey, event: Event): void {
  const checkbox = event.currentTarget;
  if (!(checkbox instanceof HTMLInputElement)) return;
  emit("set-file-list-column", column, checkbox.checked);
}

function updateSlideshowPreference(
  patch: Partial<ViewerSlideshowPreference>,
): void {
  emit("update-slideshow-preference", {
    ...props.slideshowPreference,
    ...patch,
  });
}

function setSlideshowEnabled(event: Event): void {
  const checkbox = event.currentTarget;
  if (!(checkbox instanceof HTMLInputElement)) return;
  updateSlideshowPreference({ enabled: checkbox.checked });
}

function setSlideshowInterval(event: Event): void {
  const select = event.currentTarget;
  if (!(select instanceof HTMLSelectElement)) return;
  const selectedInterval = Number.parseInt(select.value, 10);
  const intervalSeconds = VIEWER_SLIDESHOW_INTERVAL_OPTIONS.find(
    (option) => option === selectedInterval,
  );
  if (intervalSeconds === undefined) return;
  updateSlideshowPreference({ intervalSeconds });
}

function setSlideshowLoop(event: Event): void {
  const checkbox = event.currentTarget;
  if (!(checkbox instanceof HTMLInputElement)) return;
  updateSlideshowPreference({ loop: checkbox.checked });
}

function setTranslationEnabled(event: Event): void {
  const checkbox = event.currentTarget;
  if (!(checkbox instanceof HTMLInputElement)) return;
  emit("update-translation-enabled", checkbox.checked);
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

onMounted(() => {
  void refreshCachedData();
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

        <section aria-labelledby="slideshow-title">
          <h2 id="slideshow-title">슬라이드쇼</h2>
          <p>
            슬라이드쇼를 사용하면 이미지 뷰어 툴바에 시작·정지 버튼을
            표시합니다.
          </p>
          <div class="options-dialog__feature-settings">
            <label>
              <input
                type="checkbox"
                :checked="slideshowPreference.enabled"
                @change="setSlideshowEnabled"
              />
              <span>슬라이드쇼 기능 사용</span>
            </label>
            <label class="options-dialog__select-setting">
              <span>이미지 전환 간격</span>
              <select
                :value="slideshowPreference.intervalSeconds"
                :disabled="!slideshowPreference.enabled"
                @change="setSlideshowInterval"
              >
                <option
                  v-for="seconds in VIEWER_SLIDESHOW_INTERVAL_OPTIONS"
                  :key="seconds"
                  :value="seconds"
                >
                  {{ seconds }}초
                </option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                :checked="slideshowPreference.loop"
                :disabled="!slideshowPreference.enabled"
                @change="setSlideshowLoop"
              />
              <span>마지막 이미지 다음에 처음부터 반복</span>
            </label>
          </div>
        </section>

        <section aria-labelledby="translation-title">
          <h2 id="translation-title">이미지 번역</h2>
          <p>
            기능을 사용하면 이미지 뷰어의 번역 버튼과 메인 툴바의 일괄
            번역 버튼을 표시합니다.
          </p>
          <div class="options-dialog__feature-settings">
            <label>
              <input
                type="checkbox"
                :checked="translationEnabled"
                @change="setTranslationEnabled"
              />
              <span>이미지 번역 기능 사용</span>
            </label>
          </div>
          <h3>번역 모델 데이터</h3>
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

    h3 {
      margin: 14px 0 8px;
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

    > button {
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

  &__feature-settings {
    display: grid;
    gap: 10px;
    padding: 9px;
    background: var(--color-face);
    border: 1px solid var(--color-shadow);

    label {
      display: flex;
      gap: 7px;
      align-items: center;
    }
  }

  &__select-setting {
    justify-content: space-between;

    select {
      min-width: 86px;
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
