export type MediaSourceKind = 'folder' | 'files' | 'archive'

export type ArchiveFormat = 'zip' | 'rar'

export type MediaViewMode = 'grid' | 'list'

export type MediaSortKey = 'name' | 'size' | 'format' | 'modified'

export type MediaListColumnKey = 'size' | 'format' | 'resolution' | 'modified'

export type MediaListColumnVisibility = Record<MediaListColumnKey, boolean>

export type MediaTreeNodeKind = 'folder' | 'archive' | 'archive-directory'

export type MediaItemKind =
  | 'image'
  | 'text'
  | 'archive'
  | 'archive-entry'
  | 'archive-text-entry'
  | 'archive-parent'
  | 'folder'
  | 'folder-parent'

export interface MediaItem {
  id: string
  kind: MediaItemKind
  name: string
  path: string
  directoryPath: string
  file: File
  fileHandle?: FileSystemFileHandle
  size: number
  format: string
  lastModified: number
  width?: number
  height?: number
  archiveEntryIndex?: number
  archiveEntryPath?: string
  navigationPath?: string
}

export interface MediaDirectoryNode {
  id: string
  kind: MediaTreeNodeKind
  name: string
  path: string
  directCount: number
  children: MediaDirectoryNode[]
  archiveItemId?: string
  indexed?: boolean
  loaded?: boolean
  loading?: boolean
  expandable?: boolean
}

export interface MediaCollection {
  name: string
  kind: MediaSourceKind
  items: MediaItem[]
  tree: MediaDirectoryNode
}

export interface ArchiveIndex {
  archiveFile: File
  format: ArchiveFormat
  data: ArrayBuffer
  items: MediaItem[]
  nestedArchivePaths: string[]
  tree: MediaDirectoryNode
}
