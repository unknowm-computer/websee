export interface ImageThumbnail {
  blob: Blob
  height: number
  width: number
}

const THUMBNAIL_MAX_SIZE = 220
const MAX_SOURCE_PIXELS = 100_000_000

function loadImage(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.decoding = 'async'
    image.onload = () => resolve({ image, objectUrl })
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Image metadata could not be read: ${file.name}`))
    }
    image.src = objectUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Thumbnail encoding failed.'))
      },
      'image/webp',
      0.82,
    )
  })
}

export async function createImageThumbnail(file: File): Promise<ImageThumbnail> {
  const { image, objectUrl } = await loadImage(file)

  try {
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height) throw new Error(`Image dimensions are missing: ${file.name}`)
    if (width * height > MAX_SOURCE_PIXELS) {
      throw new Error(`Image is too large for background thumbnailing: ${file.name}`)
    }

    const scale = Math.min(1, THUMBNAIL_MAX_SIZE / width, THUMBNAIL_MAX_SIZE / height)
    const thumbnailWidth = Math.max(1, Math.round(width * scale))
    const thumbnailHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = thumbnailWidth
    canvas.height = thumbnailHeight

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Thumbnail canvas is not available.')
    context.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight)

    return {
      blob: await canvasToBlob(canvas),
      width,
      height,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
