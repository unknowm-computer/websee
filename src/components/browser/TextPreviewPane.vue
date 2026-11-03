<script setup lang="ts">
import { ref, watch } from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import {
  readTextFile,
  TEXT_PREVIEW_MAX_BYTES,
  type TextFileContent,
} from '@/services/textFile'
import type { MediaItem } from '@/types/media'

interface Props {
  item: MediaItem
}

const props = defineProps<Props>()

const content = ref<TextFileContent>()
const errorMessage = ref('')
const loading = ref(false)
let requestId = 0

async function loadPreview(item: MediaItem): Promise<void> {
  const currentRequestId = ++requestId
  content.value = undefined
  errorMessage.value = ''
  loading.value = true

  try {
    const nextContent = await readTextFile(item.file, TEXT_PREVIEW_MAX_BYTES)
    if (currentRequestId === requestId) content.value = nextContent
  } catch {
    if (currentRequestId === requestId) {
      errorMessage.value = '텍스트 파일을 읽지 못했습니다.'
    }
  } finally {
    if (currentRequestId === requestId) loading.value = false
  }
}

watch(
  () => props.item,
  (item) => void loadPreview(item),
  { immediate: true },
)
</script>

<template>
  <section class="text-preview-pane" aria-label="선택한 텍스트 미리보기">
    <header class="notranslate" translate="no">미리보기</header>

    <div v-if="loading" class="text-preview-pane__state notranslate" translate="no">
      <SvgIcon name="refresh" :size="28" class="is-loading" />
      <small>텍스트를 읽는 중입니다...</small>
    </div>
    <div v-else-if="errorMessage" class="text-preview-pane__state notranslate" translate="no">
      <SvgIcon name="docs" :size="28" />
      <small>{{ errorMessage }}</small>
    </div>
    <pre v-else class="text-preview-pane__body" translate="yes">{{ content?.text }}</pre>

    <footer class="notranslate" translate="no">
      <strong :title="item.path">{{ item.name }}</strong>
      <span>
        {{ content?.encoding ?? '인코딩 확인 중' }}
        <template v-if="content?.truncated"> · 앞부분만 표시</template>
      </span>
    </footer>
  </section>
</template>

<style lang="scss">
.text-preview-pane {
  display: grid;
  grid-template-rows: 27px minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--color-face);

  header {
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-weight: 700;
    border-bottom: 1px solid var(--color-shadow-dark);
    box-shadow: inset 0 1px var(--color-light);
  }

  &__body {
    min-width: 0;
    min-height: 0;
    padding: 8px;
    margin: 0;
    overflow: auto;
    font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
    color: var(--color-window-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: #fff;
  }

  &__state {
    display: flex;
    flex-direction: column;
    gap: 7px;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    padding: 10px;
    color: var(--color-muted);
    text-align: center;
    background: #fff;

    .is-loading {
      animation: text-preview-spin 0.8s linear infinite;
    }
  }

  footer {
    display: grid;
    gap: 2px;
    padding: 5px 7px;
    border-top: 1px solid var(--color-shadow-dark);

    strong,
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      font-size: 11px;
      color: var(--color-muted);
    }
  }
}

@keyframes text-preview-spin {
  to {
    rotate: 360deg;
  }
}
</style>
