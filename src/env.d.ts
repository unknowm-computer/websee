/// <reference types="vite/client" />
/// <reference types="dom-chromium-ai" />

interface Window {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: FileSystemHandle
  }) => Promise<FileSystemDirectoryHandle>
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{
      accept: Record<string, string[]>
      description?: string
    }>
  }) => Promise<FileSystemFileHandle>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>
}

interface HTMLInputElement {
  webkitdirectory: boolean
}

interface File {
  readonly webkitRelativePath: string
}

interface DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileSystemFileHandle | FileSystemDirectoryHandle | null>
}
