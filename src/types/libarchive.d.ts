declare module 'libarchive.js/src/webworker/wasm-gen/libarchive.js' {
  interface ArchiveModule {
    HEAPU8: Uint8Array
    _malloc(size: number): number
    _free(ptr: number): void
    _get_next_entry(archive: number): number
    _archive_close(archive: number): void
    _archive_entry_filetype(entry: number): number
    _archive_entry_is_encrypted(entry: number): number
    _archive_entry_size(entry: number): number
    _archive_read_data_skip(archive: number): number
    _get_filedata(archive: number, size: number): number
    cwrap(name: 'archive_open', result: 'number', args: ['number', 'number', 'string', 'string']):
      (ptr: number, size: number, passphrase: null, locale: string) => number
    cwrap(name: 'archive_entry_pathname_utf8' | 'archive_error_string', result: 'string', args: ['number']):
      (ptr: number) => string | null
  }

  export default function createModule(options: {
    locateFile: (name: string) => string
    wasmBinary?: ArrayBuffer
  }): Promise<ArchiveModule>
}
