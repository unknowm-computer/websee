import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

export type MediaPaneResizeTarget = 'sidebar' | 'preview'

const SIDEBAR_STORAGE_KEY = 'websee-sidebar-width'
const PREVIEW_STORAGE_KEY = 'websee-preview-height'
const DEFAULT_SIDEBAR_WIDTH = 240
const DEFAULT_PREVIEW_HEIGHT = 210
const SIDEBAR_MIN_WIDTH = 170
const SIDEBAR_MAX_WIDTH = 520
const PREVIEW_MIN_HEIGHT = 120
const TREE_MIN_HEIGHT = 110
const SEPARATOR_SIZE = 6

function readStoredSize(key: string, fallback: number): number {
  const value = Number.parseFloat(localStorage.getItem(key) ?? '')
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function useResizableMediaPanes(container: Ref<HTMLElement | undefined>) {
  const sidebarWidth = ref(readStoredSize(SIDEBAR_STORAGE_KEY, DEFAULT_SIDEBAR_WIDTH))
  const previewHeight = ref(readStoredSize(PREVIEW_STORAGE_KEY, DEFAULT_PREVIEW_HEIGHT))
  const sidebarMaxWidth = ref(SIDEBAR_MAX_WIDTH)
  const previewMaxHeight = ref(DEFAULT_PREVIEW_HEIGHT)
  const resizing = ref<MediaPaneResizeTarget>()
  let dragStartPoint = 0
  let dragStartSize = 0
  let activeSeparator: HTMLElement | undefined

  const paneStyle = computed<Record<string, string>>(() => ({
    '--sidebar-width': `${Math.round(sidebarWidth.value)}px`,
    '--preview-height': `${Math.round(previewHeight.value)}px`,
  }))

  function clampSizes(): void {
    const element = container.value
    if (!element) return

    sidebarMaxWidth.value = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, element.clientWidth - 280),
    )
    previewMaxHeight.value = Math.max(
      PREVIEW_MIN_HEIGHT,
      element.clientHeight - TREE_MIN_HEIGHT - SEPARATOR_SIZE,
    )
    sidebarWidth.value = clamp(sidebarWidth.value, SIDEBAR_MIN_WIDTH, sidebarMaxWidth.value)
    previewHeight.value = clamp(previewHeight.value, PREVIEW_MIN_HEIGHT, previewMaxHeight.value)
  }

  function setPaneSize(target: MediaPaneResizeTarget, value: number): void {
    if (target === 'sidebar') {
      sidebarWidth.value = clamp(value, SIDEBAR_MIN_WIDTH, sidebarMaxWidth.value)
    } else {
      previewHeight.value = clamp(value, PREVIEW_MIN_HEIGHT, previewMaxHeight.value)
    }
  }

  function startResize(target: MediaPaneResizeTarget, event: PointerEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    resizing.value = target
    dragStartPoint = target === 'sidebar' ? event.clientX : event.clientY
    dragStartSize = target === 'sidebar' ? sidebarWidth.value : previewHeight.value
    activeSeparator = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
    activeSeparator?.setPointerCapture(event.pointerId)
  }

  function resize(event: PointerEvent): void {
    if (!resizing.value) return
    const currentPoint = resizing.value === 'sidebar' ? event.clientX : event.clientY
    const delta = currentPoint - dragStartPoint
    setPaneSize(
      resizing.value,
      resizing.value === 'sidebar' ? dragStartSize + delta : dragStartSize - delta,
    )
  }

  function endResize(event: PointerEvent): void {
    if (!resizing.value) return
    if (activeSeparator?.hasPointerCapture(event.pointerId)) {
      activeSeparator.releasePointerCapture(event.pointerId)
    }
    resizing.value = undefined
    activeSeparator = undefined
  }

  function resizeWithKeyboard(target: MediaPaneResizeTarget, event: KeyboardEvent): void {
    const step = event.shiftKey ? 32 : 12
    let delta = 0

    if (target === 'sidebar' && event.key === 'ArrowLeft') delta = -step
    if (target === 'sidebar' && event.key === 'ArrowRight') delta = step
    if (target === 'preview' && event.key === 'ArrowUp') delta = step
    if (target === 'preview' && event.key === 'ArrowDown') delta = -step
    if (!delta) return

    event.preventDefault()
    event.stopPropagation()
    setPaneSize(target, (target === 'sidebar' ? sidebarWidth.value : previewHeight.value) + delta)
  }

  function resetPaneSize(target: MediaPaneResizeTarget): void {
    setPaneSize(
      target,
      target === 'sidebar' ? DEFAULT_SIDEBAR_WIDTH : DEFAULT_PREVIEW_HEIGHT,
    )
  }

  watch(
    container,
    (element, _, onCleanup) => {
      if (!element) return
      const observer = new ResizeObserver(clampSizes)
      observer.observe(element)
      clampSizes()
      onCleanup(() => observer.disconnect())
    },
    { flush: 'post' },
  )
  watch(sidebarWidth, (value) => localStorage.setItem(SIDEBAR_STORAGE_KEY, String(Math.round(value))))
  watch(previewHeight, (value) => localStorage.setItem(PREVIEW_STORAGE_KEY, String(Math.round(value))))

  onBeforeUnmount(() => {
    resizing.value = undefined
    activeSeparator = undefined
  })

  return {
    endResize,
    paneStyle,
    previewHeight,
    previewMaxHeight,
    resetPaneSize,
    resize,
    resizeWithKeyboard,
    resizing,
    sidebarMaxWidth,
    sidebarWidth,
    startResize,
    previewMinHeight: PREVIEW_MIN_HEIGHT,
    sidebarMinWidth: SIDEBAR_MIN_WIDTH,
  }
}
