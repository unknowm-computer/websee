<script setup lang="ts">
import { computed } from 'vue'

import AppDialog from '@/components/common/AppDialog.vue'
import SvgIcon from '@/components/common/SvgIcon.vue'
import type { MediaItem } from '@/types/media'
import { formatBytes, getContentFileKind, isPlayableItem } from '@/utils/media'

interface Props {
  item: MediaItem
  path: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (event: 'close'): void
}>()

const kindLabels = { image: '이미지', text: '텍스트', audio: '음악', video: '동영상', archive: '압축파일' }
const kind = computed(() => getContentFileKind(props.item.name) ?? 'archive')
const numberFormat = new Intl.NumberFormat('ko-KR')
const modified = computed(() => new Date(props.item.lastModified).toLocaleString('ko-KR'))
const duration = computed(() => {
  const item = props.item
  if (!isPlayableItem(item) || item.duration === undefined) return '—'
  const seconds = Math.floor(item.duration)
  const minutes = Math.floor(seconds / 60)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${pad(minutes % 60)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`
})
</script>

<template>
  <AppDialog title="파일 상세 정보" panel-class="file-info-dialog" @close="emit('close')">
    <template #title-icon><SvgIcon name="info" :size="17" /></template>
    <dl class="file-info-dialog__fields">
      <dt>파일명</dt><dd>{{ item.name }}</dd>
      <dt>경로</dt><dd>{{ path }}</dd>
      <dt>형식</dt><dd>{{ kindLabels[kind] }} ({{ item.format }})</dd>
      <dt>크기</dt>
      <dd>
        {{ formatBytes(item.size) }}
        <template v-if="item.size >= 1024">({{ numberFormat.format(item.size) }}바이트)</template>
      </dd>
      <dt>{{ item.archiveEntryPath ? '압축파일 수정일' : '수정일' }}</dt><dd>{{ modified }}</dd>
      <template v-if="kind === 'image' || kind === 'video'">
        <dt>해상도</dt><dd>{{ item.width && item.height ? `${item.width} × ${item.height}` : '—' }}</dd>
      </template>
      <template v-if="isPlayableItem(item)">
        <dt>재생 시간</dt><dd>{{ duration }}</dd>
      </template>
    </dl>
  </AppDialog>
</template>

<style lang="scss">
.file-info-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(480px, 100%);
  max-height: 100%;

  &__fields {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px 16px;
    padding: 14px;
    margin: 0;
    overflow: auto;

    dt {
      color: var(--color-muted);
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
  }
}
</style>
