<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from "vue";

import SvgIcon from "@/components/common/SvgIcon.vue";
import ImageTranslationOverlay from "@/components/viewer/ImageTranslationOverlay.vue";
import ImageTranslationStatus from "@/components/viewer/ImageTranslationStatus.vue";
import ImageTranslationToast from "@/components/viewer/ImageTranslationToast.vue";
import { useImageTranslation } from "@/composables/useImageTranslation";
import {
  createImageEnhancementRenderer,
  isAnimatedGif,
  supportsImageEnhancement,
  type ImageEnhancementRenderer,
} from "@/services/imageEnhancement";
import type { ImageTranslationResult } from "@/types/imageTranslation";
import type { MediaItem } from "@/types/media";
import { formatBytes } from "@/utils/media";
import { calculateAnchoredPan } from "@/utils/viewerGeometry";
import {
  readViewerEnhancementPreference,
  readViewerTranslationOverlayPreference,
  readViewerZoomPreference,
  writeViewerEnhancementPreference,
  writeViewerTranslationOverlayPreference,
  writeViewerZoomPreference,
  type ViewerSlideshowPreference,
  type ViewerZoomMode,
} from "@/utils/viewerPreferences";

interface Props {
  currentId: string;
  deleteSavedTranslation?: (item: MediaItem) => Promise<boolean>;
  getUrl: (item: MediaItem) => string;
  refreshImage: (item: MediaItem) => Promise<boolean>;
  initialSlideshow?: boolean;
  items: MediaItem[];
  loadSavedTranslation?: (
    item: MediaItem,
  ) => Promise<ImageTranslationResult | undefined>;
  prepareTranslationPersistence?: (item: MediaItem) => Promise<boolean>;
  saveTranslation?: (
    item: MediaItem,
    result: ImageTranslationResult,
  ) => Promise<void>;
  slideshowPreference: ViewerSlideshowPreference;
  translationDisabled?: boolean;
  translationEnabled: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  initialSlideshow: false,
  translationDisabled: false,
});

const STAGE_PADDING = 16;
const TRANSLATION_LONG_PRESS_MS = 500;
const TRANSLATION_MENU_WIDTH = 238;
const WHEEL_LINE_SIZE = 16;

const emit = defineEmits<{
  (event: "close"): void;
  (event: "select", id: string): void;
  (event: "dimensions", item: MediaItem, width: number, height: number): void;
}>();

const root = ref<HTMLElement>();
const stage = ref<HTMLElement>();
const imageElement = ref<HTMLImageElement>();
const enhancementCanvas = ref<HTMLCanvasElement>();
const translationButton = ref<HTMLButtonElement>();
const translationMenu = ref<HTMLElement>();
const translationDeleteButton = ref<HTMLButtonElement>();
const translationMenuOpen = ref(false);
const translationDeleting = ref(false);
const translationMenuStyle = ref<CSSProperties>({});
const stageWidth = ref(0);
const stageHeight = ref(0);
const naturalWidth = ref(0);
const naturalHeight = ref(0);
const initialZoomPreference = readViewerZoomPreference(localStorage);
const scale = ref(initialZoomPreference.scale);
const rotation = ref(0);
const panX = ref(0);
const panY = ref(0);
const zoomMode = ref<ViewerZoomMode>(initialZoomPreference.mode);
const imageEnhancementEnabled = ref(
  readViewerEnhancementPreference(localStorage),
);
const imageEnhancementMode = ref<"original" | "webgl" | "css">("original");
const gifAnimationState = ref<
  "not-gif" | "checking" | "static" | "animated" | "unavailable"
>("not-gif");
const imageFailed = ref(false);
const imageRefreshing = ref(false);
const imageRevision = ref(0);
let refreshRequest = 0;
let preserveViewOnLoad = false;
const initialImageReady = ref(false);
const slideshowActive = ref(
  props.slideshowPreference.enabled && props.initialSlideshow,
);
const isFullscreen = ref(false);
const dragPointerId = ref<number>();
const {
  continueTranslation,
  deleteResult: deleteTranslationResult,
  dismissNotice: dismissTranslationNotice,
  dismissStatus: dismissTranslationStatus,
  notice: translationNotice,
  overlayVisible: translationOverlayVisible,
  processing: translationProcessing,
  progress: translationProgress,
  result: translationResult,
  selectItem: selectTranslationItem,
  statusVisible: translationStatusVisible,
  toggle: toggleImageTranslation,
  toggleOverlay: toggleTranslationOverlay,
} = useImageTranslation({
  deleteSavedResult: props.deleteSavedTranslation,
  initialOverlayVisible: readViewerTranslationOverlayPreference(localStorage),
  loadSavedResult: props.loadSavedTranslation,
  onOverlayVisibilityChange: (visible) =>
    writeViewerTranslationOverlayPreference(localStorage, visible),
  prepareResultPersistence: props.prepareTranslationPersistence,
  saveResult: props.saveTranslation,
});
let resizeObserver: ResizeObserver | undefined;
let slideshowTimer: number | undefined;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;
let imageEnhancementRenderer: ImageEnhancementRenderer | undefined;
let imageEnhancementRequest = 0;
let gifAnimationRequest = 0;
let translationLongPressTimer: number | undefined;
let suppressTranslationClick = false;

const currentIndex = computed(() =>
  Math.max(
    0,
    props.items.findIndex((item) => item.id === props.currentId),
  ),
);
const currentItem = computed(() => props.items[currentIndex.value]);
const currentItemIsGif = computed(
  () => currentItem.value?.format.toUpperCase() === "GIF",
);
const currentItemIsSvg = computed(
  () => currentItem.value?.format.toUpperCase() === "SVG",
);
const imageEnhancementSupported = computed(() => {
  if (!currentItem.value) return false;
  if (currentItemIsGif.value && gifAnimationState.value !== "static")
    return false;
  return supportsImageEnhancement(currentItem.value.format, false);
});
const imageEnhancementActive = computed(
  () => imageEnhancementEnabled.value && imageEnhancementSupported.value,
);
const canMovePrevious = computed(() => currentIndex.value > 0);
const canMoveNext = computed(() => currentIndex.value < props.items.length - 1);
const isRotatedSideways = computed(() => Math.abs(rotation.value % 180) === 90);
const displayWidth = computed(() =>
  isRotatedSideways.value ? naturalHeight.value : naturalWidth.value,
);
const displayHeight = computed(() =>
  isRotatedSideways.value ? naturalWidth.value : naturalHeight.value,
);
const availableStageWidth = computed(() =>
  Math.max(100, stageWidth.value - STAGE_PADDING * 2),
);
const availableStageHeight = computed(() =>
  Math.max(100, stageHeight.value - STAGE_PADDING * 2),
);
const maxPanX = computed(() =>
  Math.max(
    0,
    (displayWidth.value * scale.value - availableStageWidth.value) / 2,
  ),
);
const maxPanY = computed(() =>
  Math.max(
    0,
    (displayHeight.value * scale.value - availableStageHeight.value) / 2,
  ),
);
const canPan = computed(() => maxPanX.value > 0 || maxPanY.value > 0);
const imageTransform = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) rotate(${rotation.value}deg) scale(${scale.value})`,
}));
const imageLayerStyle = computed(() => ({
  ...imageTransform.value,
  width: `${naturalWidth.value}px`,
  height: `${naturalHeight.value}px`,
}));
const zoomPercent = computed(() => Math.round(scale.value * 100));
const hasTranslationResult = computed(
  () => translationResult.value?.itemId === currentItem.value?.id,
);
const translationButtonLabel = computed(() => {
  if (props.translationDisabled) return "일괄 번역 중";
  if (translationProcessing.value) return "번역 취소";
  if (translationProgress.value.phase === "awaiting-translation")
    return "번역 계속";
  if (!hasTranslationResult.value) return "번역";
  return "다시 번역";
});
const imageEnhancementButtonLabel = computed(() => {
  if (currentItemIsSvg.value)
    return "SVG에서는 화질 개선을 적용하지 않습니다";
  if (gifAnimationState.value === "checking")
    return "GIF 애니메이션 확인 중";
  if (gifAnimationState.value === "animated")
    return "움직이는 GIF에서는 화질 개선을 적용하지 않습니다";
  if (gifAnimationState.value === "unavailable")
    return "GIF 애니메이션을 확인할 수 없어 화질 개선을 적용하지 않습니다";
  return imageEnhancementEnabled.value ? "화질 개선 끄기" : "화질 개선 켜기";
});

function clearTranslationLongPressTimer(): void {
  if (translationLongPressTimer !== undefined) {
    window.clearTimeout(translationLongPressTimer);
  }
  translationLongPressTimer = undefined;
}

function updateTranslationMenuPosition(): void {
  const button = translationButton.value;
  const viewer = root.value;
  if (!button || !viewer) return;

  const buttonBounds = button.getBoundingClientRect();
  const viewerBounds = viewer.getBoundingClientRect();
  const maximumLeft = Math.max(
    6,
    viewerBounds.width - TRANSLATION_MENU_WIDTH - 6,
  );
  translationMenuStyle.value = {
    top: `${buttonBounds.bottom - viewerBounds.top + 3}px`,
    left: `${Math.min(maximumLeft, Math.max(6, buttonBounds.left - viewerBounds.left))}px`,
  };
}

async function openTranslationMenu(focusDeleteAction = false): Promise<void> {
  if (!currentItem.value || imageFailed.value || props.translationDisabled)
    return;
  clearTranslationLongPressTimer();
  translationMenuOpen.value = true;
  await nextTick();
  updateTranslationMenuPosition();
  if (focusDeleteAction) translationDeleteButton.value?.focus();
}

function closeTranslationMenu(restoreFocus = false): void {
  clearTranslationLongPressTimer();
  translationMenuOpen.value = false;
  if (restoreFocus) void nextTick(() => translationButton.value?.focus());
}

function startTranslationLongPress(event: PointerEvent): void {
  if (event.button !== 0) return;
  clearTranslationLongPressTimer();
  suppressTranslationClick = false;
  translationLongPressTimer = window.setTimeout(() => {
    translationLongPressTimer = undefined;
    suppressTranslationClick = true;
    void openTranslationMenu(true);
  }, TRANSLATION_LONG_PRESS_MS);
}

function finishTranslationLongPress(): void {
  clearTranslationLongPressTimer();
  if (suppressTranslationClick) {
    window.setTimeout(() => {
      suppressTranslationClick = false;
    }, 0);
  }
}

function handleTranslationButtonClick(): void {
  if (suppressTranslationClick) {
    suppressTranslationClick = false;
    return;
  }
  closeTranslationMenu();
  if (currentItem.value) toggleImageTranslation(currentItem.value);
}

function handleTranslationContextMenu(): void {
  void openTranslationMenu(true);
}

async function deleteCurrentTranslation(): Promise<void> {
  const item = currentItem.value;
  if (!item || !hasTranslationResult.value || translationDeleting.value) return;

  translationDeleting.value = true;
  await deleteTranslationResult(item);
  translationDeleting.value = false;
  closeTranslationMenu(true);
}

function handleWindowPointerDown(event: PointerEvent): void {
  if (!translationMenuOpen.value || !(event.target instanceof Node)) return;
  if (
    translationButton.value?.contains(event.target) ||
    translationMenu.value?.contains(event.target)
  )
    return;
  closeTranslationMenu();
}

function clampScale(value: number): number {
  return Math.min(16, Math.max(0.03, value));
}

function updateStageSize(): void {
  stageWidth.value = stage.value?.clientWidth ?? 0;
  stageHeight.value = stage.value?.clientHeight ?? 0;
  applyZoomMode();
}

function calculateFitScale(): number {
  if (!displayWidth.value || !displayHeight.value) return 1;
  return clampScale(
    Math.min(
      availableStageWidth.value / displayWidth.value,
      availableStageHeight.value / displayHeight.value,
    ),
  );
}

function clampPanValue(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

function setPan(nextX: number, nextY: number): void {
  panX.value = clampPanValue(nextX, maxPanX.value);
  panY.value = clampPanValue(nextY, maxPanY.value);
}

function clampPan(): void {
  setPan(panX.value, panY.value);
}

function applyZoomMode(resetPosition = false): void {
  if (!naturalWidth.value || !naturalHeight.value) return;

  if (zoomMode.value === "fit") scale.value = calculateFitScale();
  if (zoomMode.value === "width") {
    scale.value = clampScale(availableStageWidth.value / displayWidth.value);
  }
  if (zoomMode.value === "actual") scale.value = 1;

  if (zoomMode.value !== "custom" || resetPosition) {
    panX.value = 0;
    panY.value = maxPanY.value;
  }

  clampPan();
}

function persistZoomPreference(): void {
  writeViewerZoomPreference(localStorage, {
    mode: zoomMode.value,
    scale: scale.value,
  });
}

function setZoomMode(mode: Exclude<ViewerZoomMode, "custom">): void {
  zoomMode.value = mode;
  applyZoomMode();
  persistZoomPreference();
}

function changeZoomAroundAnchor(
  multiplier: number,
  anchor: { x: number; y: number },
): void {
  const previousScale = scale.value;
  const nextScale = clampScale(previousScale * multiplier);
  const nextPan = calculateAnchoredPan(
    { x: panX.value, y: panY.value },
    anchor,
    nextScale / previousScale,
  );

  zoomMode.value = "custom";
  scale.value = nextScale;
  setPan(nextPan.x, nextPan.y);
  persistZoomPreference();
}

function changeZoom(multiplier: number): void {
  changeZoomAroundAnchor(multiplier, { x: 0, y: 0 });
}

function changeZoomAtPointer(
  multiplier: number,
  clientX: number,
  clientY: number,
): void {
  const stageElement = stage.value;
  if (!stageElement) {
    changeZoom(multiplier);
    return;
  }

  const bounds = stageElement.getBoundingClientRect();
  const anchor = {
    x: clientX - bounds.left - bounds.width / 2,
    y: clientY - bounds.top - bounds.height / 2,
  };
  changeZoomAroundAnchor(multiplier, anchor);
}

function moveBy(delta: number): void {
  if (!props.items.length) return;
  const nextIndex = currentIndex.value + delta;
  if (nextIndex < 0 || nextIndex >= props.items.length) return;
  emit("select", props.items[nextIndex].id);
}

function rotateClockwise(): void {
  rotation.value = (rotation.value + 90) % 360;
  panX.value = 0;
  panY.value = 0;
  applyZoomMode();
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await root.value?.requestFullscreen();
  }
}

function handleFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement === root.value;
}

function disposeImageEnhancementRenderer(): void {
  imageEnhancementRenderer?.dispose();
  imageEnhancementRenderer = undefined;
}

async function updateGifAnimationState(item?: MediaItem): Promise<void> {
  const requestId = ++gifAnimationRequest;
  if (!item || item.format.toUpperCase() !== "GIF") {
    gifAnimationState.value = "not-gif";
    return;
  }

  gifAnimationState.value = "checking";
  try {
    const animated = isAnimatedGif(await item.file.arrayBuffer());
    if (requestId !== gifAnimationRequest || currentItem.value?.id !== item.id)
      return;

    gifAnimationState.value = animated ? "animated" : "static";
    if (!animated && imageEnhancementEnabled.value) {
      const image = imageElement.value;
      if (image?.complete && image.naturalWidth) {
        void renderImageEnhancement(image, item.id);
      }
    }
  } catch {
    if (requestId !== gifAnimationRequest || currentItem.value?.id !== item.id)
      return;
    gifAnimationState.value = "unavailable";
  }
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) =>
    window.requestAnimationFrame(() => resolve()),
  );
}

async function renderImageEnhancement(
  image: HTMLImageElement,
  itemId: string,
): Promise<void> {
  const requestId = ++imageEnhancementRequest;
  imageEnhancementMode.value = "original";
  await nextTick();
  await waitForAnimationFrame();

  if (
    requestId !== imageEnhancementRequest ||
    !imageEnhancementActive.value ||
    currentItem.value?.id !== itemId ||
    imageElement.value !== image
  )
    return;

  const canvas = enhancementCanvas.value;
  if (!canvas) return;

  imageEnhancementRenderer ??= createImageEnhancementRenderer(canvas);
  if (!imageEnhancementRenderer) {
    imageEnhancementMode.value = "css";
    return;
  }

  const result = imageEnhancementRenderer.render(image);
  if (
    requestId !== imageEnhancementRequest ||
    !imageEnhancementActive.value ||
    currentItem.value?.id !== itemId
  )
    return;

  if (result === "rendered") {
    imageEnhancementMode.value = "webgl";
    return;
  }

  if (result === "failed") {
    disposeImageEnhancementRenderer();
  }
  imageEnhancementMode.value = "css";
}

function toggleImageEnhancement(): void {
  if (!imageEnhancementSupported.value) return;

  imageEnhancementEnabled.value = !imageEnhancementEnabled.value;
  writeViewerEnhancementPreference(localStorage, imageEnhancementEnabled.value);
  imageEnhancementRequest += 1;

  if (!imageEnhancementEnabled.value) {
    disposeImageEnhancementRenderer();
    imageEnhancementMode.value = "original";
    return;
  }

  const image = imageElement.value;
  const item = currentItem.value;
  if (image?.complete && image.naturalWidth && item) {
    void renderImageEnhancement(image, item.id);
  }
}

function handleEnhancementContextLost(): void {
  imageEnhancementRequest += 1;
  imageEnhancementRenderer = undefined;
  imageEnhancementMode.value = imageEnhancementActive.value
    ? "css"
    : "original";
}

function handleEnhancementContextRestored(): void {
  imageEnhancementRenderer = undefined;
  const image = imageElement.value;
  const item = currentItem.value;
  if (
    imageEnhancementActive.value &&
    image?.complete &&
    image.naturalWidth &&
    item
  ) {
    void renderImageEnhancement(image, item.id);
  }
}

function handleImageLoad(event: Event): void {
  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement) || !currentItem.value) return;
  const loadedItemId = currentItem.value.id;
  imageFailed.value = false;
  naturalWidth.value = image.naturalWidth;
  naturalHeight.value = image.naturalHeight;
  emit(
    "dimensions",
    currentItem.value,
    image.naturalWidth,
    image.naturalHeight,
  );
  if (preserveViewOnLoad) {
    preserveViewOnLoad = false;
    clampPan();
  } else {
    applyZoomMode(true);
  }
  if (imageRefreshing.value) {
    imageRefreshing.value = false;
    syncSlideshowTimer();
  }
  if (imageEnhancementActive.value) {
    void renderImageEnhancement(image, loadedItemId);
  }
  if (!initialImageReady.value) void revealInitialImage(loadedItemId);
}

function handleImageError(): void {
  if (imageRefreshing.value) syncSlideshowTimer();
  imageRefreshing.value = false;
  preserveViewOnLoad = false;
  imageEnhancementRequest += 1;
  imageEnhancementMode.value = "original";
  imageFailed.value = true;
}

async function refreshCurrentImage(): Promise<void> {
  const item = currentItem.value;
  if (!item || imageRefreshing.value) return;
  const request = ++refreshRequest;
  imageRefreshing.value = true;
  stopSlideshowTimer();
  try {
    const refreshed = await props.refreshImage(item);
    if (request !== refreshRequest || currentItem.value?.id !== item.id) return;
    if (!refreshed) {
      imageRefreshing.value = false;
      return;
    }
    imageEnhancementRequest += 1;
    disposeImageEnhancementRenderer();
    imageEnhancementMode.value = "original";
    imageFailed.value = false;
    initialImageReady.value = false;
    preserveViewOnLoad = true;
    imageRevision.value += 1;
    selectTranslationItem(item, true);
    void updateGifAnimationState(item);
  } finally {
    if (request === refreshRequest && !preserveViewOnLoad) syncSlideshowTimer();
  }
}

async function revealInitialImage(itemId: string): Promise<void> {
  await nextTick();
  window.requestAnimationFrame(() => {
    if (currentItem.value?.id === itemId) initialImageReady.value = true;
  });
}

function normalizeWheelDelta(
  delta: number,
  deltaMode: number,
  pageSize: number,
): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * WHEEL_LINE_SIZE;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * pageSize;
  return delta;
}

function handleWheel(event: WheelEvent): void {
  if (event.ctrlKey) {
    changeZoomAtPointer(
      event.deltaY < 0 ? 1.12 : 0.88,
      event.clientX,
      event.clientY,
    );
    return;
  }

  const deltaX = normalizeWheelDelta(
    event.deltaX,
    event.deltaMode,
    availableStageWidth.value,
  );
  const deltaY = normalizeWheelDelta(
    event.deltaY,
    event.deltaMode,
    availableStageHeight.value,
  );
  const horizontalDelta = event.shiftKey && deltaX === 0 ? deltaY : deltaX;
  const verticalDelta = event.shiftKey ? 0 : deltaY;

  setPan(panX.value - horizontalDelta, panY.value - verticalDelta);
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0 || !canPan.value) return;
  dragPointerId.value = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragOriginX = panX.value;
  dragOriginY = panY.value;
  stage.value?.setPointerCapture(event.pointerId);
}

function drag(event: PointerEvent): void {
  if (dragPointerId.value !== event.pointerId) return;
  setPan(
    dragOriginX + event.clientX - dragStartX,
    dragOriginY + event.clientY - dragStartY,
  );
}

function endDrag(event: PointerEvent): void {
  if (dragPointerId.value !== event.pointerId) return;
  dragPointerId.value = undefined;
  stage.value?.releasePointerCapture(event.pointerId);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "F5") {
    event.preventDefault();
    event.stopPropagation();
    void refreshCurrentImage();
    return;
  }
  const eventTarget = event.target;
  if (eventTarget instanceof Element && eventTarget.closest(".dialog-backdrop"))
    return;

  if (eventTarget === translationButton.value && event.key === "ArrowDown")
    return;

  if (event.key === "Escape") {
    if (translationMenuOpen.value) {
      event.preventDefault();
      event.stopPropagation();
      closeTranslationMenu(true);
      return;
    }
    if (!document.fullscreenElement) emit("close");
    return;
  }

  if (
    eventTarget instanceof Element &&
    eventTarget.closest(".image-viewer__translation-menu")
  )
    return;

  const toggleEnhancementShortcut = event.code === "KeyE";
  const toggleTranslationShortcut = event.code === "KeyT";
  const rotateShortcut = event.code === "KeyR";
  const fullscreenShortcut = event.code === "KeyF";
  const canToggleImageEnhancement =
    Boolean(currentItem.value) &&
    imageEnhancementSupported.value &&
    !imageFailed.value;
  const canToggleTranslationOverlay =
    props.translationEnabled &&
    Boolean(translationResult.value?.regions.length);
  const handled =
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      " ",
      "+",
      "=",
      "-",
      "0",
      "1",
      "2",
    ].includes(event.key) ||
    rotateShortcut ||
    fullscreenShortcut ||
    (toggleEnhancementShortcut && canToggleImageEnhancement) ||
    (toggleTranslationShortcut && canToggleTranslationOverlay);
  if (handled) event.preventDefault();

  if (event.key === "ArrowLeft" || event.key === "ArrowUp") moveBy(-1);
  if (
    event.key === "ArrowRight" ||
    event.key === "ArrowDown" ||
    event.key === " "
  )
    moveBy(1);
  if (event.key === "+" || event.key === "=") changeZoom(1.2);
  if (event.key === "-") changeZoom(1 / 1.2);
  if (event.key === "0") setZoomMode("fit");
  if (event.key === "1") setZoomMode("actual");
  if (event.key === "2") setZoomMode("width");
  if (toggleEnhancementShortcut && canToggleImageEnhancement)
    toggleImageEnhancement();
  if (toggleTranslationShortcut && canToggleTranslationOverlay)
    toggleTranslationOverlay();
  if (rotateShortcut) rotateClockwise();
  if (fullscreenShortcut) void toggleFullscreen();
}

function stopSlideshowTimer(): void {
  if (slideshowTimer !== undefined) window.clearInterval(slideshowTimer);
  slideshowTimer = undefined;
}

function advanceSlideshow(): void {
  if (canMoveNext.value) {
    moveBy(1);
    return;
  }
  if (props.slideshowPreference.loop && props.items.length > 1) {
    emit("select", props.items[0].id);
    return;
  }
  slideshowActive.value = false;
}

function syncSlideshowTimer(): void {
  stopSlideshowTimer();
  if (!props.slideshowPreference.enabled || !slideshowActive.value) return;
  slideshowTimer = window.setInterval(
    advanceSlideshow,
    props.slideshowPreference.intervalSeconds * 1000,
  );
}

watch(
  [
    slideshowActive,
    () => props.slideshowPreference.enabled,
    () => props.slideshowPreference.intervalSeconds,
  ],
  () => {
    if (!props.slideshowPreference.enabled) slideshowActive.value = false;
    syncSlideshowTimer();
  },
);
watch(
  () => props.currentId,
  async () => {
    if (imageRefreshing.value) syncSlideshowTimer();
    refreshRequest += 1;
    imageRefreshing.value = false;
    preserveViewOnLoad = false;
    closeTranslationMenu();
    imageEnhancementRequest += 1;
    disposeImageEnhancementRenderer();
    imageEnhancementMode.value = "original";
    selectTranslationItem(currentItem.value);
    naturalWidth.value = currentItem.value?.width ?? 0;
    naturalHeight.value = currentItem.value?.height ?? 0;
    rotation.value = 0;
    panX.value = 0;
    panY.value = 0;
    imageFailed.value = false;
    void updateGifAnimationState(currentItem.value);
    await nextTick();
    applyZoomMode(true);
  },
);

selectTranslationItem(currentItem.value);
void updateGifAnimationState(currentItem.value);

onMounted(() => {
  window.addEventListener("keydown", handleKeydown, { capture: true });
  window.addEventListener("pointerdown", handleWindowPointerDown, {
    capture: true,
  });
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  resizeObserver = new ResizeObserver(updateStageSize);
  if (stage.value) resizeObserver.observe(stage.value);
  updateStageSize();
  syncSlideshowTimer();
  root.value?.focus();
});

onBeforeUnmount(() => {
  refreshRequest += 1;
  clearTranslationLongPressTimer();
  stopSlideshowTimer();
  imageEnhancementRequest += 1;
  gifAnimationRequest += 1;
  disposeImageEnhancementRenderer();
  resizeObserver?.disconnect();
  window.removeEventListener("keydown", handleKeydown, { capture: true });
  window.removeEventListener("pointerdown", handleWindowPointerDown, {
    capture: true,
  });
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
});
</script>

<template>
  <section
    ref="root"
    class="image-viewer"
    tabindex="-1"
    aria-label="이미지 뷰어"
  >
    <header
      class="image-viewer__toolbar"
      role="toolbar"
      aria-label="이미지 보기 도구"
    >
      <span class="image-viewer__align-left"></span>
      <button
        type="button"
        title="이전 이미지"
        aria-label="이전 이미지"
        :disabled="!canMovePrevious"
        @click="moveBy(-1)"
      >
        <SvgIcon name="arrow-left" :size="20" />
      </button>
      <strong>{{ currentIndex + 1 }} / {{ items.length }}</strong>
      <button
        type="button"
        title="다음 이미지"
        aria-label="다음 이미지"
        :disabled="!canMoveNext"
        @click="moveBy(1)"
      >
        <SvgIcon name="arrow-right" :size="20" />
      </button>
      <span class="image-viewer__separator" />
      <button
        type="button"
        title="축소 (-)"
        aria-label="축소"
        @click="changeZoom(1 / 1.2)"
      >
        <SvgIcon name="minus" :size="20" />
      </button>
      <span class="image-viewer__zoom">{{ zoomPercent }}%</span>
      <button
        type="button"
        title="확대 (+)"
        aria-label="확대"
        @click="changeZoom(1.2)"
      >
        <SvgIcon name="plus" :size="20" />
      </button>
      <button
        type="button"
        title="화면 맞춤 (0)"
        aria-label="화면 맞춤"
        :class="{ 'is-pressed': zoomMode === 'fit' }"
        @click="setZoomMode('fit')"
      >
        <SvgIcon name="fit-screen" :size="20" />
        <span class="image-viewer__button-label">화면 맞춤</span>
      </button>
      <button
        type="button"
        title="폭 맞춤 (2)"
        aria-label="폭 맞춤"
        :class="{ 'is-pressed': zoomMode === 'width' }"
        @click="setZoomMode('width')"
      >
        <SvgIcon name="fit-width" :size="20" />
        <span class="image-viewer__button-label">폭 맞춤</span>
      </button>
      <button
        type="button"
        title="실제 크기 (100%, 1)"
        aria-label="실제 크기 (100%)"
        :class="{ 'is-pressed': zoomMode === 'actual' }"
        @click="setZoomMode('actual')"
      >
        <SvgIcon name="real-size" :size="20" />
      </button>
      <span class="image-viewer__separator" />
      <button
        type="button"
        :title="`${imageEnhancementButtonLabel} (E)`"
        :aria-label="imageEnhancementButtonLabel"
        :aria-pressed="imageEnhancementActive"
        :class="{ 'is-pressed': imageEnhancementActive }"
        :disabled="!currentItem || imageFailed || !imageEnhancementSupported"
        @click="toggleImageEnhancement"
      >
        <SvgIcon
          :name="imageEnhancementActive ? 'blur-on' : 'blur-off'"
          :size="20"
        />
        <span class="image-viewer__button-label">화질 개선</span>
      </button>
      <button
        v-if="translationEnabled"
        ref="translationButton"
        type="button"
        :aria-label="translationButtonLabel"
        aria-haspopup="menu"
        :aria-expanded="translationMenuOpen"
        :title="
          translationDisabled
            ? '폴더 일괄 번역이 진행 중입니다.'
            : '현재 이미지 번역 · 길게 눌러 번역 결과 관리'
        "
        :disabled="!currentItem || imageFailed || translationDisabled"
        @click="handleTranslationButtonClick"
        @contextmenu.prevent="handleTranslationContextMenu"
        @keydown.down.stop.prevent="openTranslationMenu(true)"
        @pointercancel="finishTranslationLongPress"
        @pointerdown="startTranslationLongPress"
        @pointerleave="finishTranslationLongPress"
        @pointerup="finishTranslationLongPress"
      >
        <SvgIcon name="translate" :size="20" />
        <span class="image-viewer__button-label">
          {{ translationButtonLabel }}
        </span>
      </button>
      <span class="image-viewer__separator" />
      <button
        type="button"
        title="시계 방향으로 회전 (R)"
        aria-label="시계 방향으로 회전"
        @click="rotateClockwise"
      >
        <SvgIcon name="rotate" :size="20" />
        <span class="image-viewer__button-label">회전</span>
      </button>
      <button
        v-if="slideshowPreference.enabled"
        type="button"
        :title="slideshowActive ? '슬라이드쇼 정지' : '슬라이드쇼 시작'"
        :aria-label="slideshowActive ? '슬라이드쇼 정지' : '슬라이드쇼 시작'"
        :class="{ 'is-pressed': slideshowActive }"
        :aria-pressed="slideshowActive"
        @click="slideshowActive = !slideshowActive"
      >
        <span
          v-if="slideshowActive"
          class="image-viewer__slideshow-icon"
          aria-hidden="true"
        >
          ❚❚
        </span>
        <SvgIcon v-else name="play" :size="18" />
        <span class="image-viewer__button-label">
          {{ slideshowActive ? "정지" : "슬라이드쇼" }}
        </span>
      </button>
      <button
        type="button"
        title="전체화면 (F)"
        :aria-label="isFullscreen ? '전체화면 종료' : '전체화면 시작'"
        :class="{ 'is-pressed': isFullscreen }"
        :aria-pressed="isFullscreen"
        @click="toggleFullscreen"
      >
        <SvgIcon :name="isFullscreen ? 'zoom-out' : 'zoom-in'" :size="20" />
        <span class="image-viewer__button-label">전체화면</span>
      </button>
      <span class="image-viewer__align-left"></span>
      <span class="image-viewer__separator" />
      <button
        type="button"
        title="브라우저로 돌아가기 (Enter 또는 Esc)"
        aria-label="이미지 뷰어 닫기"
        @click="emit('close')"
      >
        <SvgIcon name="close" :size="20" />
        <span class="image-viewer__button-label">닫기</span>
      </button>
    </header>

    <div
      v-if="translationMenuOpen"
      ref="translationMenu"
      class="image-viewer__translation-menu"
      :style="translationMenuStyle"
      role="menu"
      aria-label="현재 이미지 번역 관리"
      @pointerdown.stop
    >
      <button
        ref="translationDeleteButton"
        type="button"
        role="menuitem"
        :disabled="!hasTranslationResult || translationDeleting"
        @click="deleteCurrentTranslation"
      >
        <SvgIcon name="remove" :size="18" />
        <span>
          {{ translationDeleting ? "삭제 중..." : "현재 이미지 번역 삭제" }}
        </span>
      </button>
    </div>

    <div
      ref="stage"
      class="image-viewer__stage"
      :class="{
        'is-pannable': canPan,
        'is-dragging': dragPointerId !== undefined,
      }"
      @wheel.prevent="handleWheel"
      @pointerdown="startDrag"
      @pointermove="drag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @dblclick="emit('close')"
    >
      <div
        v-if="currentItem && !imageFailed"
        class="image-viewer__image-layer"
        :class="{ 'is-initial-ready': initialImageReady }"
        :style="imageLayerStyle"
      >
        <img
          ref="imageElement"
          :key="`${currentItem.id}:${imageRevision}`"
          :src="getUrl(currentItem)"
          :alt="currentItem.name"
          :class="{
            'is-webgl-source': imageEnhancementMode === 'webgl',
            'is-css-enhanced':
              imageEnhancementActive && imageEnhancementMode === 'css',
          }"
          draggable="false"
          @load="handleImageLoad"
          @error="handleImageError"
        />
        <canvas
          ref="enhancementCanvas"
          class="image-viewer__enhancement-canvas"
          :class="{ 'is-visible': imageEnhancementMode === 'webgl' }"
          aria-hidden="true"
          @webglcontextlost.prevent="handleEnhancementContextLost"
          @webglcontextrestored="handleEnhancementContextRestored"
        />
        <ImageTranslationOverlay
          v-if="
            translationEnabled &&
            hasTranslationResult &&
            translationOverlayVisible &&
            translationResult
          "
          :display-width="naturalWidth"
          :display-height="naturalHeight"
          :image-width="translationResult.imageWidth"
          :image-height="translationResult.imageHeight"
          :regions="translationResult.regions"
          :viewer-scale="scale"
        />
      </div>
      <div v-else class="image-viewer__error">
        <strong>이미지를 표시할 수 없습니다.</strong>
        <span>{{ currentItem?.name }}</span>
      </div>
      <ImageTranslationStatus
        v-if="translationEnabled && translationStatusVisible"
        :progress="translationProgress"
        :processing="translationProcessing"
        @cancel="currentItem && toggleImageTranslation(currentItem)"
        @retry="currentItem && toggleImageTranslation(currentItem)"
        @continue="continueTranslation"
        @close="dismissTranslationStatus"
      />
      <aside
        v-else-if="
          translationEnabled &&
          hasTranslationResult &&
          translationResult?.regions.length
        "
        class="image-viewer__translation-layer-control"
        aria-label="번역 레이어 표시 설정"
        @pointerdown.stop
        @dblclick.stop
        @wheel.stop
      >
        <button
          type="button"
          :class="{ 'is-pressed': translationOverlayVisible }"
          :aria-pressed="translationOverlayVisible"
          :title="
            translationOverlayVisible
              ? '번역 레이어 숨기기 (T)'
              : '번역 레이어 표시하기 (T)'
          "
          @click="toggleTranslationOverlay"
        >
          <SvgIcon name="translate" :size="20" />
        </button>
      </aside>
      <ImageTranslationToast
        v-if="translationNotice"
        :message="translationNotice"
        @close="dismissTranslationNotice"
      />
    </div>

    <footer v-if="currentItem" class="image-viewer__status">
      <span :title="currentItem.path">{{ currentItem.name }}</span>
      <span>{{ formatBytes(currentItem.size) }}</span>
      <span>{{ currentItem.format }}</span>
      <span>
        {{
          currentItem.width && currentItem.height
            ? `${currentItem.width} × ${currentItem.height}`
            : "해상도 확인 중"
        }}
      </span>
    </footer>
  </section>
</template>

<style lang="scss">
.image-viewer {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: #f1f1f1;
  background: #111;
  outline: 0;

  &__toolbar {
    display: flex;
    gap: 3px;
    align-items: center;
    min-height: 42px;
    padding: 4px 6px;
    overflow-x: auto;
    color: var(--color-window-text);
    white-space: nowrap;
    background: var(--color-face);
    border-bottom: 1px solid #111;

    container-type: inline-size;
    container-name: imageViewerToolbar;

    @container imageViewerToolbar (max-width: 1000px) {
      .image-viewer__button-label {
        display: none;
      }
    }

    button {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      justify-content: center;
      height: 29px;
      padding: 3px 9px;
      font: inherit;
      color: inherit;
      background: var(--color-face);
      border: 1px solid;
      border-color: var(--color-light) var(--color-shadow-dark)
        var(--color-shadow-dark) var(--color-light);

      &:active,
      &.is-pressed {
        padding: 4px 8px 2px 10px;
        background: var(--color-pressed);
        border-color: var(--color-shadow-dark) var(--color-light)
          var(--color-light) var(--color-shadow-dark);
      }

      &:disabled {
        color: var(--color-disabled);
      }
    }

    strong {
      min-width: 64px;
      text-align: center;
    }
  }

  &__align-left {
    margin-left: auto;
  }

  &__translation-menu {
    position: absolute;
    z-index: 4;
    width: max-content;
    padding: 3px;
    color: var(--color-window-text);
    background: var(--color-face);
    border: 1px solid;
    border-color: var(--color-light) var(--color-shadow-dark)
      var(--color-shadow-dark) var(--color-light);
    box-shadow: 3px 4px 10px rgb(0 0 0 / 42%);

    button {
      display: flex;
      gap: 7px;
      align-items: center;
      width: 100%;
      min-height: 31px;
      padding: 5px 8px;
      font: inherit;
      color: inherit;
      text-align: left;
      background: transparent;
      border: 0;

      &:hover:not(:disabled),
      &:focus-visible:not(:disabled) {
        background: var(--color-highlight);
        outline: 0;
      }

      &:disabled {
        color: var(--color-disabled);
      }
    }
  }

  &__separator {
    flex: 0 0 1px;
    align-self: stretch;
    margin: 2px 4px;
    background: var(--color-shadow);
    box-shadow: 1px 0 var(--color-light);
  }

  &__zoom {
    min-width: 47px;
    text-align: center;
  }

  &__stage {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
    cursor: default;
    background-color: #151515;
    background-image: radial-gradient(#252525 0.7px, transparent 0.7px);
    background-size: 5px 5px;
    user-select: none;

    &.is-pannable {
      cursor: grab;
    }

    &.is-dragging {
      cursor: grabbing;
    }
  }

  &__image-layer {
    position: absolute;
    top: 50%;
    left: 50%;
    transform-origin: center;
    translate: -50% -50%;
    opacity: 0;
    will-change: transform;

    &.is-initial-ready {
      opacity: 1;
      transition: opacity 70ms linear;
    }

    img {
      display: block;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      box-shadow: 0 4px 28px rgb(0 0 0 / 55%);

      &.is-webgl-source {
        visibility: hidden;
      }

      &.is-css-enhanced {
        filter: brightness(1.01) contrast(1.08) saturate(1.02);
      }
    }
  }

  &__enhancement-canvas {
    position: absolute;
    inset: 0;
    display: none;
    width: 100%;
    height: 100%;
    pointer-events: none;
    box-shadow: 0 4px 28px rgb(0 0 0 / 55%);

    &.is-visible {
      display: block;
    }
  }

  &__error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    color: #ccc;
  }

  &__translation-layer-control {
    position: absolute;
    z-index: 2;
    top: 12px;
    right: 12px;

    button {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      min-height: 31px;
      padding: 4px 10px;
      font: inherit;
      color: var(--color-window-text);
      background: var(--color-face);
      border: 1px solid;
      border-color: var(--color-light) var(--color-shadow-dark)
        var(--color-shadow-dark) var(--color-light);
      box-shadow: 2px 2px 8px rgb(0 0 0 / 42%);

      &.is-pressed {
        padding: 5px 9px 3px 11px;
        background: var(--color-pressed);
        border-color: var(--color-shadow-dark) var(--color-light)
          var(--color-light) var(--color-shadow-dark);
      }
    }
  }

  &__status {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) auto auto auto;
    gap: 2px;
    min-height: 27px;
    padding: 2px;
    color: var(--color-window-text);
    background: var(--color-face);

    span {
      min-width: 90px;
      padding: 3px 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid;
      border-color: var(--color-shadow) var(--color-light) var(--color-light)
        var(--color-shadow);
    }
  }
}
</style>
