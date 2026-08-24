<script setup lang="ts">
import { computed } from 'vue'

import type { ImageTranslationProgress } from '@/types/imageTranslation'

interface Props {
  processing: boolean
  progress: ImageTranslationProgress
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'cancel'): void
  (event: 'close'): void
  (event: 'continue'): void
  (event: 'retry'): void
}>()

const progressPercent = computed(() => {
  const completed = props.progress.completed
  const total = props.progress.total
  if (completed === undefined || total === undefined || total <= 0) return undefined
  return Math.min(100, Math.max(0, Math.round(completed / total * 100)))
})
</script>

<template>
  <aside
    class="image-translation-status"
    aria-live="polite"
    @pointerdown.stop
    @dblclick.stop
    @wheel.stop
  >
    <strong>이미지 번역</strong>
    <p>{{ progress.message }}</p>
    <progress
      v-if="processing"
      :value="progress.completed"
      :max="progress.total"
      :aria-label="progress.message"
    />
    <span v-if="processing && progressPercent !== undefined" class="image-translation-status__percent">
      {{ progressPercent }}%
    </span>
    <div class="image-translation-status__actions">
      <button v-if="processing" type="button" @click="emit('cancel')">
        취소
      </button>
      <button v-if="progress.phase === 'error'" type="button" @click="emit('retry')">
        다시 시도
      </button>
      <button
        v-if="progress.phase === 'awaiting-translation'"
        type="button"
        @click="emit('continue')"
      >
        번역 계속
      </button>
      <button v-if="!processing" type="button" @click="emit('close')">
        닫기
      </button>
    </div>
  </aside>
</template>

<style lang="scss">
.image-translation-status {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px 10px;
  width: min(390px, calc(100% - 24px));
  padding: 10px;
  color: var(--color-window-text);
  background: var(--color-face);
  border: 1px solid;
  border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
    var(--color-light);
  box-shadow: 2px 2px 8px rgb(0 0 0 / 42%);

  strong,
  p,
  progress,
  &__actions {
    grid-column: 1 / -1;
  }

  p {
    margin: 0;
    color: inherit;
  }

  progress {
    width: 100%;
    height: 14px;
  }

  &__percent {
    grid-row: 3;
    grid-column: 2;
    align-self: center;
    min-width: 42px;
    text-align: right;
  }

  &__actions {
    display: flex;
    gap: 5px;
    justify-content: flex-end;

    button {
      min-height: 28px;
      padding: 3px 9px;
      color: inherit;
      background: var(--color-face);
      border: 1px solid;
      border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
        var(--color-light);

      &:active {
        border-color: var(--color-shadow-dark) var(--color-light) var(--color-light)
          var(--color-shadow-dark);
      }
    }
  }
}
</style>
