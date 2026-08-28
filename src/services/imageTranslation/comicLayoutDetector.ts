import {
  createInferenceSession,
  getOnnxRuntime,
} from '@/services/imageTranslation/onnxRuntime'
import { createDetectorTargetSize } from '@/services/imageTranslation/detectorGeometry'
import type { ImageBounds, TranslationRegionKind } from '@/types/imageTranslation'

const INPUT_SIZE = 640
const DETECTION_THRESHOLD = 0.35
const MAX_TEXT_REGIONS = 40

interface RawDetection {
  label: number
  score: number
  bounds: ImageBounds
}

export interface TextRegionCandidate {
  id: string
  kind: TranslationRegionKind
  bounds: ImageBounds
  cropBounds: ImageBounds
  detectionScore: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function clampBounds(bounds: ImageBounds, imageWidth: number, imageHeight: number): ImageBounds {
  const left = clamp(bounds.x, 0, imageWidth)
  const top = clamp(bounds.y, 0, imageHeight)
  const right = clamp(bounds.x + bounds.width, left, imageWidth)
  const bottom = clamp(bounds.y + bounds.height, top, imageHeight)

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function expandBounds(
  bounds: ImageBounds,
  ratio: number,
  imageWidth: number,
  imageHeight: number,
): ImageBounds {
  const horizontal = bounds.width * ratio
  const vertical = bounds.height * ratio
  return clampBounds({
    x: bounds.x - horizontal,
    y: bounds.y - vertical,
    width: bounds.width + horizontal * 2,
    height: bounds.height + vertical * 2,
  }, imageWidth, imageHeight)
}

function intersectionArea(left: ImageBounds, right: ImageBounds): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return width * height
}

function intersectionOverUnion(left: ImageBounds, right: ImageBounds): number {
  const intersection = intersectionArea(left, right)
  const union = left.width * left.height + right.width * right.height - intersection
  return union > 0 ? intersection / union : 0
}

function removeDuplicates(detections: readonly RawDetection[]): RawDetection[] {
  const kept: RawDetection[] = []
  for (const detection of [...detections].sort((left, right) => right.score - left.score)) {
    const duplicate = kept.some(
      (candidate) => candidate.label === detection.label
        && intersectionOverUnion(candidate.bounds, detection.bounds) >= 0.75,
    )
    if (!duplicate) kept.push(detection)
  }
  return kept
}

export function removeOverlappingFreeTextCandidates(
  candidates: readonly TextRegionCandidate[],
): TextRegionCandidate[] {
  const keptFreeText: TextRegionCandidate[] = []
  const sortedFreeText = candidates
    .filter((candidate) => candidate.kind === 'free-text')
    .sort((left, right) => right.detectionScore - left.detectionScore)

  for (const candidate of sortedFreeText) {
    const duplicate = keptFreeText.some(
      (kept) => intersectionOverUnion(kept.bounds, candidate.bounds) >= 0.65,
    )
    if (!duplicate) keptFreeText.push(candidate)
  }

  return [
    ...candidates.filter((candidate) => candidate.kind === 'bubble'),
    ...keptFreeText,
  ]
}

function findContainingBubble(
  textBounds: ImageBounds,
  bubbles: readonly RawDetection[],
): RawDetection | undefined {
  const centerX = textBounds.x + textBounds.width / 2
  const centerY = textBounds.y + textBounds.height / 2

  return bubbles
    .filter((bubble) =>
      centerX >= bubble.bounds.x
      && centerX <= bubble.bounds.x + bubble.bounds.width
      && centerY >= bubble.bounds.y
      && centerY <= bubble.bounds.y + bubble.bounds.height,
    )
    .sort(
      (left, right) =>
        left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height,
    )[0]
}

function sortReadingOrder(left: TextRegionCandidate, right: TextRegionCandidate): number {
  const rowTolerance = Math.min(left.bounds.height, right.bounds.height) * 0.5
  const verticalDifference = left.bounds.y - right.bounds.y
  if (Math.abs(verticalDifference) > rowTolerance) return verticalDifference
  return right.bounds.x - left.bounds.x
}

function createDetectorInput(bitmap: ImageBitmap): Float32Array {
  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('텍스트 영역 감지를 위한 Canvas를 만들 수 없습니다.')

  context.fillStyle = '#fff'
  context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, INPUT_SIZE, INPUT_SIZE)
  const pixels = context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data
  const channelSize = INPUT_SIZE * INPUT_SIZE
  const input = new Float32Array(channelSize * 3)

  for (let index = 0; index < channelSize; index += 1) {
    const pixelOffset = index * 4
    input[index] = pixels[pixelOffset] / 255
    input[channelSize + index] = pixels[pixelOffset + 1] / 255
    input[channelSize * 2 + index] = pixels[pixelOffset + 2] / 255
  }

  return input
}

export class ComicLayoutDetector {
  private constructor(private readonly session: import('onnxruntime-web').InferenceSession) {}

  static async create(model: ArrayBuffer): Promise<ComicLayoutDetector> {
    const session = await createInferenceSession(model, {
      graphOptimizationLevel: 'all',
    })
    return new ComicLayoutDetector(session)
  }

  async detect(bitmap: ImageBitmap): Promise<TextRegionCandidate[]> {
    const ort = getOnnxRuntime()
    const imageTensor = new ort.Tensor(
      'float32',
      createDetectorInput(bitmap),
      [1, 3, INPUT_SIZE, INPUT_SIZE],
    )
    const sizeTensor = new ort.Tensor(
      'int64',
      // This ONNX export expects [width, height], matching its upstream inference code.
      createDetectorTargetSize(bitmap.width, bitmap.height),
      [1, 2],
    )

    try {
      const output = await this.session.run({
        images: imageTensor,
        orig_target_sizes: sizeTensor,
      })
      try {
        const labels = output.labels?.data
        const boxes = output.boxes?.data
        const scores = output.scores?.data
        if (!(labels instanceof BigInt64Array) || !(boxes instanceof Float32Array) || !(scores instanceof Float32Array)) {
          throw new Error('텍스트 영역 감지 모델의 출력 형식이 올바르지 않습니다.')
        }

        const rawDetections: RawDetection[] = []
        for (let index = 0; index < scores.length; index += 1) {
          const score = scores[index]
          const label = Number(labels[index])
          if (score < DETECTION_THRESHOLD || label < 0 || label > 2) continue

          const offset = index * 4
          const bounds = clampBounds({
            x: boxes[offset],
            y: boxes[offset + 1],
            width: boxes[offset + 2] - boxes[offset],
            height: boxes[offset + 3] - boxes[offset + 1],
          }, bitmap.width, bitmap.height)
          if (bounds.width < 4 || bounds.height < 4) continue
          rawDetections.push({ label, score, bounds })
        }

        const detections = removeDuplicates(rawDetections)
        const bubbles = detections.filter((detection) => detection.label === 0)
        const textDetections = detections
          .filter((detection) => detection.label === 1 || detection.label === 2)
          .sort((left, right) => right.score - left.score)
          .slice(0, MAX_TEXT_REGIONS)

        const usedBubbles = new Set<RawDetection>()
        const candidates: TextRegionCandidate[] = []
        for (const text of textDetections) {
          const bubble = text.label === 1 ? findContainingBubble(text.bounds, bubbles) : undefined
          if (bubble && usedBubbles.has(bubble)) continue
          if (bubble) usedBubbles.add(bubble)

          const kind: TranslationRegionKind = bubble ? 'bubble' : 'free-text'
          candidates.push({
            id: `region-${candidates.length}`,
            kind,
            bounds: bubble?.bounds
              ?? text.bounds,
            cropBounds: expandBounds(
              bubble?.bounds ?? text.bounds,
              bubble ? 0.04 : 0.12,
              bitmap.width,
              bitmap.height,
            ),
            detectionScore: text.score,
          })
        }
        return removeOverlappingFreeTextCandidates(candidates).sort(sortReadingOrder)
      } finally {
        for (const tensor of Object.values(output)) tensor.dispose()
      }
    } finally {
      imageTensor.dispose()
      sizeTensor.dispose()
    }
  }

  release(): void {
    void this.session.release()
  }
}
