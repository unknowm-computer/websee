import { getOnnxRuntime } from '@/services/imageTranslation/onnxRuntime'
import type { ImageBounds } from '@/types/imageTranslation'

const OCR_SIZE = 224
const MAX_NEW_TOKENS = 128
const REPETITION_PENALTY = 1.2
const MAX_CONTENT_RUN = 12
const MEAN = [0.485, 0.456, 0.406] as const
const STANDARD_DEVIATION = [0.229, 0.224, 0.225] as const
const PAST_NAMES = [
  'past_k0',
  'past_k1',
  'past_k2',
  'past_k3',
  'past_k4',
  'past_k5',
  'past_v0',
  'past_v1',
  'past_v2',
  'past_v3',
  'past_v4',
  'past_v5',
] as const

interface BaberuModels {
  vision: ArrayBuffer
  prefill: ArrayBuffer
  step: ArrayBuffer
  vocab: ArrayBuffer
}

class BaberuVocab {
  readonly bos = 1
  readonly eos = 2
  readonly size: number
  private readonly characters: readonly string[]
  private readonly contentIds = new Set<number>()

  constructor(data: ArrayBuffer) {
    const decoded = new TextDecoder().decode(data)
    const parsed: unknown = JSON.parse(decoded)
    if (!Array.isArray(parsed) || !parsed.every((character) => typeof character === 'string')) {
      throw new Error('Baberu 문자표 형식이 올바르지 않습니다.')
    }

    this.characters = parsed
    this.size = parsed.length + 4
    parsed.forEach((character, index) => {
      if (
        character.length === 1
        && !'ーｰ〜~'.includes(character)
        && /[\p{L}\p{N}]/u.test(character)
      ) {
        this.contentIds.add(index + 4)
      }
    })
  }

  isContent(id: number): boolean {
    return this.contentIds.has(id)
  }

  decode(ids: readonly number[]): string {
    return ids
      .map((id) => id >= 4 ? this.characters[id - 4] ?? '' : '')
      .join('')
  }
}

function createOcrInput(
  bitmap: ImageBitmap,
  bounds: ImageBounds,
  preserveAspectRatio: boolean,
): Float32Array {
  const canvas = new OffscreenCanvas(OCR_SIZE, OCR_SIZE)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('OCR 처리를 위한 Canvas를 만들 수 없습니다.')

  context.fillStyle = '#fff'
  context.fillRect(0, 0, OCR_SIZE, OCR_SIZE)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  const scale = preserveAspectRatio
    ? Math.min(OCR_SIZE / Math.max(1, bounds.width), OCR_SIZE / Math.max(1, bounds.height))
    : 1
  const targetWidth = preserveAspectRatio ? bounds.width * scale : OCR_SIZE
  const targetHeight = preserveAspectRatio ? bounds.height * scale : OCR_SIZE
  const targetX = (OCR_SIZE - targetWidth) / 2
  const targetY = (OCR_SIZE - targetHeight) / 2
  context.drawImage(
    bitmap,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    targetX,
    targetY,
    targetWidth,
    targetHeight,
  )

  const pixels = context.getImageData(0, 0, OCR_SIZE, OCR_SIZE).data
  const channelSize = OCR_SIZE * OCR_SIZE
  const input = new Float32Array(channelSize * 3)

  for (let index = 0; index < channelSize; index += 1) {
    const pixelOffset = index * 4
    input[index] = (pixels[pixelOffset] / 255 - MEAN[0]) / STANDARD_DEVIATION[0]
    input[channelSize + index] = (pixels[pixelOffset + 1] / 255 - MEAN[1]) / STANDARD_DEVIATION[1]
    input[channelSize * 2 + index] = (pixels[pixelOffset + 2] / 255 - MEAN[2]) / STANDARD_DEVIATION[2]
  }

  return input
}

function findNextToken(
  logits: import('onnxruntime-web').Tensor,
  vocab: BaberuVocab,
  sequence: readonly number[],
  tokens: readonly number[],
): number {
  const values = logits.data
  if (!(values instanceof Float32Array)) throw new Error('Baberu OCR 출력 형식이 올바르지 않습니다.')
  const offset = values.length - vocab.size

  for (const id of new Set(sequence)) {
    const index = offset + id
    const score = values[index]
    values[index] = score < 0 ? score * REPETITION_PENALTY : score / REPETITION_PENALTY
  }

  const lastToken = tokens.at(-1)
  if (lastToken !== undefined && vocab.isContent(lastToken)) {
    let run = 0
    for (let index = tokens.length - 1; index >= 0 && tokens[index] === lastToken; index -= 1) {
      run += 1
    }
    if (run >= MAX_CONTENT_RUN) values[offset + lastToken] = Number.NEGATIVE_INFINITY
  }

  let bestId = 0
  let bestScore = Number.NEGATIVE_INFINITY
  for (let id = 0; id < vocab.size; id += 1) {
    const score = values[offset + id]
    if (score > bestScore) {
      bestId = id
      bestScore = score
    }
  }
  return bestId
}

function disposeTensorMap(tensors: Record<string, import('onnxruntime-web').Tensor>): void {
  for (const tensor of Object.values(tensors)) tensor.dispose()
}

export class BaberuOcr {
  private constructor(
    private readonly visionSession: import('onnxruntime-web').InferenceSession,
    private readonly prefillSession: import('onnxruntime-web').InferenceSession,
    private readonly stepSession: import('onnxruntime-web').InferenceSession,
    private readonly vocab: BaberuVocab,
  ) {}

  static async create(models: BaberuModels): Promise<BaberuOcr> {
    const ort = getOnnxRuntime()
    const vocab = new BaberuVocab(models.vocab)
    const options: import('onnxruntime-web').InferenceSession.SessionOptions = {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }
    const visionSession = await ort.InferenceSession.create(models.vision, options)
    let prefillSession: import('onnxruntime-web').InferenceSession | undefined
    try {
      prefillSession = await ort.InferenceSession.create(models.prefill, options)
      const stepSession = await ort.InferenceSession.create(models.step, options)
      return new BaberuOcr(
        visionSession,
        prefillSession,
        stepSession,
        vocab,
      )
    } catch (error) {
      void visionSession.release()
      if (prefillSession) void prefillSession.release()
      throw error
    }
  }

  async recognize(
    bitmap: ImageBitmap,
    bounds: ImageBounds,
    preserveAspectRatio = false,
  ): Promise<string> {
    const ort = getOnnxRuntime()
    const pixelTensor = new ort.Tensor(
      'float32',
      createOcrInput(bitmap, bounds, preserveAspectRatio),
      [1, 3, OCR_SIZE, OCR_SIZE],
    )
    let visionOutput: Record<string, import('onnxruntime-web').Tensor> | undefined
    let decoderOutput: Record<string, import('onnxruntime-web').Tensor> | undefined

    try {
      visionOutput = await this.visionSession.run({ pixel_values: pixelTensor })
      const visionEmbeds = visionOutput.vision_embeds
      if (!visionEmbeds) throw new Error('Baberu 이미지 인식 결과가 없습니다.')

      const bosTensor = new ort.Tensor('int64', BigInt64Array.of(BigInt(this.vocab.bos)), [1, 1])
      try {
        decoderOutput = await this.prefillSession.run({
          vision_embeds: visionEmbeds,
          input_ids: bosTensor,
        })
      } finally {
        bosTensor.dispose()
        disposeTensorMap(visionOutput)
        visionOutput = undefined
      }

      const sequence = [this.vocab.bos]
      const tokens: number[] = []
      let position = 257

      for (let index = 0; index < MAX_NEW_TOKENS; index += 1) {
        const logits = decoderOutput.logits
        if (!logits) throw new Error('Baberu OCR 디코더 결과가 없습니다.')
        const nextToken = findNextToken(logits, this.vocab, sequence, tokens)
        if (nextToken === this.vocab.eos) break

        tokens.push(nextToken)
        sequence.push(nextToken)
        if (tokens.length >= MAX_NEW_TOKENS) break

        const inputTensor = new ort.Tensor('int64', BigInt64Array.of(BigInt(nextToken)), [1, 1])
        const positionTensor = new ort.Tensor('int64', BigInt64Array.of(BigInt(position)), [1, 1])
        const feeds: Record<string, import('onnxruntime-web').Tensor> = {
          input_ids: inputTensor,
          position_ids: positionTensor,
        }
        try {
          PAST_NAMES.forEach((name) => {
            const presentName = name.replace('past_', 'present_')
            const present = decoderOutput?.[presentName]
            if (!present) throw new Error(`Baberu OCR 캐시가 없습니다. (${presentName})`)
            feeds[name] = present
          })
          const nextOutput = await this.stepSession.run(feeds)
          disposeTensorMap(decoderOutput)
          decoderOutput = nextOutput
        } finally {
          inputTensor.dispose()
          positionTensor.dispose()
        }
        position += 1
      }

      return this.vocab.decode(tokens).trim()
    } finally {
      pixelTensor.dispose()
      if (visionOutput) disposeTensorMap(visionOutput)
      if (decoderOutput) disposeTensorMap(decoderOutput)
    }
  }

  release(): void {
    void this.visionSession.release()
    void this.prefillSession.release()
    void this.stepSession.release()
  }
}
