import createModule from 'libarchive.js/src/webworker/wasm-gen/libarchive.js'
import wasmUrl from 'libarchive.js/dist/libarchive.wasm?url'

export interface SevenZipEntry {
  index: number
  path: string
  size: number
}

export interface SevenZipReader {
  list(): SevenZipEntry[]
  extract(index: number): Uint8Array<ArrayBuffer>
}

// The decoder uses a 2 GiB WebAssembly heap and 32-bit lengths.
const MAX_DECODER_BYTES = 0x7fffffff
const AE_IFREG = 0o100000

// Keep the native cursor between reads so consecutive pages share the decoded solid block.
export async function createSevenZipReader(file: File, wasmBinary?: ArrayBuffer): Promise<SevenZipReader> {
  if (file.size > MAX_DECODER_BYTES) throw new Error('7z archive exceeds decoder memory')
  const signature = new Uint8Array(await file.slice(0, 6).arrayBuffer())
  if (![0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c].every((byte, i) => signature[i] === byte)) {
    throw new Error('Invalid 7z signature')
  }
  const mod = await createModule({ locateFile: () => wasmUrl, wasmBinary })
  const data = mod._malloc(file.size)
  if (!data) throw new Error('7z archive exceeds available memory')
  mod.HEAPU8.set(new Uint8Array(await file.arrayBuffer()), data)
  const open = mod.cwrap('archive_open', 'number', ['number', 'number', 'string', 'string'])
  const pathname = mod.cwrap('archive_entry_pathname_utf8', 'string', ['number'])
  const errorMessage = mod.cwrap('archive_error_string', 'string', ['number'])
  let archive = open(data, file.size, null, 'en_US.UTF-8')
  let nextIndex = 0

  function rewind(): void {
    mod._archive_close(archive)
    archive = open(data, file.size, null, 'en_US.UTF-8')
    nextIndex = 0
  }
  function next(): number {
    const entry = mod._get_next_entry(archive)
    if (!entry) {
      const error = errorMessage(archive)
      if (error) throw new Error(error)
    } else if (mod._archive_entry_is_encrypted(entry)) {
      throw new Error('Encrypted 7z entry')
    }
    return entry
  }
  function skip(): void {
    if (mod._archive_read_data_skip(archive) < 0) throw new Error(errorMessage(archive) || 'Invalid 7z entry')
  }
  return {
    list(): SevenZipEntry[] {
      if (nextIndex) rewind()
      const entries: SevenZipEntry[] = []
      for (let entry = next(); entry; entry = next()) {
        if (mod._archive_entry_filetype(entry) === AE_IFREG) {
          const path = pathname(entry)
          if (!path) throw new Error('Invalid 7z entry name')
          entries.push({ index: nextIndex, path, size: mod._archive_entry_size(entry) >>> 0 })
        }
        skip()
        nextIndex++
      }
      return entries
    },
    extract(index: number): Uint8Array<ArrayBuffer> {
      if (index < nextIndex) rewind()
      for (let entry = next(); entry; entry = next()) {
        if (nextIndex++ !== index) {
          skip()
          continue
        }
        const size = mod._archive_entry_size(entry) >>> 0
        if (size > MAX_DECODER_BYTES) throw new Error('7z entry exceeds decoder memory')
        if (!size) return new Uint8Array()
        const ptr = mod._get_filedata(archive, size)
        if (ptr <= 0) throw new Error(errorMessage(archive) || 'Could not extract 7z entry')
        try {
          return mod.HEAPU8.slice(ptr, ptr + size)
        } finally {
          mod._free(ptr)
        }
      }
      throw new Error('7z entry not found')
    },
  }
}
