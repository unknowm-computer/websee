import type { ImageBounds } from '@/types/imageTranslation'

interface ImageSize {
  height: number
  width: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function createDetectorTargetSize(width: number, height: number): BigInt64Array {
  return BigInt64Array.of(BigInt(width), BigInt(height))
}

export function mapBoundsToDisplay(
  bounds: ImageBounds,
  source: ImageSize,
  display: ImageSize,
): ImageBounds {
  const sourceWidth = Math.max(1, source.width)
  const sourceHeight = Math.max(1, source.height)
  const displayWidth = Math.max(1, display.width || source.width)
  const displayHeight = Math.max(1, display.height || source.height)
  const scaleX = displayWidth / sourceWidth
  const scaleY = displayHeight / sourceHeight
  const x = clamp(bounds.x * scaleX, 0, displayWidth)
  const y = clamp(bounds.y * scaleY, 0, displayHeight)

  return {
    x,
    y,
    width: clamp(bounds.width * scaleX, 0, displayWidth - x),
    height: clamp(bounds.height * scaleY, 0, displayHeight - y),
  }
}
