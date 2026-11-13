<script setup lang="ts">
import { ref, watch } from 'vue'

import PreviewPane from '@/components/common/PreviewPane.vue'
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
  <PreviewPane label="선택한 텍스트 미리보기" :file-name="item.name" :file-path="item.path">
    <div v-if="loading" class="preview-pane__state text-preview-pane__state notranslate" translate="no">
      <SvgIcon name="refresh" :size="28" class="loading-spin" />
      <small>텍스트를 읽는 중입니다...</small>
    </div>
    <div v-else-if="errorMessage" class="preview-pane__state text-preview-pane__state notranslate" translate="no">
      <SvgIcon name="docs" :size="28" />
      <small>{{ errorMessage }}</small>
    </div>
    <pre v-else class="text-preview-pane__body" translate="yes">{{ content?.text }}</pre>

    <template #metadata>
      {{ content?.encoding ?? '인코딩 확인 중' }}
      <template v-if="content?.truncated"> · 앞부분만 표시</template>
    </template>
  </PreviewPane>
</template>

<style lang="scss">
.text-preview-pane {
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
    color: var(--color-muted);
    background: #fff;
  }
}
</style>
