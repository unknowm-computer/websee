import type { MediaDirectoryNode, MediaItem, MediaSortKey } from '@/types/media'

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
])

const TEXT_EXTENSIONS = new Set(['json', 'smi', 'srt', 'text', 'txt'])

const MIME_TYPES: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

export function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  return lastDot < 0 ? '' : fileName.slice(lastDot + 1).toLowerCase()
}

export function getFileFormat(fileName: string): string {
  const extension = getExtension(fileName)
  return extension === 'jpg' ? 'JPEG' : extension.toUpperCase() || 'UNKNOWN'
}

export function getImageMimeType(fileName: string): string {
  return MIME_TYPES[getExtension(fileName)] ?? 'application/octet-stream'
}

export function isImageFileName(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(fileName))
}

export function isTextFileName(fileName: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(fileName))
}

export function isArchiveFileName(fileName: string): boolean {
  return isZipArchiveFileName(fileName) || isRarArchiveFileName(fileName)
}

export function isZipArchiveFileName(fileName: string): boolean {
  const extension = getExtension(fileName)
  return extension === 'zip' || extension === 'cbz'
}

export function isRarArchiveFileName(fileName: string): boolean {
  const extension = getExtension(fileName)
  return extension === 'rar' || extension === 'cbr'
}

export function isSupportedMediaFileName(fileName: string): boolean {
  return isImageFileName(fileName) || isTextFileName(fileName) || isArchiveFileName(fileName)
}

export function isImageMediaItem(item: MediaItem): boolean {
  return item.kind === 'image'
}

export function isTextMediaItem(item: MediaItem): boolean {
  return item.kind === 'text'
}

export function isArchiveMediaItem(item: MediaItem): boolean {
  return item.kind === 'archive'
}

export function getDirectoryPath(path: string): string {
  const normalized = normalizePath(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash < 0 ? '' : normalized.slice(0, lastSlash)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

export function naturalCompare(left: string, right: string): number {
  return collator.compare(left, right)
}

export function sortMediaItems(
  items: readonly MediaItem[],
  sortKey: MediaSortKey,
  ascending: boolean,
): MediaItem[] {
  const direction = ascending ? 1 : -1

  return [...items].sort((left, right) => {
    const leftIsFolder = left.kind === 'folder'
    const rightIsFolder = right.kind === 'folder'
    if (leftIsFolder !== rightIsFolder) return leftIsFolder ? -1 : 1

    let result = 0

    if (sortKey === 'name') result = naturalCompare(left.name, right.name)
    if (sortKey === 'size') result = left.size - right.size
    if (sortKey === 'format') result = naturalCompare(left.format, right.format)
    if (sortKey === 'modified') result = left.lastModified - right.lastModified

    return (result || naturalCompare(left.name, right.name)) * direction
  })
}

export function buildDirectoryTree(
  collectionName: string,
  items: readonly MediaItem[],
): MediaDirectoryNode {
  const root: MediaDirectoryNode = {
    id: 'folder:',
    kind: 'folder',
    name: collectionName,
    path: '',
    directCount: 0,
    children: [],
  }

  const nodes = new Map<string, MediaDirectoryNode>([['', root]])

  for (const item of items) {
    const parts = item.directoryPath.split('/').filter(Boolean)
    let current = root
    let currentPath = ''

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      let child = nodes.get(currentPath)

      if (!child) {
        child = {
          id: `folder:${currentPath}`,
          kind: 'folder',
          name: part,
          path: currentPath,
          directCount: 0,
          children: [],
        }
        current.children.push(child)
        nodes.set(currentPath, child)
      }

      current = child
    }

    current.directCount += 1
  }

  for (const item of items) {
    if (item.kind !== 'archive') continue
    const parent = nodes.get(item.directoryPath)
    if (!parent) continue

    parent.children.push({
      id: `archive:${item.id}`,
      kind: 'archive',
      name: item.name,
      path: item.path,
      directCount: 0,
      children: [],
      archiveItemId: item.id,
      indexed: false,
    })
  }

  for (const node of nodes.values()) {
    node.children.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
      return naturalCompare(left.name, right.name)
    })
  }

  return root
}

export function createMediaItem(
  file: File,
  path = file.name,
  idPrefix = '',
  fileHandle?: FileSystemFileHandle,
): MediaItem {
  const normalizedPath = normalizePath(path) || file.name
  const prefix = idPrefix ? `${idPrefix}:` : ''

  return {
    id: `${prefix}${normalizedPath}:${file.size}:${file.lastModified}`,
    kind: isArchiveFileName(file.name)
      ? 'archive'
      : isTextFileName(file.name)
        ? 'text'
        : 'image',
    name: normalizedPath.split('/').at(-1) ?? file.name,
    path: normalizedPath,
    directoryPath: getDirectoryPath(normalizedPath),
    file,
    fileHandle,
    size: file.size,
    format: getFileFormat(file.name),
    lastModified: file.lastModified,
  }
}
