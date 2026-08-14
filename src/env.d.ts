/// <reference types="vite/client" />

interface Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
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
