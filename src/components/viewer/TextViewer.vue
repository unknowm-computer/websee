<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import {
  readTextFile,
  TEXT_VIEWER_MAX_BYTES,
  type TextFileContent,
} from '@/services/textFile'
import type { MediaItem } from '@/types/media'
import { formatBytes } from '@/utils/media'

interface Props {
  item: MediaItem
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const root = ref<HTMLElement>()
const contentElement = ref<HTMLElement>()
const content = ref<TextFileContent>()
const errorMessage = ref('')
const loading = ref(false)
let requestId = 0

const ARROW_SCROLL_STEP = 26

function handleKeydown(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return

  event.preventDefault()
  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
  contentElement.value?.scrollBy({
    top: direction * ARROW_SCROLL_STEP,
    behavior: 'auto',
  })
}

async function loadContent(item: MediaItem): Promise<void> {
  const currentRequestId = ++requestId
  content.value = undefined
  errorMessage.value = ''
  loading.value = true

  try {
    const nextContent = await readTextFile(item.file, TEXT_VIEWER_MAX_BYTES)
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
  (item) => void loadContent(item),
  { immediate: true },
)

onMounted(async () => {
  await nextTick()
  root.value?.focus()
})
</script>

<template>
  <section
    ref="root"
    class="text-viewer"
    tabindex="-1"
    aria-label="텍스트 상세보기"
    @keydown="handleKeydown"
    @keydown.enter.prevent.stop="emit('close')"
    @keydown.esc.prevent.stop="emit('close')"
  >
    <header class="text-viewer__toolbar">
      <strong :title="item.path">{{ item.name }}</strong>
      <button type="button" aria-label="텍스트 상세보기 닫기" @click="emit('close')">
        <SvgIcon name="close" :size="18" />
      </button>
    </header>

    <div v-if="loading" class="text-viewer__state">
      <SvgIcon name="refresh" :size="36" class="is-loading" />
      <strong>텍스트를 읽는 중입니다...</strong>
    </div>
    <div v-else-if="errorMessage" class="text-viewer__state">
      <SvgIcon name="docs" :size="36" />
      <strong>{{ errorMessage }}</strong>
    </div>
    <pre v-else ref="contentElement" class="text-viewer__content">{{ content?.text }}</pre>

    <footer>
      <span>{{ formatBytes(item.size) }}</span>
      <span>{{ item.format }}</span>
      <span>{{ content?.encoding ?? '인코딩 확인 중' }}</span>
      <span v-if="content?.truncated">파일이 커서 앞부분 5 MB만 표시합니다.</span>
    </footer>
  </section>
</template>

<style lang="scss">
.text-viewer {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  grid-template-rows: 36px minmax(0, 1fr) 27px;
  min-width: 0;
  min-height: 0;
  color: var(--color-window-text);
  background: var(--color-face);
  outline: none;

  &__toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 4px 10px;
    border-bottom: 1px solid var(--color-shadow-dark);
    box-shadow: inset 0 1px var(--color-light);

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    button {
      display: grid;
      flex: 0 0 28px;
      width: 28px;
      height: 27px;
      padding: 0;
      color: inherit;
      place-items: center;
      background: var(--color-face);
      border: 1px solid;
      border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
        var(--color-light);

      &:active {
        border-color: var(--color-shadow-dark) var(--color-light) var(--color-light)
          var(--color-shadow-dark);
      }
    }
  }

  &__content {
    min-width: 0;
    min-height: 0;
    padding: 20px 24px;
    margin: 0;
    overflow: auto;
    font: 16px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    tab-size: 4;
    background: #fff;
  }

  &__state {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    justify-content: center;
    color: var(--color-muted);
    background: #fff;

    .is-loading {
      animation: text-viewer-spin 0.8s linear infinite;
    }
  }

  footer {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-top: 1px solid var(--color-light);

    span {
      min-width: 90px;
      padding: 3px 7px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid;
      border-color: var(--color-shadow) var(--color-light) var(--color-light) var(--color-shadow);

      &:last-child {
        flex: 1;
      }
    }
  }
}

@keyframes text-viewer-spin {
  to {
    rotate: 360deg;
  }
}
</style>
