export interface FileDetailField {
  label: string
  value: string
}

export interface FileDetails {
  fields: FileDetailField[]
  width?: number
  height?: number
  duration?: number
}

export interface FileDetailsRequest {
  file: File
  kind: 'text' | 'audio' | 'video' | 'image'
}

export function createFileDetailsWorker(): Worker {
  return new Worker(new URL('./fileDetails.worker.ts', import.meta.url), { type: 'module' })
}

export async function readSvgDetails(file: File): Promise<FileDetails> {
  const document = new DOMParser().parseFromString(await file.text(), 'image/svg+xml')
  const root = document.documentElement
  if (!(root instanceof SVGSVGElement)) throw new Error('Invalid SVG')
  const fields = [{ label: '이미지 유형', value: '벡터 그래픽' }]
  const viewBox = root.getAttribute('viewBox')
  if (viewBox) fields.push({ label: 'viewBox', value: viewBox })
  return { fields }
}
