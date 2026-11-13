<script setup lang="ts">
import { computed } from 'vue'

import PreviewPane from '@/components/common/PreviewPane.vue'
import SvgIcon from '@/components/common/SvgIcon.vue'
import type { MediaItem } from '@/types/media'

interface Props {
  archiveEntryReady?: boolean
  getUrl: (item: MediaItem) => string
  item?: MediaItem
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  archiveEntryReady: false,
  loading: false,
})

const emit = defineEmits<{
  (event: 'dimensions', item: MediaItem, width: number, height: number): void
}>()

const previewItem = computed(() => {
  if (props.item?.kind === 'image') return props.item
  if (props.item?.kind === 'archive-entry' && props.archiveEntryReady) return props.item
  return undefined
})
const emptyMessage = computed(() => {
  if (props.loading) {
    return props.item?.kind === 'archive-text-entry'
      ? '선택한 텍스트를 미리 보는 중입니다...'
      : '선택한 이미지를 미리 보는 중입니다...'
  }
  if (
    props.item?.kind === 'archive'
    || props.item?.kind === 'archive-parent'
  ) {
    return '압축파일을 열고 이미지를 선택하세요.'
  }
  if (props.item?.kind === 'archive-entry') return '이미지 미리보기를 표시할 수 없습니다.'
  if (props.item?.kind === 'archive-text-entry') return '텍스트 미리보기를 표시할 수 없습니다.'
  return '이미지 파일을 선택하세요.'
})

function handleImageLoad(event: Event): void {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement) || !previewItem.value) return
  emit('dimensions', previewItem.value, image.naturalWidth, image.naturalHeight)
}
</script>

<template>
  <PreviewPane
    label="선택한 이미지 미리보기"
    :file-name="previewItem?.name"
    :file-path="previewItem?.path"
  >
    <div v-if="previewItem" class="image-preview-pane__body">
      <img
        :src="getUrl(previewItem)"
        :alt="previewItem.name"
        draggable="false"
        decoding="async"
        @load="handleImageLoad"
      />
    </div>
    <div v-else class="preview-pane__state image-preview-pane__empty">
      <SvgIcon :name="loading ? 'refresh' : 'image'" :size="32" :class="{ 'loading-spin': loading }" />
      <small>{{ emptyMessage }}</small>
    </div>

    <template #metadata>
      {{ previewItem?.width && previewItem.height ? `${previewItem.width} × ${previewItem.height}` : '해상도 확인 중' }}
    </template>
  </PreviewPane>
</template>

<style lang="scss">
.image-preview-pane {
  &__body,
  &__empty {
    background-color: #686868;
    background-image: linear-gradient(45deg, rgb(255 255 255 / 4%) 25%, transparent 25%),
      linear-gradient(-45deg, rgb(255 255 255 / 4%) 25%, transparent 25%);
    background-size: 8px 8px;
  }

  &__body {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    padding: 8px;
    overflow: hidden;

    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      box-shadow: 1px 2px 5px rgb(0 0 0 / 35%);
    }
  }

  &__empty {
    color: #e3e3e3;

    > .svg-icon {
      color: #c8c8c8;
    }
  }
}
</style>
