import type { AppleTranslationModel, OcrEngineId, TranslationEngineId } from '@/types/translationEngine'

export type ViewerZoomMode = 'fit' | 'width' | 'actual' | 'custom'

export interface ViewerZoomPreference {
  mode: ViewerZoomMode
  scale: number
}

export interface ViewerSlideshowPreference {
  enabled: boolean
  intervalSeconds: number
  loop: boolean
}

export const VIEWER_SLIDESHOW_INTERVAL_OPTIONS = [3, 5, 10] as const

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

const ZOOM_MODE_STORAGE_KEY = 'websee-viewer-zoom-mode'
const ZOOM_SCALE_STORAGE_KEY = 'websee-viewer-zoom-scale'
const ENHANCEMENT_STORAGE_KEY = 'websee-viewer-image-enhancement'
const TRANSLATION_OVERLAY_STORAGE_KEY = 'websee-viewer-translation-overlay-visible'
const TRANSLATION_ENABLED_STORAGE_KEY = 'websee-translation-enabled'
const TRANSLATION_ENGINE_STORAGE_KEY = 'websee-translation-engine'
const APPLE_TRANSLATION_MODEL_STORAGE_KEY = 'websee-apple-translation-model'
const OCR_ENGINE_STORAGE_KEY = 'websee-ocr-engine'
const SLIDESHOW_STORAGE_KEY = 'websee-viewer-slideshow'
const MIN_ZOOM_SCALE = 0.03
const MAX_ZOOM_SCALE = 16
const DEFAULT_SLIDESHOW_PREFERENCE: ViewerSlideshowPreference = {
  enabled: false,
  intervalSeconds: 3,
  loop: false,
}

function isViewerZoomMode(value: string | null): value is ViewerZoomMode {
  return value === 'fit' || value === 'width' || value === 'actual' || value === 'custom'
}

function clampScale(value: number): number {
  return Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, value))
}

export function readViewerZoomPreference(storage: ReadableStorage): ViewerZoomPreference {
  const storedMode = storage.getItem(ZOOM_MODE_STORAGE_KEY)
  const storedScale = Number.parseFloat(storage.getItem(ZOOM_SCALE_STORAGE_KEY) ?? '')

  return {
    mode: isViewerZoomMode(storedMode) ? storedMode : 'fit',
    scale: Number.isFinite(storedScale) ? clampScale(storedScale) : 1,
  }
}

export function writeViewerZoomPreference(
  storage: WritableStorage,
  preference: ViewerZoomPreference,
): void {
  storage.setItem(ZOOM_MODE_STORAGE_KEY, preference.mode)
  if (preference.mode === 'custom') {
    storage.setItem(ZOOM_SCALE_STORAGE_KEY, String(clampScale(preference.scale)))
  }
}

export function readViewerEnhancementPreference(storage: ReadableStorage): boolean {
  return storage.getItem(ENHANCEMENT_STORAGE_KEY) === 'true'
}

export function writeViewerEnhancementPreference(
  storage: WritableStorage,
  enabled: boolean,
): void {
  storage.setItem(ENHANCEMENT_STORAGE_KEY, String(enabled))
}

export function readViewerTranslationOverlayPreference(storage: ReadableStorage): boolean {
  const storedValue = storage.getItem(TRANSLATION_OVERLAY_STORAGE_KEY)
  return storedValue === null || storedValue === 'true'
}

export function writeViewerTranslationOverlayPreference(
  storage: WritableStorage,
  visible: boolean,
): void {
  storage.setItem(TRANSLATION_OVERLAY_STORAGE_KEY, String(visible))
}

export function readTranslationEnabledPreference(storage: ReadableStorage): boolean {
  return storage.getItem(TRANSLATION_ENABLED_STORAGE_KEY) === 'true'
}

export function readTranslationEnginePreference(storage: ReadableStorage, allowNativeEngines = true): TranslationEngineId {
  return allowNativeEngines && storage.getItem(TRANSLATION_ENGINE_STORAGE_KEY) === 'apple' ? 'apple' : 'chrome'
}

export function writeTranslationEnginePreference(storage: WritableStorage, engine: TranslationEngineId): void {
  storage.setItem(TRANSLATION_ENGINE_STORAGE_KEY, engine)
}

export function readAppleTranslationModelPreference(storage: ReadableStorage): AppleTranslationModel {
  return storage.getItem(APPLE_TRANSLATION_MODEL_STORAGE_KEY) === 'high-fidelity' ? 'high-fidelity' : 'low-latency'
}

export function writeAppleTranslationModelPreference(storage: WritableStorage, model: AppleTranslationModel): void {
  storage.setItem(APPLE_TRANSLATION_MODEL_STORAGE_KEY, model)
}

export function readOcrEnginePreference(storage: ReadableStorage, allowNativeEngines = true): OcrEngineId {
  return allowNativeEngines && storage.getItem(OCR_ENGINE_STORAGE_KEY) === 'apple-vision' ? 'apple-vision' : 'baberu'
}

export function writeOcrEnginePreference(storage: WritableStorage, engine: OcrEngineId): void {
  storage.setItem(OCR_ENGINE_STORAGE_KEY, engine)
}

export function writeTranslationEnabledPreference(
  storage: WritableStorage,
  enabled: boolean,
): void {
  storage.setItem(TRANSLATION_ENABLED_STORAGE_KEY, String(enabled))
}

export function readViewerSlideshowPreference(
  storage: ReadableStorage,
): ViewerSlideshowPreference {
  const storedValue = storage.getItem(SLIDESHOW_STORAGE_KEY)
  if (!storedValue) return { ...DEFAULT_SLIDESHOW_PREFERENCE }

  try {
    const parsed: unknown = JSON.parse(storedValue)
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_SLIDESHOW_PREFERENCE }
    }

    const preference = parsed as Partial<ViewerSlideshowPreference>
    const intervalSeconds = VIEWER_SLIDESHOW_INTERVAL_OPTIONS.find(
      (option) => option === preference.intervalSeconds,
    )

    return {
      enabled: preference.enabled === true,
      intervalSeconds: intervalSeconds ?? DEFAULT_SLIDESHOW_PREFERENCE.intervalSeconds,
      loop: preference.loop === true,
    }
  } catch {
    return { ...DEFAULT_SLIDESHOW_PREFERENCE }
  }
}

export function writeViewerSlideshowPreference(
  storage: WritableStorage,
  preference: ViewerSlideshowPreference,
): void {
  storage.setItem(SLIDESHOW_STORAGE_KEY, JSON.stringify(preference))
}
