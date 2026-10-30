<script setup lang="ts">
import { computed } from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import type { BatchTranslationState } from '@/types/batchTranslation'
import type { TranslationEngineId } from '@/types/translationEngine'

interface Props {
  state: BatchTranslationState
  translationEngine: TranslationEngineId
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'continue'): void
  (event: 'open'): void
}>()

const requiresAction = computed(() => props.state.phase === 'awaiting-translation')
const statusTitle = computed(() => {
  switch (props.state.phase) {
    case 'requesting-permission':
      return '일괄 번역 준비 중'
    case 'awaiting-translation':
      return '번역 모델 준비 필요'
    case 'pausing':
      return '일시정지 준비 중'
    case 'paused':
      return '일괄 번역 일시정지'
    case 'stopping':
      return '일괄 번역 중지 중'
    default:
      return '일괄 번역 진행 중'
  }
})
const processedLabel = computed(() => {
  const { discovered, processed } = props.state.counts
  return discovered > 0 ? `${processed} / ${discovered}` : '전체 확인 중'
})

function handleAction(): void {
  if (requiresAction.value && props.translationEngine === 'chrome') {
    emit('continue')
    return
  }
  emit('open')
}
</script>

<template>
  <aside
    class="batch-translation-mini-status"
    :class="{ 'is-attention': requiresAction }"
    :role="requiresAction ? 'alert' : 'status'"
    :aria-live="requiresAction ? 'assertive' : 'polite'"
    aria-atomic="true"
  >
    <SvgIcon
      :name="requiresAction ? 'download-for-offline' : 'auto'"
      :size="20"
    />
    <strong>{{ statusTitle }}</strong>
    <button
      type="button"
      :class="{ 'is-primary': requiresAction }"
      @click="handleAction"
    >
      {{ requiresAction ? translationEngine === 'apple' ? '준비 안내' : '모델 받기' : '열기' }}
    </button>
    <div class="batch-translation-mini-status__progress">
      <progress
        :value="state.counts.discovered ? state.counts.processed : undefined"
        :max="Math.max(1, state.counts.discovered)"
        :aria-label="`${processedLabel} 완료`"
      />
      <span>{{ processedLabel }}</span>
    </div>
  </aside>
</template>

<style lang="scss">
.batch-translation-mini-status {
  position: fixed;
  z-index: 170;
  right: 14px;
  bottom: 37px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
  width: min(320px, calc(100% - 28px));
  padding: 8px;
  color: var(--color-window-text);
  background: var(--color-face);
  border: 1px solid;
  border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
    var(--color-light);
  box-shadow: 3px 4px 12px rgb(0 0 0 / 34%);

  > .svg-icon {
    color: var(--color-icon);
  }

  > button {
    min-height: 25px;
    padding: 2px 8px;
    color: var(--color-window-text);
    background: var(--color-face);
    border: 1px solid;
    border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
      var(--color-light);

    &.is-primary {
      font-weight: 700;
      color: #fff;
      background: var(--color-selection);
    }
  }

  &__progress {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;

    progress {
      width: 100%;
      height: 12px;
    }

    span {
      min-width: 45px;
      color: var(--color-muted);
      text-align: right;
    }
  }

  &.is-attention {
    border-color: #a7832d;
    box-shadow: 0 0 0 2px #fff7db, 3px 4px 12px rgb(0 0 0 / 34%);

    > .svg-icon,
    > strong {
      color: #805d09;
    }
  }
}
</style>
