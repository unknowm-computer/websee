<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import AppDialog from '@/components/common/AppDialog.vue'
import SvgIcon from '@/components/common/SvgIcon.vue'
import { createFileDetailsWorker, readSvgDetails, type FileDetails, type FileDetailsRequest } from '@/services/fileDetails'
import type { MediaItem, PlayableItem } from '@/types/media'
import { formatBytes, formatDuration, getContentFileKind, isPlayableItem } from '@/utils/media'

interface Props {
  item: MediaItem
  path: string
  loadFile: (item: MediaItem) => Promise<File>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'duration', item: PlayableItem, seconds: number): void
}>()

const kindLabels = { image: '이미지', text: '텍스트', audio: '음악', video: '동영상', archive: '압축파일' }
const kind = computed(() => getContentFileKind(props.item.name) ?? 'archive')
const details = shallowRef<FileDetails>()
const detailsStatus = ref('')

watch(() => props.item, async (item, _, onCleanup) => {
  details.value = undefined
  detailsStatus.value = ''
  const fileKind = kind.value
  if (fileKind === 'archive') return

  let active = true
  let worker: Worker | undefined
  onCleanup(() => {
    active = false
    worker?.terminate()
  })
  function finish(result: FileDetails | null): void {
    worker?.terminate()
    if (!active) return
    details.value = result ?? undefined
    if (isPlayableItem(item) && item.duration === undefined && result?.duration !== undefined) {
      emit('duration', item, result.duration)
    }
    detailsStatus.value = result?.fields.length ? '' : '추가 형식 정보를 확인할 수 없습니다.'
  }

  detailsStatus.value = '형식 정보를 읽는 중입니다…'
  try {
    const file = await props.loadFile(item)
    if (!active) return
    if (item.format === 'SVG') {
      finish(await readSvgDetails(file))
      return
    }
    worker = createFileDetailsWorker()
    worker.onmessage = (event: MessageEvent<FileDetails | null>) => finish(event.data)
    worker.onerror = () => finish(null)
    worker.postMessage({ file, kind: fileKind } satisfies FileDetailsRequest)
  } catch {
    finish(null)
  }
}, { immediate: true })

const numberFormat = new Intl.NumberFormat('ko-KR')
const modified = computed(() => new Date(props.item.lastModified).toLocaleString('ko-KR'))
const resolution = computed(() => {
  const width = props.item.width ?? details.value?.width
  const height = props.item.height ?? details.value?.height
  return width && height ? `${width} × ${height}` : '—'
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
        <dt>해상도</dt><dd>{{ resolution }}</dd>
      </template>
      <template v-if="isPlayableItem(item)">
        <dt>재생 시간</dt><dd>{{ formatDuration(item.duration ?? details?.duration) }}</dd>
      </template>
      <template v-for="field in details?.fields" :key="field.label">
        <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
      </template>
      <template v-if="detailsStatus">
        <dt>형식 정보</dt><dd role="status">{{ detailsStatus }}</dd>
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
