import { createExtractorFromData } from 'node-unrar-js'
import unrarWasmUrl from 'node-unrar-js/esm/js/unrar.wasm?url'

export interface RarArchiveEntry {
  path: string
  size: number
}

let wasmBinaryRequest: Promise<ArrayBuffer> | undefined
let operationQueue: Promise<void> = Promise.resolve()

function runRarOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation)
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

async function getWasmBinary(): Promise<ArrayBuffer> {
  wasmBinaryRequest ??= fetch(unrarWasmUrl).then(async (response) => {
    if (!response.ok) throw new Error('RAR decoder를 불러오지 못했습니다.')
    return response.arrayBuffer()
  })
  return wasmBinaryRequest
}

function assertSupportedArchive(
  flags: { volume: boolean; headerEncrypted: boolean },
): void {
  if (flags.volume) throw new Error('Multi-volume RAR archives are not supported.')
  if (flags.headerEncrypted) throw new Error('Encrypted RAR archives are not supported.')
}

export async function listRarEntries(
  data: ArrayBuffer,
  suppliedWasmBinary?: ArrayBuffer,
): Promise<RarArchiveEntry[]> {
  return runRarOperation(async () => {
    const wasmBinary = suppliedWasmBinary ?? await getWasmBinary()
    const extractor = await createExtractorFromData({ data, wasmBinary })
    const list = extractor.getFileList()
    const headers = [...list.fileHeaders]

    assertSupportedArchive(list.arcHeader.flags)
    if (headers.some((header) => header.flags.encrypted)) {
      throw new Error('Encrypted RAR archives are not supported.')
    }

    return headers
      .filter((header) => !header.flags.directory)
      .map((header) => ({ path: header.name, size: header.unpSize }))
  })
}

export async function extractRarEntry(
  data: ArrayBuffer,
  entryPath: string,
  suppliedWasmBinary?: ArrayBuffer,
): Promise<Uint8Array> {
  return runRarOperation(async () => {
    const wasmBinary = suppliedWasmBinary ?? await getWasmBinary()
    const extractor = await createExtractorFromData({ data, wasmBinary })
    const extracted = extractor.extract({ files: [entryPath] })
    const files = [...extracted.files]

    assertSupportedArchive(extracted.arcHeader.flags)
    const entry = files.find((file) => file.fileHeader.name === entryPath)
    if (entry?.fileHeader.flags.encrypted) {
      throw new Error('Encrypted RAR archives are not supported.')
    }
    if (!entry?.extraction) throw new Error(`RAR entry not found: ${entryPath}`)

    return entry.extraction
  })
}
