<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import type { MediaItem } from '@/types/media'

interface Props {
  items: MediaItem[]
  selectedId?: string
  getUrl: (item: MediaItem) => string
  getArchiveThumbnailUrl?: (item: MediaItem) => string | undefined
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'open', id: string): void
  (event: 'dimensions', item: MediaItem, width: number, height: number): void
}>()

const GAP = 8
const MIN_TILE_WIDTH = 132
const ROW_HEIGHT = 165
const OVERSCAN_ROWS = 3

const container = ref<HTMLElement>()
const containerWidth = ref(0)
const viewportHeight = ref(0)
const scrollTop = ref(0)
let resizeObserver: ResizeObserver | undefined

const columnCount = computed(() =>
  Math.max(1, Math.floor((containerWidth.value - GAP) / (MIN_TILE_WIDTH + GAP))),
)
const tileWidth = computed(() =>
  Math.max(MIN_TILE_WIDTH, (containerWidth.value - GAP * (columnCount.value + 1)) / columnCount.value),
)
const rowCount = computed(() => Math.ceil(props.items.length / columnCount.value))
const trackHeight = computed(() => rowCount.value * ROW_HEIGHT + GAP)
const startRow = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN_ROWS),
)
const endRow = computed(() =>
  Math.min(
    rowCount.value,
    Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN_ROWS,
  ),
)
const visibleItems = computed(() => {
  const startIndex = startRow.value * columnCount.value
  const endIndex = Math.min(props.items.length, endRow.value * columnCount.value)

  return props.items.slice(startIndex, endIndex).map((item, visibleIndex) => {
    const index = startIndex + visibleIndex
    const row = Math.floor(index / columnCount.value)
    const column = index % columnCount.value

    return {
      item,
      thumbnailUrl: item.kind === 'image'
        ? props.getUrl(item)
        : props.getArchiveThumbnailUrl?.(item),
      style: {
        left: `${GAP + column * (tileWidth.value + GAP)}px`,
        top: `${GAP + row * ROW_HEIGHT}px`,
        width: `${tileWidth.value}px`,
      },
    }
  })
})

function updateViewport(): void {
  if (!container.value) return
  containerWidth.value = container.value.clientWidth
  viewportHeight.value = container.value.clientHeight
}

function handleScroll(): void {
  scrollTop.value = container.value?.scrollTop ?? 0
}

function moveSelectionByKey(key: string): boolean {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return false
  const currentIndex = props.items.findIndex((item) => item.id === props.selectedId)
  if (currentIndex < 0) return false

  let nextIndex = currentIndex

  if (key === 'ArrowLeft' && currentIndex > 0) nextIndex -= 1
  if (key === 'ArrowRight' && currentIndex < props.items.length - 1) nextIndex += 1

  const verticalIndex = key === 'ArrowUp'
    ? currentIndex - columnCount.value
    : currentIndex + columnCount.value
  if (key === 'ArrowUp' && verticalIndex >= 0) nextIndex = verticalIndex
  if (key === 'ArrowDown' && verticalIndex < props.items.length) nextIndex = verticalIndex

  if (nextIndex !== currentIndex) emit('select', props.items[nextIndex].id)
  return true
}

function handleKeydown(event: KeyboardEvent): void {
  if (!moveSelectionByKey(event.key)) return
  event.preventDefault()
  event.stopPropagation()
}

function scrollSelectedItemIntoView(selectedId?: string): void {
  if (!container.value || !selectedId) return

  const selectedIndex = props.items.findIndex((item) => item.id === selectedId)
  if (selectedIndex < 0) return

  const row = Math.floor(selectedIndex / columnCount.value)
  const itemTop = GAP + row * ROW_HEIGHT
  const itemBottom = itemTop + ROW_HEIGHT - GAP
  const viewportTop = container.value.scrollTop
  const viewportBottom = viewportTop + container.value.clientHeight

  if (itemTop < viewportTop) {
    container.value.scrollTop = itemTop
  } else if (itemBottom > viewportBottom) {
    container.value.scrollTop = itemBottom - container.value.clientHeight
  }
}

function handleImageLoad(event: Event, item: MediaItem): void {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement) || item.kind !== 'image') return
  emit('dimensions', item, image.naturalWidth, image.naturalHeight)
}

watch(
  () => props.items,
  async () => {
    await nextTick()
    if (container.value) container.value.scrollTop = 0
    scrollTop.value = 0
  },
)

watch(
  () => props.selectedId,
  scrollSelectedItemIntoView,
)

onMounted(() => {
  updateViewport()
  resizeObserver = new ResizeObserver(updateViewport)
  if (container.value) resizeObserver.observe(container.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

defineExpose({ moveSelectionByKey })
</script>

<template>
  <div
    ref="container"
    class="thumbnail-grid"
    tabindex="0"
    @scroll="handleScroll"
    @keydown="handleKeydown"
  >
    <div class="thumbnail-grid__track" :style="{ height: `${trackHeight}px` }">
      <button
        v-for="entry in visibleItems"
        :key="entry.item.id"
        type="button"
        class="thumbnail-grid__item"
        :class="{ 'is-selected': selectedId === entry.item.id }"
        :style="entry.style"
        :title="entry.item.path"
        @click="emit('select', entry.item.id)"
        @dblclick="emit('open', entry.item.id)"
      >
        <span
          class="thumbnail-grid__image-frame"
          :class="{
            'is-archive': entry.item.kind === 'archive',
            'is-archive-entry': entry.item.kind === 'archive-entry',
            'is-archive-parent': entry.item.kind === 'archive-parent',
            'is-folder': entry.item.kind === 'folder' || entry.item.kind === 'folder-parent',
            'is-text': entry.item.kind === 'text' || entry.item.kind === 'archive-text-entry',
          }"
        >
          <img
            v-if="entry.thumbnailUrl"
            :src="entry.thumbnailUrl"
            :alt="entry.item.name"
            draggable="false"
            decoding="async"
            @load="handleImageLoad($event, entry.item)"
          />
          <span v-else-if="entry.item.kind === 'archive'" class="thumbnail-grid__archive-icon" aria-hidden="true">
            <SvgIcon name="folder-zip" :size="58" />
            <i>{{ entry.item.format }}</i>
          </span>
          <span
            v-else-if="entry.item.kind === 'archive-parent' || entry.item.kind === 'folder' || entry.item.kind === 'folder-parent'"
            class="thumbnail-grid__folder-icon"
            aria-hidden="true"
          >
            <SvgIcon
              :name="entry.item.kind === 'folder' ? 'folder' : 'folder-open'"
              :size="64"
            />
          </span>
          <span v-else-if="entry.item.kind === 'text' || entry.item.kind === 'archive-text-entry'" class="thumbnail-grid__text-icon" aria-hidden="true">
            <SvgIcon name="docs" :size="58" />
          </span>
          <span v-else class="thumbnail-grid__entry-icon" aria-hidden="true">
            <SvgIcon name="image" :size="58" />
          </span>
        </span>
        <span class="thumbnail-grid__name">{{ entry.item.name }}</span>
        <span class="thumbnail-grid__meta">
          <template v-if="entry.item.kind === 'archive-parent' || entry.item.kind === 'folder-parent'">
            상위 폴더로
          </template>
          <template v-else-if="entry.item.kind === 'folder'">폴더</template>
          <template v-else>
            {{ entry.item.format }}
            <template v-if="entry.item.kind === 'archive'"> · 압축파일</template>
            <template v-else-if="entry.item.kind === 'text'"> · 텍스트</template>
            <template v-else-if="entry.item.kind === 'archive-text-entry'"> · 압축 텍스트</template>
            <template v-else-if="entry.item.kind === 'archive-entry'">
              · 압축 이미지
              <template v-if="entry.item.width && entry.item.height">
                · {{ entry.item.width }}×{{ entry.item.height }}
              </template>
            </template>
            <template v-else-if="entry.item.width && entry.item.height">
              · {{ entry.item.width }}×{{ entry.item.height }}
            </template>
          </template>
        </span>
      </button>
    </div>
  </div>
</template>

<style lang="scss">
.thumbnail-grid {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background-color: #f7f7f7;
  background-image: linear-gradient(45deg, #f2f2f2 25%, transparent 25%),
    linear-gradient(-45deg, #f2f2f2 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #f2f2f2 75%),
    linear-gradient(-45deg, transparent 75%, #f2f2f2 75%);
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  background-size: 8px 8px;

  &__track {
    position: relative;
    min-width: 100%;
  }

  &__item {
    position: absolute;
    display: grid;
    grid-template-rows: 102px 20px 17px;
    gap: 2px;
    height: 155px;
    padding: 5px;
    overflow: hidden;
    font: inherit;
    color: var(--color-window-text);
    text-align: center;
    background: transparent;
    border: 1px solid transparent;

    &:hover {
      background: rgb(212 225 245 / 55%);
      border-color: #a8b9d2;
    }

    &.is-selected {
      background: var(--color-highlight);
      border-color: var(--color-selection);
      outline: 1px dotted var(--color-selection-dark);
      outline-offset: -3px;
    }
  }

  &__image-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    overflow: hidden;
    background: #d9d9d9;
    border: 1px solid #8d8d8d;
    box-shadow: inset 0 0 0 3px #fff, 1px 1px 2px rgb(0 0 0 / 24%);

    img {
      max-width: calc(100% - 8px);
      max-height: 94px;
      object-fit: contain;
    }

    &.is-archive {
      background: #ece8d7;
      box-shadow: inset 0 0 0 3px #fff, 1px 1px 2px rgb(0 0 0 / 24%);
    }

    &.is-archive-entry {
      background: #e2e7ec;
      box-shadow: inset 0 0 0 3px #fff, 1px 1px 2px rgb(0 0 0 / 24%);
    }

    &.is-archive-parent {
      background: #e9e6d7;
    }

    &.is-folder {
      background: #e9e6d7;
    }

    &.is-text {
      background: #eef1f5;
    }
  }

  &__archive-icon {
    display: flex;
    flex-direction: column;
    gap: 1px;
    align-items: center;
    font-weight: 700;
    color: inherit;

    i {
      font-size: 12px;
      font-style: normal;
      letter-spacing: 1px;
    }
  }

  &__entry-icon {
    color: inherit;
  }

  &__text-icon {
    color: inherit;
  }

  &__folder-icon {
    color: inherit;
  }

  &__name,
  &__meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__name {
    font-weight: 700;
  }

  &__meta {
    font-size: 11px;
    color: var(--color-muted);
  }
}
</style>
