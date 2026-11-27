<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import type { MediaItem, MediaListColumnKey, MediaListColumnVisibility, MediaSortKey } from '@/types/media'
import { formatBytes, getExtension, isPlayableItem } from '@/utils/media'

interface Props {
  items: MediaItem[]
  columns: MediaListColumnVisibility
  sortKey: MediaSortKey
  sortAscending: boolean
  selectedId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'open', id: string): void
  (event: 'set-sort', key: MediaSortKey): void
  (event: 'request-dimensions', item: MediaItem): void
}>()

const ROW_HEIGHT = 29
const OVERSCAN = 8
const NAME_COLUMN_MIN_WIDTH = 300
const columnDefinitions = [
  { key: 'name', label: '파일명', width: NAME_COLUMN_MIN_WIDTH },
  { key: 'size', label: '크기', width: 100 },
  { key: 'format', label: '형식', width: 92 },
  { key: 'resolution', label: '해상도', width: 130 },
  { key: 'modified', label: '수정일', width: 150 },
] as const satisfies ReadonlyArray<{ key: 'name' | MediaListColumnKey; label: string; width: number }>
const visibleColumns = computed(() =>
  columnDefinitions.filter(({ key }) => key === 'name' || props.columns[key]),
)

const container = ref<HTMLElement>()
const header = ref<HTMLElement>()
const scrollTop = ref(0)
const viewportHeight = ref(0)
let resizeObserver: ResizeObserver | undefined

const startIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN),
)
const endIndex = computed(() =>
  Math.min(
    props.items.length,
    Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN,
  ),
)
const visibleItems = computed(() =>
  props.items.slice(startIndex.value, endIndex.value).map((item, offset) => ({
    item,
    top: (startIndex.value + offset) * ROW_HEIGHT,
  })),
)
const gridTemplateColumns = computed(() =>
  visibleColumns.value.map(({ key, width }) => key === 'name' ? '1fr' : `${width}px`).join(' '),
)
const minimumTrackWidth = computed(() =>
  visibleColumns.value.reduce((total, column) => total + column.width, 0),
)

function updateViewport(): void {
  viewportHeight.value = Math.max(0, (container.value?.clientHeight ?? 0) - (header.value?.offsetHeight ?? 0))
}

function handleScroll(): void {
  scrollTop.value = container.value?.scrollTop ?? 0
}

function getFileIconLabel(item: MediaItem): string {
  const extension = getExtension(item.name)
  if (extension === 'jpeg') return 'JPG'
  if (extension === 'webp') return 'WEB'
  if (extension === 'avif') return 'AVF'
  return extension.slice(0, 3).toUpperCase()
}

function formatModifiedDate(item: MediaItem): string {
  if (
    item.kind === 'folder'
    || item.kind === 'folder-parent'
    || item.kind === 'archive-parent'
    || item.archiveEntryPath !== undefined
    || !item.lastModified
  ) return '—'

  const date = new Date(item.lastModified)
  if (Number.isNaN(date.getTime())) return '—'

  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function scrollSelectedItemIntoView(selectedId?: string): void {
  if (!container.value || !selectedId) return

  const selectedIndex = props.items.findIndex((item) => item.id === selectedId)
  if (selectedIndex < 0) return

  const itemTop = selectedIndex * ROW_HEIGHT
  const itemBottom = itemTop + ROW_HEIGHT
  const viewportTop = container.value.scrollTop
  const viewportBottom = viewportTop + viewportHeight.value

  if (itemTop < viewportTop) {
    container.value.scrollTop = itemTop
  } else if (itemBottom > viewportBottom) {
    container.value.scrollTop = itemBottom - viewportHeight.value
  }
}

function requestVisibleDimensions(): void {
  for (const { item } of visibleItems.value) {
    if (item.kind === 'image' && (!item.width || !item.height)) {
      emit('request-dimensions', item)
    }
  }
}

watch(
  () => props.items,
  () => {
    if (container.value) container.value.scrollTop = 0
    scrollTop.value = 0
  },
)

watch(
  visibleItems,
  requestVisibleDimensions,
)

watch(
  () => props.selectedId,
  scrollSelectedItemIntoView,
)

onMounted(() => {
  updateViewport()
  requestVisibleDimensions()
  resizeObserver = new ResizeObserver(updateViewport)
  if (container.value) resizeObserver.observe(container.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

const viewportItems = computed(() => props.items.slice(
  Math.floor(scrollTop.value / ROW_HEIGHT),
  Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT),
))
defineExpose({ viewportItems })
</script>

<template>
  <div ref="container" class="file-list" tabindex="0" @scroll="handleScroll">
    <div
      ref="header"
      class="file-list__header"
      :style="{ gridTemplateColumns, minWidth: `${minimumTrackWidth}px` }"
      role="group"
      aria-label="파일 목록 정렬"
    >
      <template v-for="column in visibleColumns" :key="column.key">
        <span v-if="column.key === 'resolution'" class="file-list__heading">{{ column.label }}</span>
        <button
          v-else
          type="button"
          class="file-list__heading file-list__sort"
          @click="emit('set-sort', column.key)"
          @keydown.enter.stop
        >
          {{ column.label }}
          <template v-if="sortKey === column.key">
            <SvgIcon :name="sortAscending ? 'arrow-up' : 'arrow-down'" :size="16" />
            <span class="visually-hidden">{{ sortAscending ? '오름차순' : '내림차순' }}</span>
          </template>
        </button>
      </template>
    </div>
    <div
      class="file-list__track"
      :style="{
        height: `${items.length * ROW_HEIGHT}px`,
        minWidth: `${minimumTrackWidth}px`,
      }"
    >
      <button
        v-for="entry in visibleItems"
        :key="entry.item.id"
        type="button"
        class="file-list__row"
        :class="{ 'is-selected': selectedId === entry.item.id }"
        :style="{ top: `${entry.top}px`, gridTemplateColumns }"
        :title="entry.item.path"
        @click="emit('select', entry.item.id)"
        @dblclick="emit('open', entry.item.id)"
      >
        <span class="file-list__name">
          <span
            v-if="entry.item.kind === 'image' || entry.item.kind === 'archive-entry'"
            class="file-list__typed-file-icon"
            aria-hidden="true"
          >
            <SvgIcon name="file" :size="18" />
            <small><span>{{ getFileIconLabel(entry.item) }}</span></small>
          </span>
          <SvgIcon
            v-else-if="entry.item.kind === 'text' || entry.item.kind === 'archive-text-entry'"
            name="docs"
            :size="18"
          />
          <SvgIcon v-else-if="isPlayableItem(entry.item)" :name="entry.item.kind" :size="18" />
          <SvgIcon
            v-else
            :name="entry.item.kind === 'archive'
              ? 'folder-zip'
              : entry.item.kind === 'archive-parent' || entry.item.kind === 'folder-parent'
                ? 'folder-open'
                : entry.item.kind === 'folder'
                ? 'folder'
                : 'image'"
            :size="18"
          />
          {{ entry.item.name }}
        </span>
        <span v-if="columns.size">
          {{ entry.item.kind === 'archive-parent' || entry.item.kind === 'folder' || entry.item.kind === 'folder-parent' ? '—' : formatBytes(entry.item.size) }}
        </span>
        <span v-if="columns.format">{{ entry.item.format }}</span>
        <span v-if="columns.resolution">
          {{ entry.item.width && entry.item.height
            ? `${entry.item.width} × ${entry.item.height}`
            : entry.item.kind === 'image' || (entry.item.kind === 'archive-entry' && selectedId === entry.item.id)
              ? '해상도 확인 중'
              : '—' }}
        </span>
        <span v-if="columns.modified">{{ formatModifiedDate(entry.item) }}</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss">
.file-list {
  --file-list-header-height: 28px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scroll-padding-top: var(--file-list-header-height);
  background: #fff;

  &__header,
  &__row {
    display: grid;
    align-items: center;
  }

  &__header {
    position: sticky;
    top: 0;
    z-index: 1;
    height: var(--file-list-header-height);
    font-weight: 700;
    background: var(--color-face);
    border-bottom: 1px solid var(--color-shadow-dark);
  }

  &__heading {
    display: flex;
    gap: 4px;
    align-items: center;
    height: 100%;
    padding: 0 8px;
    color: inherit;
    background: transparent;
    border: 0;
    border-right: 1px solid var(--color-shadow);
    box-shadow: inset 1px 1px var(--color-light);
  }

  &__sort {
    &:enabled { cursor: pointer; }

    &:hover {
      background: var(--color-highlight);
    }

    &:active {
      background: var(--color-pressed);
      box-shadow: inset 1px 1px var(--color-shadow);
    }
  }

  &__track {
    position: relative;
  }

  &__row {
    position: absolute;
    left: 0;
    width: 100%;
    height: 29px;
    padding: 0;
    font: inherit;
    color: var(--color-window-text);
    text-align: left;
    background: #fff;
    border: 0;
    border-bottom: 1px solid #ececec;

    > span {
      padding: 4px 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:nth-child(even) {
      background: #fafafa;
    }

    &:hover {
      background: var(--color-highlight);
    }

    &.is-selected {
      color: #fff;
      background: var(--color-selection);
      outline: 1px dotted #fff;
      outline-offset: -3px;
    }
  }

  &__name {
    display: flex;
    gap: 7px;
    align-items: center;

    .svg-icon {
      color: inherit;
    }
  }

  &__typed-file-icon {
    position: relative;
    display: inline-grid;
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    place-items: center;

    small {
      position: absolute;
      right: 0;
      bottom: 1px;
      left: 1px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 8px;
      overflow: hidden;
      color: var(--color-window-text);
      text-align: center;
      background: #fff;
      border: 1px solid var(--color-window-text);

      span {
        font: 700 8px/1 Arial, sans-serif;
        white-space: nowrap;
        letter-spacing: -0.4px;
        transform: scale(0.75);
        transform-origin: center;
      }
    }
  }

  &__row.is-selected &__typed-file-icon small {
    color: #fff;
    background: #153f9f;
    border-color: #fff;
  }
}
</style>
