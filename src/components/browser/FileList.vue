<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import type { MediaItem } from '@/types/media'
import { formatBytes, getExtension } from '@/utils/media'

interface Props {
  items: MediaItem[]
  selectedId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'open', id: string): void
  (event: 'request-dimensions', item: MediaItem): void
}>()

const ROW_HEIGHT = 29
const OVERSCAN = 8

const container = ref<HTMLElement>()
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

function updateViewport(): void {
  viewportHeight.value = container.value?.clientHeight ?? 0
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

function scrollSelectedItemIntoView(selectedId?: string): void {
  if (!container.value || !selectedId) return

  const selectedIndex = props.items.findIndex((item) => item.id === selectedId)
  if (selectedIndex < 0) return

  const itemTop = selectedIndex * ROW_HEIGHT
  const itemBottom = itemTop + ROW_HEIGHT
  const viewportTop = container.value.scrollTop
  const viewportBottom = viewportTop + container.value.clientHeight

  if (itemTop < viewportTop) {
    container.value.scrollTop = itemTop
  } else if (itemBottom > viewportBottom) {
    container.value.scrollTop = itemBottom - container.value.clientHeight
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
</script>

<template>
  <div class="file-list">
    <div class="file-list__header" aria-hidden="true">
      <span>파일명</span>
      <span>크기</span>
      <span>형식</span>
      <span>해상도</span>
    </div>
    <div ref="container" class="file-list__body" tabindex="0" @scroll="handleScroll">
      <div class="file-list__track" :style="{ height: `${items.length * ROW_HEIGHT}px` }">
        <button
          v-for="entry in visibleItems"
          :key="entry.item.id"
          type="button"
          class="file-list__row"
          :class="{ 'is-selected': selectedId === entry.item.id }"
          :style="{ top: `${entry.top}px` }"
          :title="entry.item.path"
          @click="emit('select', entry.item.id)"
          @dblclick="emit('open', entry.item.id)"
          @keydown.enter.prevent.stop="emit('open', entry.item.id)"
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
          <span>
            {{ entry.item.kind === 'archive-parent' || entry.item.kind === 'folder' || entry.item.kind === 'folder-parent' ? '—' : formatBytes(entry.item.size) }}
          </span>
          <span>{{ entry.item.format }}</span>
          <span>
            {{ entry.item.width && entry.item.height
              ? `${entry.item.width} × ${entry.item.height}`
              : entry.item.kind === 'image' || (entry.item.kind === 'archive-entry' && selectedId === entry.item.id)
                ? '해상도 확인 중'
                : '—' }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.file-list {
  display: grid;
  grid-template-rows: 28px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: #fff;

  &__header,
  &__row {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 100px 92px 130px;
    align-items: center;
  }

  &__header {
    padding-right: 16px;
    font-weight: 700;
    background: var(--color-face);
    border-bottom: 1px solid var(--color-shadow-dark);

    span {
      height: 27px;
      padding: 5px 8px;
      border-right: 1px solid var(--color-shadow);
      box-shadow: inset 1px 1px var(--color-light);
    }
  }

  &__body {
    min-height: 0;
    overflow: auto;
  }

  &__track {
    position: relative;
    min-width: 620px;
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
