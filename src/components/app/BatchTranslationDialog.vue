<script setup lang="ts">
import { computed, ref } from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import type {
  BatchTranslationOptions,
  BatchTranslationState,
} from '@/types/batchTranslation'

interface Props {
  archiveCount: number
  imageCount: number
  state: BatchTranslationState
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'continue'): void
  (event: 'pause'): void
  (event: 'resume'): void
  (event: 'start', options: BatchTranslationOptions): void
  (event: 'stop'): void
}>()

const includeArchives = ref(true)
const skipExisting = ref(true)

const active = computed(() => [
  'requesting-permission',
  'running',
  'awaiting-translation',
  'pausing',
  'paused',
  'stopping',
].includes(props.state.phase))
const terminal = computed(() => ['completed', 'stopped', 'error'].includes(props.state.phase))
const canStart = computed(() =>
  props.imageCount > 0 || (includeArchives.value && props.archiveCount > 0),
)
function start(): void {
  emit('start', {
    includeArchives: includeArchives.value,
    skipExisting: skipExisting.value,
  })
}

function handleBackdropClick(): void {
  if (!active.value) emit('close')
}
</script>

<template>
  <div class="dialog-backdrop" @click.self="handleBackdropClick">
    <section
      class="batch-translation-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-translation-title"
    >
      <header>
        <strong id="batch-translation-title">
          <SvgIcon name="auto" :size="19" />
          폴더 일괄 번역
        </strong>
        <button
          type="button"
          :aria-label="active ? '일괄 번역 창 숨기기' : '일괄 번역 창 닫기'"
          @click="emit('close')"
        >
          <SvgIcon name="close" :size="17" />
        </button>
      </header>

      <div class="batch-translation-dialog__body">
        <section v-if="!active" class="batch-translation-dialog__settings">
          <strong>{{ state.folderLabel || '현재 폴더' }}</strong>
          <label>
            <input type="checkbox" checked disabled />
            현재 폴더의 이미지 {{ imageCount }}개
          </label>
          <label>
            <input v-model="includeArchives" type="checkbox" :disabled="archiveCount === 0" />
            압축파일 {{ archiveCount }}개 내부 이미지 포함
          </label>
          <label>
            <input v-model="skipExisting" type="checkbox" />
            저장된 번역 결과가 있으면 건너뛰기
          </label>
          <p>하위 폴더는 포함하지 않습니다. 압축파일은 하나씩 열어 내부 이미지를 순서대로 처리합니다.</p>
          <p>시작할 때 원본 폴더의 쓰기 권한을 요청합니다.</p>
        </section>

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
          <span v-if="state.currentItemName" class="batch-translation-dialog__current">
            {{ state.currentItemName }}
          </span>
          <dl>
            <div><dt>발견</dt><dd>{{ state.counts.discovered }}</dd></div>
            <div><dt>완료</dt><dd>{{ state.counts.translated }}</dd></div>
            <div><dt>건너뜀</dt><dd>{{ state.counts.skipped }}</dd></div>
            <div><dt>실패</dt><dd>{{ state.counts.failed }}</dd></div>
          </dl>
          <details v-if="state.errors.length">
            <summary>처리하지 못한 항목 {{ state.errors.length }}개</summary>
            <ul>
              <li v-for="error in state.errors" :key="error">{{ error }}</li>
            </ul>
          </details>
        </section>

        <p v-if="active" class="batch-translation-dialog__note">
          바깥 영역이나 Esc로는 닫히지 않습니다. 창 숨기기를 눌러도 작업은 계속됩니다.
        </p>
      </div>

      <footer>
        <template v-if="active">
          <button
            v-if="state.phase === 'awaiting-translation'"
            type="button"
            @click="emit('continue')"
          >
            번역 계속
          </button>
          <button v-if="state.phase === 'running'" type="button" @click="emit('pause')">
            일시정지
          </button>
          <button v-if="state.phase === 'paused'" type="button" @click="emit('resume')">
            계속
          </button>
          <button
            type="button"
            :disabled="state.phase === 'stopping'"
            @click="emit('stop')"
          >
            {{ state.phase === 'stopping' ? '중지 중' : '중지' }}
          </button>
        </template>
        <button v-else type="button" :disabled="!canStart" @click="start">
          {{ terminal ? '다시 실행' : '시작' }}
        </button>
        <button type="button" @click="emit('close')">
          {{ active ? '창 숨기기' : '닫기' }}
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
  box-shadow: inset 1px 1px var(--color-light), 4px 5px 15px rgb(0 0 0 / 35%);

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
    padding: 16px;
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
    label {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    p {
      margin: 0;
      color: var(--color-muted);
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

  details {
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
    border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
      var(--color-light);

    &:disabled {
      color: var(--color-disabled);
    }
  }

  footer {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    padding: 0 12px 12px;
  }
}
</style>
