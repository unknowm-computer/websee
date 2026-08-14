<script setup lang="ts">
import type { MediaItem } from '@/types/media'
import { formatBytes } from '@/utils/media'

interface Props {
  item?: MediaItem
  imageCount: number
  taskStatus?: string
  totalCount: number
}

defineProps<Props>()
</script>

<template>
  <footer class="status-bar" aria-live="polite">
    <span class="status-bar__count">
      이미지 {{ imageCount }}개 / 전체 {{ totalCount }}개
      <template v-if="taskStatus"> · {{ taskStatus }}</template>
    </span>
    <template v-if="item">
      <span class="status-bar__name" :title="item.path">{{ item.name }}</span>
      <span>
        {{ item.kind === 'archive-parent' || item.kind === 'folder' || item.kind === 'folder-parent' ? '—' : formatBytes(item.size) }}
      </span>
      <span>{{ item.format }}</span>
      <span>
        {{ item.width && item.height ? `${item.width} × ${item.height}` : item.kind === 'image' || item.kind === 'archive-entry' ? '해상도 확인 중' : '—' }}
      </span>
    </template>
    <span v-else class="status-bar__empty">선택한 항목 없음</span>
  </footer>
</template>

<style lang="scss">
.status-bar {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto auto auto;
  gap: 2px;
  min-height: 25px;
  padding: 2px;
  background: var(--color-face);
  border-top: 1px solid var(--color-light);

  > span {
    min-width: 72px;
    padding: 3px 7px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid;
    border-color: var(--color-shadow) var(--color-light) var(--color-light) var(--color-shadow);
  }

  &__count {
    min-width: 190px !important;
  }

  &__empty {
    grid-column: 2 / -1;
    color: var(--color-muted);
  }
}

@media (max-width: 680px) {
  .status-bar {
    grid-template-columns: minmax(90px, auto) 1fr auto;

    > span:nth-last-child(2),
    > span:nth-last-child(1) {
      display: none;
    }
  }
}
</style>
