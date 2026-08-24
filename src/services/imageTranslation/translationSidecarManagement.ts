import { TRANSLATION_SIDECAR_DIRECTORY_NAME } from './translationSidecar'

export interface TranslationSidecarSummary {
  fileCount: number
  orphanBytes: number
  orphanCount: number
  totalBytes: number
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

async function getStorageDirectory(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await directoryHandle.getDirectoryHandle(TRANSLATION_SIDECAR_DIRECTORY_NAME)
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

async function getSourceFileNames(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<Set<string>> {
  const names = new Set<string>()
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'file') names.add(name)
  }
  return names
}

function getSourceName(sidecarFileName: string): string | undefined {
  if (!sidecarFileName.endsWith('.json')) return undefined
  return sidecarFileName.slice(0, -'.json'.length)
}

async function isDirectoryEmpty(directoryHandle: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const _entry of directoryHandle.entries()) return false
  return true
}

export async function scanTranslationSidecars(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<TranslationSidecarSummary> {
  const storageDirectory = await getStorageDirectory(directoryHandle)
  if (!storageDirectory) {
    return { fileCount: 0, orphanBytes: 0, orphanCount: 0, totalBytes: 0 }
  }

  const sourceFileNames = await getSourceFileNames(directoryHandle)
  const summary: TranslationSidecarSummary = {
    fileCount: 0,
    orphanBytes: 0,
    orphanCount: 0,
    totalBytes: 0,
  }

  for await (const [name, handle] of storageDirectory.entries()) {
    const sourceName = getSourceName(name)
    if (handle.kind !== 'file' || sourceName === undefined) continue

    const file = await handle.getFile()
    summary.fileCount += 1
    summary.totalBytes += file.size
    if (!sourceFileNames.has(sourceName)) {
      summary.orphanCount += 1
      summary.orphanBytes += file.size
    }
  }

  return summary
}

export async function deleteOrphanedTranslationSidecars(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<number> {
  const storageDirectory = await getStorageDirectory(directoryHandle)
  if (!storageDirectory) return 0

  const sourceFileNames = await getSourceFileNames(directoryHandle)
  const orphanFileNames: string[] = []
  for await (const [name, handle] of storageDirectory.entries()) {
    const sourceName = getSourceName(name)
    if (
      handle.kind === 'file'
      && sourceName !== undefined
      && !sourceFileNames.has(sourceName)
    ) {
      orphanFileNames.push(name)
    }
  }

  for (const name of orphanFileNames) await storageDirectory.removeEntry(name)
  if (await isDirectoryEmpty(storageDirectory)) {
    await directoryHandle.removeEntry(TRANSLATION_SIDECAR_DIRECTORY_NAME)
  }
  return orphanFileNames.length
}

export async function deleteAllTranslationSidecars(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<void> {
  try {
    await directoryHandle.removeEntry(TRANSLATION_SIDECAR_DIRECTORY_NAME, { recursive: true })
  } catch (error) {
    if (!isNotFoundError(error)) throw error
  }
}
