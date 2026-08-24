import type { ImageTranslationRegion, ImageTranslationResult } from '@/types/imageTranslation'
import type { MediaItem } from '@/types/media'

export const TRANSLATION_SIDECAR_DIRECTORY_NAME = '.websee'
const SCHEMA_VERSION = 1

interface SourceIdentity {
  lastModified: number
  name: string
  size: number
}

interface PersistedTranslationResult {
  imageHeight: number
  imageWidth: number
  regions: ImageTranslationRegion[]
}

interface ImageSidecarDocument {
  kind: 'image'
  result: PersistedTranslationResult
  schemaVersion: typeof SCHEMA_VERSION
  source: SourceIdentity
}

interface ArchiveEntryTranslation {
  path: string
  result: PersistedTranslationResult
  size: number
}

interface ArchiveSidecarDocument {
  entries: Record<string, ArchiveEntryTranslation>
  kind: 'archive'
  schemaVersion: typeof SCHEMA_VERSION
  source: SourceIdentity
}

export interface TranslationSidecarTarget {
  archiveEntryPath?: string
  directoryHandle: FileSystemDirectoryHandle
  sourceItem: MediaItem
}

type SidecarDocument = ArchiveSidecarDocument | ImageSidecarDocument

const writeQueues = new WeakMap<FileSystemDirectoryHandle, Map<string, Promise<void>>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readRegion(value: unknown): ImageTranslationRegion | undefined {
  if (!isRecord(value) || !isRecord(value.bounds)) return undefined
  if (
    typeof value.id !== 'string'
    || (value.kind !== 'bubble' && value.kind !== 'free-text')
    || typeof value.sourceText !== 'string'
    || typeof value.translatedText !== 'string'
    || !isFiniteNumber(value.detectionScore)
    || !isFiniteNumber(value.bounds.x)
    || !isFiniteNumber(value.bounds.y)
    || !isFiniteNumber(value.bounds.width)
    || !isFiniteNumber(value.bounds.height)
  ) return undefined

  return {
    id: value.id,
    kind: value.kind,
    bounds: {
      x: value.bounds.x,
      y: value.bounds.y,
      width: value.bounds.width,
      height: value.bounds.height,
    },
    sourceText: value.sourceText,
    translatedText: value.translatedText,
    detectionScore: value.detectionScore,
  }
}

function readPersistedResult(value: unknown): PersistedTranslationResult | undefined {
  if (
    !isRecord(value)
    || !isFiniteNumber(value.imageWidth)
    || !isFiniteNumber(value.imageHeight)
    || value.imageWidth <= 0
    || value.imageHeight <= 0
    || !Array.isArray(value.regions)
  ) return undefined

  const regions = value.regions.map(readRegion)
  if (regions.some((region) => region === undefined)) return undefined

  return {
    imageWidth: value.imageWidth,
    imageHeight: value.imageHeight,
    regions: regions.filter((region): region is ImageTranslationRegion => region !== undefined),
  }
}

function readSourceIdentity(value: unknown): SourceIdentity | undefined {
  if (
    !isRecord(value)
    || typeof value.name !== 'string'
    || !isFiniteNumber(value.size)
    || !isFiniteNumber(value.lastModified)
  ) return undefined

  return {
    name: value.name,
    size: value.size,
    lastModified: value.lastModified,
  }
}

function readSidecarDocument(value: unknown): SidecarDocument | undefined {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) return undefined
  const source = readSourceIdentity(value.source)
  if (!source) return undefined

  if (value.kind === 'image') {
    const result = readPersistedResult(value.result)
    return result ? { schemaVersion: SCHEMA_VERSION, kind: 'image', source, result } : undefined
  }

  if (value.kind !== 'archive' || !isRecord(value.entries)) return undefined
  const entries: Record<string, ArchiveEntryTranslation> = {}
  for (const [key, entryValue] of Object.entries(value.entries)) {
    if (!isRecord(entryValue)) return undefined
    const result = readPersistedResult(entryValue.result)
    if (
      !result
      || typeof entryValue.path !== 'string'
      || !isFiniteNumber(entryValue.size)
    ) return undefined
    entries[key] = { path: entryValue.path, size: entryValue.size, result }
  }

  return { schemaVersion: SCHEMA_VERSION, kind: 'archive', source, entries }
}

function createSourceIdentity(item: MediaItem): SourceIdentity {
  return {
    name: item.name,
    size: item.size,
    lastModified: item.lastModified,
  }
}

function sourceMatches(identity: SourceIdentity, item: MediaItem): boolean {
  return identity.name === item.name
    && identity.size === item.size
    && identity.lastModified === item.lastModified
}

function toPersistedResult(result: ImageTranslationResult): PersistedTranslationResult {
  return {
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
    regions: result.regions,
  }
}

function toRuntimeResult(
  item: MediaItem,
  result: PersistedTranslationResult,
): ImageTranslationResult {
  return {
    itemId: item.id,
    imageWidth: result.imageWidth,
    imageHeight: result.imageHeight,
    regions: result.regions,
  }
}

function getSidecarFileName(target: TranslationSidecarTarget): string {
  return `${target.sourceItem.name}.json`
}

async function readDocument(target: TranslationSidecarTarget): Promise<SidecarDocument | undefined> {
  try {
    const storageDirectory = await target.directoryHandle.getDirectoryHandle(
      TRANSLATION_SIDECAR_DIRECTORY_NAME,
    )
    const fileHandle = await storageDirectory.getFileHandle(getSidecarFileName(target))
    const file = await fileHandle.getFile()
    return readSidecarDocument(JSON.parse(await file.text()))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

async function writeDocument(
  target: TranslationSidecarTarget,
  document: SidecarDocument,
): Promise<void> {
  const storageDirectory = await target.directoryHandle.getDirectoryHandle(
    TRANSLATION_SIDECAR_DIRECTORY_NAME,
    { create: true },
  )
  const fileHandle = await storageDirectory.getFileHandle(
    getSidecarFileName(target),
    { create: true },
  )
  const writable = await fileHandle.createWritable()
  await writable.write(`${JSON.stringify(document, null, 2)}\n`)
  await writable.close()
}

function enqueueWrite(
  target: TranslationSidecarTarget,
  operation: () => Promise<void>,
): Promise<void> {
  let directoryQueues = writeQueues.get(target.directoryHandle)
  if (!directoryQueues) {
    directoryQueues = new Map()
    writeQueues.set(target.directoryHandle, directoryQueues)
  }

  const fileName = getSidecarFileName(target)
  const previous = directoryQueues.get(fileName) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  directoryQueues.set(fileName, next)
  void next.then(
    () => {
      if (directoryQueues?.get(fileName) === next) directoryQueues.delete(fileName)
    },
    () => {
      if (directoryQueues?.get(fileName) === next) directoryQueues.delete(fileName)
    },
  )
  return next
}

export async function requestDirectoryWritePermission(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const permissionHandle = directoryHandle as FileSystemDirectoryHandle & {
    requestPermission?: (
      descriptor?: { mode?: 'read' | 'readwrite' },
    ) => Promise<PermissionState>
  }
  if (!permissionHandle.requestPermission) return false
  return await permissionHandle.requestPermission({ mode: 'readwrite' }) === 'granted'
}

export function requestTranslationSidecarPermission(
  target: TranslationSidecarTarget,
): Promise<boolean> {
  return requestDirectoryWritePermission(target.directoryHandle)
}

export async function loadTranslationSidecar(
  target: TranslationSidecarTarget,
  item: MediaItem,
): Promise<ImageTranslationResult | undefined> {
  const document = await readDocument(target)
  if (!document || !sourceMatches(document.source, target.sourceItem)) return undefined

  if (!target.archiveEntryPath) {
    if (document.kind !== 'image') return undefined
    return toRuntimeResult(item, document.result)
  }

  if (document.kind !== 'archive') return undefined
  const entry = document.entries[target.archiveEntryPath]
  if (
    !entry
    || entry.path !== target.archiveEntryPath
    || entry.size !== item.size
  ) return undefined
  return toRuntimeResult(item, entry.result)
}

export function saveTranslationSidecar(
  target: TranslationSidecarTarget,
  item: MediaItem,
  result: ImageTranslationResult,
): Promise<void> {
  return enqueueWrite(target, async () => {
    if (!target.archiveEntryPath) {
      const document: ImageSidecarDocument = {
        schemaVersion: SCHEMA_VERSION,
        kind: 'image',
        source: createSourceIdentity(target.sourceItem),
        result: toPersistedResult(result),
      }
      await writeDocument(target, document)
      return
    }

    const existingDocument = await readDocument(target)
    const entries = existingDocument?.kind === 'archive'
      && sourceMatches(existingDocument.source, target.sourceItem)
      ? existingDocument.entries
      : {}
    entries[target.archiveEntryPath] = {
      path: target.archiveEntryPath,
      size: item.size,
      result: toPersistedResult(result),
    }
    await writeDocument(target, {
      schemaVersion: SCHEMA_VERSION,
      kind: 'archive',
      source: createSourceIdentity(target.sourceItem),
      entries,
    })
  })
}
