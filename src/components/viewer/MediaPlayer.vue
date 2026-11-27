<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AppDialog from '@/components/common/AppDialog.vue'
import SvgIcon from '@/components/common/SvgIcon.vue'
import type { PlayableItem } from '@/types/media'
import { formatBytes, getMediaMimeType } from '@/utils/media'

interface Props {
  item: PlayableItem
  expanded: boolean
  deferPreview: boolean
  loadFile: (item: PlayableItem) => Promise<File>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'metadata', item: PlayableItem, media: HTMLMediaElement): void
}>()

const player = ref<HTMLMediaElement>()
const source = ref('')
const error = ref('')
const requested = ref(false)
const maximized = ref(false)
const canLoad = computed(() => !props.deferPreview || requested.value)
const frameProps = computed(() => props.expanded
  ? {
      title: props.item.name,
      panelClass: `media-player media-player--${props.item.kind}${maximized.value ? ' media-player--maximized' : ''}`,
      closeLabel: '플레이어 닫기',
      closeOnBackdropClick: false,
    }
  : { class: 'media-player-preview' })
let position = 0

function stopPlayer(): void {
  const media = player.value
  if (!media) return
  media.pause()
  media.removeAttribute('src')
  media.load()
}

watch(() => props.expanded, (expanded) => {
  if (expanded) requested.value = true
  else maximized.value = false
  if (player.value) {
    position = player.value.ended ? 0 : player.value.currentTime
    stopPlayer()
  }
}, { immediate: true })

watch([() => props.item, canLoad], ([item, allowed], _, onCleanup) => {
  position = 0
  error.value = ''
  source.value = ''
  if (!allowed) return

  let active = true
  let url = ''
  async function load(): Promise<void> {
    try {
      const file = await props.loadFile(item)
      if (!active) return
      const type = getMediaMimeType(file.name)
      url = URL.createObjectURL(file.type === type ? file : file.slice(0, file.size, type))
      source.value = url
    } catch {
      if (active) error.value = '파일을 읽을 수 없습니다. 파일을 다시 열어주세요.'
    }
  }

  // Allow keyboard navigation past an archive entry without extracting every file.
  const timer = item.archiveEntryPath && !props.expanded
    ? window.setTimeout(load, 160)
    : undefined
  if (timer === undefined) void load()
  onCleanup(() => {
    active = false
    window.clearTimeout(timer)
    if (url) URL.revokeObjectURL(url)
  })
}, { immediate: true })

function handleMetadata(event: Event): void {
  const media = event.currentTarget
  if (!(media instanceof HTMLMediaElement)) return
  emit('metadata', props.item, media)
  if (position > 0 && position < media.duration) media.currentTime = position
  if (props.expanded && media.closest('dialog')?.contains(document.activeElement)) media.focus()
}

onBeforeUnmount(stopPlayer)
</script>

<template>
  <component :is="expanded ? AppDialog : 'div'" v-bind="frameProps" @close="emit('close')">
    <template #title-actions>
      <button
        v-if="item.kind === 'video'"
        type="button"
        class="action-button"
        aria-label="팝업 최대화"
        :aria-pressed="maximized"
        :title="maximized ? '원래 크기로 복원' : '팝업 최대화'"
        @click="maximized = !maximized"
      >
        <SvgIcon :name="maximized ? 'fullscreen-exit' : 'fullscreen'" :size="16" />
      </button>
    </template>
    <button v-if="!canLoad" type="button" class="action-button" @click="requested = true">
      미리보기 불러오기
    </button>
    <p v-else-if="error" class="media-player__message" role="alert">{{ error }}</p>
    <component
      :is="item.kind"
      v-else-if="source"
      ref="player"
      class="media-player__controls"
      :src="source"
      :aria-label="item.name"
      controls
      :autoplay="expanded"
      :preload="expanded || item.kind === 'video' ? 'auto' : 'metadata'"
      playsinline
      tabindex="0"
      @loadedmetadata="handleMetadata"
      @durationchange="emit('metadata', item, $event.currentTarget as HTMLMediaElement)"
      @error="error = '이 파일을 재생할 수 없습니다. 지원하지 않는 코덱이거나 파일이 손상되었을 수 있습니다.'"
    />
    <p v-else class="media-player__message" role="status">파일을 여는 중입니다…</p>
    <template #actions>{{ item.format }} · {{ formatBytes(item.size) }}</template>
  </component>
</template>

<style lang="scss">
.media-player-preview {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  overflow: auto;

  > video {
    width: 100%;
    height: 100%;
    min-height: 0;
    object-fit: contain;
    background: #000;
  }

  > audio {
    width: 100%;
  }
}

.media-player {
  width: min(850px, 100%);
  min-width: 0;

  &--audio {
    width: min(420px, 100%);
  }

  .app-dialog__title {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .app-dialog__footer {
    justify-content: flex-start;
    color: var(--color-muted);
    font-size: 12px;
  }

  &__controls {
    display: block;
  }

  > video,
  > audio {
    width: 100%;
    max-height: 75dvh;
  }

  > video {
    background: #000;
  }

  > audio {
    padding: 0 8px;
    margin-top: 8px;
  }

  &__message {
    margin: 8px;
  }

  &--maximized {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;

    > video {
      min-height: 0;
      height: 100%;
      max-height: none;
      object-fit: contain;
    }
  }
}
</style>
