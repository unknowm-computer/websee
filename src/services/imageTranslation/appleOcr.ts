import { requestAppleTranslation } from './appleTranslator'
import type { ImageTranslationProgress, RecognizedTextRegion, TextRegionCandidate } from '@/types/imageTranslation'

// Base64와 JSON을 포함해 도우미의 24 MiB 요청 제한 안에 들어가도록 합니다.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_EDGE = 16_384
const MAX_IMAGE_PIXELS = 32_000_000

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('글자 인식이 취소되었습니다.', 'AbortError')
}

export async function checkAppleOcr(signal?: AbortSignal): Promise<void> {
  const result = await requestAppleTranslation({ operation: 'ping' }, signal)
  if (result !== 'websee-translation-v3') {
    throw new Error('설치된 macOS 도우미는 OCR을 지원하지 않습니다. 설치 안내의 명령을 다시 실행해 도우미를 업데이트해주세요.')
  }
}

async function encodeImage(file: File, signal: AbortSignal): Promise<{ image: string; width: number; height: number }> {
  assertActive(signal)
  const bitmap = await createImageBitmap(file)
  try {
    assertActive(signal)
    const { width, height } = bitmap
    let scale = Math.min(1, MAX_IMAGE_EDGE / width, MAX_IMAGE_EDGE / height, Math.sqrt(MAX_IMAGE_PIXELS / (width * height)))
    let blob: Blob | undefined
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = new OffscreenCanvas(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('macOS OCR에 전달할 이미지를 준비하지 못했습니다.')
      // Canvas를 거쳐 EXIF 회전을 실제 픽셀에 반영하고 감지 좌표와 일치시킵니다.
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
      assertActive(signal)
      if (blob.size <= MAX_IMAGE_BYTES) break
      scale *= 0.7
    }
    if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error('macOS OCR에 전달할 이미지가 너무 큽니다.')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    assertActive(signal)
    const chunks: string[] = []
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)))
    }
    return { image: btoa(chunks.join('')), width, height }
  } finally {
    bitmap.close()
  }
}

export async function recognizeAppleRegions(
  file: File,
  candidates: readonly TextRegionCandidate[],
  onProgress: (progress: ImageTranslationProgress) => void,
  signal: AbortSignal,
): Promise<RecognizedTextRegion[]> {
  assertActive(signal)
  if (!candidates.length) return []
  onProgress({ phase: 'recognizing', message: 'macOS Vision으로 글자를 인식하는 중입니다.', completed: 0, total: candidates.length })
  const { image, width, height } = await encodeImage(file, signal)
  const texts = await requestAppleTranslation({
    operation: 'ocr',
    ocr: {
      image,
      crops: candidates.map(({ cropBounds: bounds }) => ({
        x: bounds.x / width, y: bounds.y / height,
        width: bounds.width / width, height: bounds.height / height,
      })),
    },
  }, signal, (completed, total) => onProgress({
    phase: 'recognizing', message: `macOS Vision으로 글자를 인식하는 중입니다. (${completed}/${total})`, completed, total,
  }))
  assertActive(signal)
  if (!Array.isArray(texts) || texts.length !== candidates.length || !texts.every((text): text is string => typeof text === 'string')) {
    throw new Error('macOS OCR 결과가 감지한 텍스트 영역과 일치하지 않습니다.')
  }
  return candidates.flatMap(({ id, kind, bounds, detectionScore }, index) => {
    const sourceText = texts[index].trim()
    return sourceText ? [{ id, kind, bounds, detectionScore, sourceText }] : []
  })
}
