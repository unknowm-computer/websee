<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { requestDirectoryWritePermission } from '@/services/imageTranslation/translationSidecar'
import {
  deleteAllTranslationSidecars,
  deleteOrphanedTranslationSidecars,
  scanTranslationSidecars,
  type TranslationSidecarSummary,
} from '@/services/imageTranslation/translationSidecarManagement'
import { formatBytes } from '@/utils/media'

interface Props {
  directoryHandle?: FileSystemDirectoryHandle
  folderLabel: string
}

type TranslationDataAction = 'all' | 'orphans'

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'busy-change', busy: boolean): void
}>()

function emptySummary(): TranslationSidecarSummary {
  return { fileCount: 0, orphanBytes: 0, orphanCount: 0, totalBytes: 0 }
}

const summary = ref<TranslationSidecarSummary>(emptySummary())
const loading = ref(true)
const deleting = ref(false)
const message = ref('')
const failed = ref(false)
const pendingAction = ref<TranslationDataAction>()

const actionsDisabled = computed(() => !props.directoryHandle || loading.value || deleting.value)
const description = computed(() => {
  if (!props.directoryHandle) return '폴더 열기로 연 현재 폴더에서만 관리할 수 있습니다.'
  if (loading.value) return '저장된 번역 데이터를 확인하는 중입니다.'
  if (!summary.value.fileCount) return '저장된 번역 데이터가 없습니다.'

  const stored = `${summary.value.fileCount}개 JSON · ${formatBytes(summary.value.totalBytes)}`
  if (!summary.value.orphanCount) return stored
  return `${stored} · 사용하지 않는 데이터 ${summary.value.orphanCount}개 (${formatBytes(summary.value.orphanBytes)})`
})
const confirmationDescription = computed(() => {
  if (pendingAction.value === 'orphans') {
    return `원본 파일이 없는 번역 데이터 ${summary.value.orphanCount}개를 삭제합니다.`
  }
  return `'${props.folderLabel}'의 번역 데이터 ${summary.value.fileCount}개를 모두 삭제합니다.`
})

async function refresh(clearMessage = true): Promise<void> {
  const directoryHandle = props.directoryHandle
  loading.value = true
  failed.value = false
  if (clearMessage) message.value = ''
  if (!directoryHandle) {
    summary.value = emptySummary()
    loading.value = false
    return
  }

  try {
    summary.value = await scanTranslationSidecars(directoryHandle)
  } catch (error) {
    failed.value = true
    message.value = error instanceof Error
      ? error.message
      : '저장된 폴더 번역 데이터를 확인하지 못했습니다.'
  } finally {
    loading.value = false
  }
}

function requestAction(action: TranslationDataAction): void {
  message.value = ''
  failed.value = false
  pendingAction.value = action
}

async function confirmAction(): Promise<void> {
  const directoryHandle = props.directoryHandle
  const action = pendingAction.value
  if (!directoryHandle || !action || deleting.value) return

  deleting.value = true
  failed.value = false
  message.value = ''
  try {
    const permissionGranted = await requestDirectoryWritePermission(directoryHandle)
    if (!permissionGranted) throw new Error('현재 폴더의 쓰기 권한이 필요합니다.')

    if (action === 'orphans') {
      const deletedCount = await deleteOrphanedTranslationSidecars(directoryHandle)
      message.value = `사용하지 않는 번역 데이터 ${deletedCount}개를 삭제했습니다.`
    } else {
      await deleteAllTranslationSidecars(directoryHandle)
      message.value = '현재 폴더의 번역 데이터를 모두 삭제했습니다.'
    }
    pendingAction.value = undefined
    await refresh(false)
  } catch (error) {
    failed.value = true
    message.value = error instanceof Error
      ? error.message
      : '폴더 번역 데이터를 삭제하지 못했습니다.'
  } finally {
    deleting.value = false
  }
}

watch(() => props.directoryHandle, () => {
  pendingAction.value = undefined
  void refresh()
}, { immediate: true })
watch(deleting, (busy) => emit('busy-change', busy), { immediate: true })
onBeforeUnmount(() => emit('busy-change', false))
</script>

<template>
  <details class="translation-data-management">
    <summary>
      <span>현재 폴더 번역 데이터</span>
      <small v-if="!loading && summary.fileCount">
        {{ summary.fileCount }}개 · {{ formatBytes(summary.totalBytes) }}
      </small>
    </summary>
    <div class="translation-data-management__body">
      <p>
        <strong>{{ folderLabel }}</strong>의 <code>.websee</code>에 저장된 번역 결과를
        관리합니다. 압축파일은 내부 이미지가 여러 장이어도 JSON 하나로 셉니다.
      </p>
      <div class="translation-data-management__status">
        <span>{{ description }}</span>
        <div class="translation-data-management__actions">
          <button
            type="button"
            :disabled="actionsDisabled || summary.orphanCount === 0"
            @click="requestAction('orphans')"
          >
            사용하지 않는 데이터 정리
          </button>
          <button
            type="button"
            :disabled="actionsDisabled || summary.fileCount === 0"
            @click="requestAction('all')"
          >
            현재 폴더 데이터 삭제
          </button>
        </div>
      </div>

      <div
        v-if="pendingAction"
        class="translation-data-management__confirmation"
        role="alertdialog"
        aria-labelledby="translation-data-confirmation-title"
      >
        <strong id="translation-data-confirmation-title">삭제할까요?</strong>
        <span>{{ confirmationDescription }}</span>
        <div>
          <button type="button" :disabled="deleting" @click="confirmAction">
            {{ deleting ? '삭제 중' : '삭제' }}
          </button>
          <button type="button" :disabled="deleting" @click="pendingAction = undefined">
            취소
          </button>
        </div>
      </div>

      <p
        v-if="message"
        class="translation-data-management__message"
        :class="{ 'is-error': failed }"
        :role="failed ? 'alert' : 'status'"
      >
        {{ message }}
      </p>
      <p class="translation-data-management__note">
        사용하지 않는 데이터 정리는 원본 이미지나 압축파일이 사라진 JSON만 삭제합니다.
      </p>
    </div>
  </details>
</template>

<style lang="scss">
.translation-data-management {
  background: #fff;
  border: 1px solid var(--color-shadow);

  > summary {
    padding: 11px 12px;
    font-weight: 700;
    cursor: pointer;

    small {
      float: right;
      margin-left: 12px;
      font-size: inherit;
      font-weight: 400;
      color: var(--color-muted);
    }
  }

  &[open] > summary {
    border-bottom: 1px solid var(--color-shadow);
  }

  &__body {
    display: grid;
    gap: 10px;
    padding: 12px;

    p {
      margin: 0;
    }
  }

  &__status {
    display: grid;
    gap: 8px;
    padding: 9px;
    background: var(--color-face);
    border: 1px solid var(--color-shadow);
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    justify-content: flex-end;
  }

  &__confirmation {
    display: grid;
    gap: 7px;
    padding: 9px;
    background: #fff7db;
    border: 1px solid #a7832d;

    > div {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
  }

  &__message {
    color: #165e25;

    &.is-error {
      color: #8e2424;
    }
  }

  &__note {
    color: var(--color-muted);
  }

  code {
    font: inherit;
  }
}
</style>
