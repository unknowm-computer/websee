export type ViewerZoomMode = 'fit' | 'width' | 'actual' | 'custom'

export interface ViewerZoomPreference {
  mode: ViewerZoomMode
  scale: number
}

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

const ZOOM_MODE_STORAGE_KEY = 'websee-viewer-zoom-mode'
const ZOOM_SCALE_STORAGE_KEY = 'websee-viewer-zoom-scale'
const MIN_ZOOM_SCALE = 0.03
const MAX_ZOOM_SCALE = 16

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
