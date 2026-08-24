import {
  IMAGE_TRANSLATION_MODEL_CACHE,
  IMAGE_TRANSLATION_MODELS,
  type TranslationModelAsset,
} from '@/services/imageTranslation/modelManifest'

interface AssetLoadProgress {
  asset: TranslationModelAsset
  loaded: number
  total: number
}

type ProgressCallback = (progress: AssetLoadProgress) => void

export interface CachedTranslationModelData {
  bytes: number
  count: number
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function verifyAsset(asset: TranslationModelAsset, data: ArrayBuffer): Promise<void> {
  if (data.byteLength !== asset.bytes) {
    throw new Error(`${asset.label}의 다운로드 크기가 올바르지 않습니다.`)
  }

  const digest = await crypto.subtle.digest('SHA-256', data)
  if (toHex(digest) !== asset.sha256) {
    throw new Error(`${asset.label}의 무결성 확인에 실패했습니다.`)
  }
}

async function readResponse(
  response: Response,
  asset: TranslationModelAsset,
  onProgress: ProgressCallback,
): Promise<ArrayBuffer> {
  const reader = response.body?.getReader()
  if (!reader) {
    const data = await response.arrayBuffer()
    onProgress({ asset, loaded: data.byteLength, total: asset.bytes })
    return data
  }

  const data = new Uint8Array(asset.bytes)
  let loaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (loaded + value.byteLength > data.byteLength) {
      throw new Error(`${asset.label}의 다운로드 데이터가 예상보다 큽니다.`)
    }
    data.set(value, loaded)
    loaded += value.byteLength
    onProgress({ asset, loaded, total: asset.bytes })
  }

  return data.buffer.slice(0, loaded)
}

export async function loadModelAsset(
  asset: TranslationModelAsset,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const cache = await caches.open(IMAGE_TRANSLATION_MODEL_CACHE)
  const cached = await cache.match(asset.url)

  if (cached?.headers.get('x-websee-sha256') === asset.sha256) {
    const data = await readResponse(cached, asset, onProgress)
    if (data.byteLength === asset.bytes) return data
    await cache.delete(asset.url)
  } else if (cached) {
    await cache.delete(asset.url)
  }

  const response = await fetch(asset.url, {
    cache: 'no-store',
    credentials: 'omit',
    signal,
  })
  if (!response.ok) {
    throw new Error(`${asset.label}을 내려받지 못했습니다. (${response.status})`)
  }

  const data = await readResponse(response, asset, onProgress)
  await verifyAsset(asset, data)
  await cache.put(
    asset.url,
    new Response(data.slice(0), {
      headers: {
        'content-length': String(asset.bytes),
        'content-type': asset.id === 'baberu-vocab'
          ? 'application/json'
          : 'application/octet-stream',
        'x-websee-sha256': asset.sha256,
      },
    }),
  )
  return data
}

export async function getCachedTranslationModelData(): Promise<CachedTranslationModelData> {
  const cacheNames = await caches.keys()
  if (!cacheNames.includes(IMAGE_TRANSLATION_MODEL_CACHE)) return { bytes: 0, count: 0 }

  const cache = await caches.open(IMAGE_TRANSLATION_MODEL_CACHE)
  let bytes = 0
  let count = 0

  for (const asset of IMAGE_TRANSLATION_MODELS) {
    const response = await cache.match(asset.url)
    if (response?.headers.get('x-websee-sha256') !== asset.sha256) continue
    bytes += asset.bytes
    count += 1
  }

  return { bytes, count }
}

export async function clearCachedTranslationModelData(): Promise<void> {
  await caches.delete(IMAGE_TRANSLATION_MODEL_CACHE)
}
