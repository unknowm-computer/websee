import { unzip } from 'fflate'

import { extractRarEntry, listRarEntries } from '@/services/rarArchive'
import { isMacosArchiveMetadata, readZipEntryNames } from '@/services/zipFileNames'
import type { ArchiveIndex, MediaCollection, MediaItem } from '@/types/media'
import {
  buildDirectoryTree,
  createMediaItem,
  getImageMimeType,
  getFileFormat,
  getDirectoryPath,
  isImageFileName,
  isRarArchiveFileName,
  isSupportedMediaFileName,
} from '@/utils/media'

const SCAN_YIELD_INTERVAL = 80

function createCollection(
  name: string,
  kind: MediaCollection['kind'],
  items: MediaItem[],
): MediaCollection {
  return {
    name,
    kind,
    items,
    tree: buildDirectoryTree(name, items),
  }
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
}

async function scanDirectory(
  handle: FileSystemDirectoryHandle,
  relativePath: string,
  items: MediaItem[],
): Promise<void> {
  let processed = 0

  for await (const [name, entry] of handle.entries()) {
    const path = relativePath ? `${relativePath}/${name}` : name

    if (entry.kind === 'directory') {
      await scanDirectory(entry, path, items)
    } else if (isSupportedMediaFileName(name)) {
      const file = await entry.getFile()
      items.push(createMediaItem(file, path))
    }

    processed += 1
    if (processed % SCAN_YIELD_INTERVAL === 0) await yieldToBrowser()
  }
}

export async function loadDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<MediaCollection> {
  const items: MediaItem[] = []
  await scanDirectory(handle, '', items)
  return createCollection(handle.name, 'folder', items)
}

export function loadSelectedFiles(files: readonly File[]): MediaCollection {
  const mediaFiles = files.filter((file) => isSupportedMediaFileName(file.name))
  const firstRelativePath = mediaFiles[0]?.webkitRelativePath ?? ''
  const rootName = firstRelativePath.split('/')[0] || '선택한 파일'
  const items = mediaFiles.map((file) => {
    const relativePath = file.webkitRelativePath ?? ''
    const path = relativePath.startsWith(`${rootName}/`)
      ? relativePath.slice(rootName.length + 1)
      : relativePath || file.name

    return createMediaItem(file, path)
  })

  return createCollection(rootName, mediaFiles.some((file) => file.webkitRelativePath) ? 'folder' : 'files', items)
}

export async function loadArchiveIndex(file: File): Promise<ArchiveIndex> {
  const data = await file.arrayBuffer()
  if (isRarArchiveFileName(file.name)) return loadRarArchiveIndex(file, data)

  return loadZipArchiveIndex(file, data)
}

async function loadZipArchiveIndex(file: File, data: ArrayBuffer): Promise<ArchiveIndex> {
  const bytes = new Uint8Array(data)
  const archiveId = `archive-index:${file.name}:${file.size}:${file.lastModified}`
  const decodedEntryNames = readZipEntryNames(bytes)
  const items: MediaItem[] = []
  let entryIndex = 0

  await new Promise<void>((resolve, reject) => {
    unzip(
      bytes,
      {
        filter: (entry) => {
          const currentEntryIndex = entryIndex
          const decodedPath = decodedEntryNames[currentEntryIndex] ?? entry.name
          entryIndex += 1

          if (
            !decodedPath.endsWith('/')
            && !isMacosArchiveMetadata(decodedPath)
            && isImageFileName(decodedPath)
          ) {
            const name = decodedPath.split('/').at(-1) ?? decodedPath
            items.push({
              id: `${archiveId}:${currentEntryIndex}:${decodedPath}:${entry.originalSize}`,
              kind: 'archive-entry',
              name,
              path: decodedPath,
              directoryPath: getDirectoryPath(decodedPath),
              file,
              size: entry.originalSize,
              format: getFileFormat(name),
              lastModified: file.lastModified,
              archiveEntryIndex: currentEntryIndex,
              archiveEntryPath: entry.name,
            })
          }
          return false
        },
      },
      (error) => {
        if (error) reject(error)
        else resolve()
      },
    )
  })

  return {
    archiveFile: file,
    format: 'zip',
    data,
    items,
    tree: buildDirectoryTree(file.name, items),
  }
}

async function loadRarArchiveIndex(file: File, data: ArrayBuffer): Promise<ArchiveIndex> {
  const archiveId = `archive-index:${file.name}:${file.size}:${file.lastModified}`
  const entries = await listRarEntries(data)
  const items = entries
    .filter((entry) => !isMacosArchiveMetadata(entry.path) && isImageFileName(entry.path))
    .map<MediaItem>((entry, entryIndex) => {
      const name = entry.path.split(/[\\/]/).at(-1) ?? entry.path
      const normalizedPath = entry.path.replaceAll('\\', '/')

      return {
        id: `${archiveId}:${entryIndex}:${normalizedPath}:${entry.size}`,
        kind: 'archive-entry',
        name,
        path: normalizedPath,
        directoryPath: getDirectoryPath(normalizedPath),
        file,
        size: entry.size,
        format: getFileFormat(name),
        lastModified: file.lastModified,
        archiveEntryIndex: entryIndex,
        archiveEntryPath: entry.path,
      }
    })

  return {
    archiveFile: file,
    format: 'rar',
    data,
    items,
    tree: buildDirectoryTree(file.name, items),
  }
}

export async function extractArchiveEntry(
  index: ArchiveIndex,
  item: MediaItem,
): Promise<File> {
  const entryPath = item.archiveEntryPath
  const selectedEntryIndex = item.archiveEntryIndex
  if (selectedEntryIndex === undefined && !entryPath) {
    throw new Error('Archive entry reference is missing.')
  }

  let extractedData: Uint8Array
  if (index.format === 'rar') {
    if (!entryPath) throw new Error('RAR entry path is missing.')
    extractedData = await extractRarEntry(index.data, entryPath)
  } else {
    let entryIndex = 0
    const extracted = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(
        new Uint8Array(index.data),
        {
          filter: (entry) => {
            const currentEntryIndex = entryIndex
            entryIndex += 1
            return selectedEntryIndex === undefined
              ? entry.name === entryPath
              : currentEntryIndex === selectedEntryIndex
          },
        },
        (error, files) => {
          if (error) reject(error)
          else resolve(files)
        },
      )
    })
    const data = Object.values(extracted)[0]
    if (!data) throw new Error(`Archive entry not found: ${item.path}`)
    extractedData = data
  }

  return new File([extractedData], item.name, {
    type: getImageMimeType(item.name),
    lastModified: index.archiveFile.lastModified,
  })
}
