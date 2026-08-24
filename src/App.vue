<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'

import AppToolbar from '@/components/app/AppToolbar.vue'
import BatchTranslationDialog from '@/components/app/BatchTranslationDialog.vue'
import HelpDialog from '@/components/app/HelpDialog.vue'
import OptionsDialog from '@/components/app/OptionsDialog.vue'
import StatusBar from '@/components/app/StatusBar.vue'
import FileList from '@/components/browser/FileList.vue'
import FolderTree from '@/components/browser/FolderTree.vue'
import ImagePreviewPane from '@/components/browser/ImagePreviewPane.vue'
import TextPreviewPane from '@/components/browser/TextPreviewPane.vue'
import ThumbnailGrid from '@/components/browser/ThumbnailGrid.vue'
import SvgIcon from '@/components/common/SvgIcon.vue'
import ImageViewer from '@/components/viewer/ImageViewer.vue'
import TextViewer from '@/components/viewer/TextViewer.vue'
import { useImageDimensions } from '@/composables/useImageDimensions'
import { useBatchImageTranslation } from '@/composables/useBatchImageTranslation'
import { useObjectUrls } from '@/composables/useObjectUrls'
import { useResizableMediaPanes } from '@/composables/useResizableMediaPanes'
import {
  extractArchiveEntry,
  loadArchiveIndex,
  loadDirectoryHandle,
  loadDirectoryLevel,
  loadSelectedFiles,
} from '@/services/mediaSources'
import { createImageThumbnail } from '@/services/imageThumbnail'
import { createBatchTranslationRun } from '@/services/imageTranslation/batchTranslationSources'
import {
  loadTranslationSidecar,
  requestTranslationSidecarPermission,
  saveTranslationSidecar,
  type TranslationSidecarTarget,
} from '@/services/imageTranslation/translationSidecar'
import type { ImageTranslationResult } from '@/types/imageTranslation'
import type {
  BatchTranslationOptions,
} from '@/types/batchTranslation'
import type {
  ArchiveIndex,
  MediaCollection,
  MediaDirectoryNode,
  MediaItem,
  MediaSortKey,
  MediaViewMode,
} from '@/types/media'
import {
  isArchiveFileName,
  isArchiveMediaItem,
  isImageMediaItem,
  getDirectoryPath,
  naturalCompare,
  sortMediaItems,
} from '@/utils/media'

const collection = ref<MediaCollection>()
const selectedDirectory = ref('')
const selectedItemId = ref<string>()
const viewMode = ref<MediaViewMode>(readViewMode())
const sortKey = ref<MediaSortKey>(readSortKey())
const sortAscending = ref(readBooleanPreference('websee-sort-ascending', true))
const viewerOpen = ref(false)
const textViewerItem = ref<MediaItem>()
const viewerItems = ref<MediaItem[]>([])
const viewerCurrentId = ref<string>()
const viewerSource = ref<'folder' | 'archive'>('folder')
const archiveIndex = ref<ArchiveIndex>()
const archiveOuterItemId = ref<string>()
const selectedArchiveDirectory = ref('')
const pendingTreeNodeId = ref<string>()
const browserTreeNodeId = ref<string>()
const requestedExpandedTreeNodeId = ref<string>()
const archiveSelectedItemId = ref<string>()
const archivePreviewItemId = ref<string>()
const archivePreviewLoading = ref(false)
const archiveIndexing = ref(false)
const archiveIndexingCompleted = ref(0)
const archiveIndexingTotal = ref(0)
const initialSlideshow = ref(false)
const helpOpen = ref(false)
const optionsOpen = ref(false)
const batchTranslationDialogOpen = ref(false)
const loading = ref(false)
const loadingMessage = ref('파일을 읽는 중입니다...')
const errorMessage = ref('')
const dragActive = ref(false)
const folderInput = ref<HTMLInputElement>()
const imageInput = ref<HTMLInputElement>()
const archiveInput = ref<HTMLInputElement>()
const mediaBrowser = ref<HTMLElement>()
const thumbnailGrid = ref<{ moveSelectionByKey: (key: string) => boolean }>()
const currentDirectoryHandle = shallowRef<FileSystemDirectoryHandle>()
let dragDepth = 0
let archiveExtractionRequest = 0
let archivePreviewRequest = 0
let archivePreviewTimer: number | undefined
let archiveIndexingRun = 0
let pendingFolderRefresh: CollectionRestoreState | undefined
let directoryHandleCache = new Map<string, FileSystemDirectoryHandle>()
const directoryLoadRequests = new Map<string, Promise<void>>()
let directoryCollectionGeneration = 0
let directoryNavigationRequest = 0

interface CollectionRestoreState {
  directoryPath: string
  itemPath?: string
}

interface UseCollectionOptions {
  directoryHandle?: FileSystemDirectoryHandle
  directoryHandles?: Map<string, FileSystemDirectoryHandle>
  restore?: CollectionRestoreState
}

const ARCHIVE_ENTRY_CACHE_LIMIT = 3
const ARCHIVE_THUMBNAIL_MAX_ENTRY_SIZE = 128 * 1024 * 1024
const DIRECTORY_PLACEHOLDER_FILE = new File([], 'directory', { lastModified: 0 })
const archiveEntryFiles = new Map<string, File>()
const archiveEntryRequests = new Map<string, Promise<File>>()
const archiveEntryCacheOrder: string[] = []
const archiveThumbnailUrls = reactive(new Map<string, string>())

const { getUrl, revokeAll, revokeItems } = useObjectUrls()
const { ensureDimensions } = useImageDimensions(getUrl)
const {
  active: batchTranslationActive,
  continueTranslation: continueBatchTranslation,
  pause: pauseBatchTranslation,
  resume: resumeBatchTranslation,
  start: startBatchTranslation,
  state: batchTranslationState,
  stop: stopBatchTranslation,
} = useBatchImageTranslation()
const {
  endResize,
  paneStyle,
  previewHeight,
  previewMaxHeight,
  previewMinHeight,
  resetPaneSize,
  resize,
  resizeWithKeyboard,
  resizing,
  sidebarMaxWidth,
  sidebarMinWidth,
  sidebarWidth,
  startResize,
} = useResizableMediaPanes(mediaBrowser)

const directoryItems = computed(() => {
  if (!collection.value) return []
  return collection.value.items.filter((item) => item.directoryPath === selectedDirectory.value)
})
const visibleItems = computed(() =>
  sortMediaItems(directoryItems.value, sortKey.value, sortAscending.value),
)
const selectedDirectoryNode = computed(() =>
  collection.value ? findDirectoryNode(collection.value.tree, selectedDirectory.value) : undefined,
)
const childFolderItems = computed(() =>
  (selectedDirectoryNode.value?.children ?? [])
    .filter((node) => node.kind === 'folder')
    .map((node) => createFolderItem(node, selectedDirectory.value)),
)
const folderParentItem = computed<MediaItem | undefined>(() => {
  if (!collection.value || !selectedDirectory.value) return undefined
  const file = collection.value.items[0]?.file ?? DIRECTORY_PLACEHOLDER_FILE

  return {
    id: `folder-parent:${selectedDirectory.value}`,
    kind: 'folder-parent',
    name: '..',
    path: '상위 폴더로',
    directoryPath: selectedDirectory.value,
    file,
    size: 0,
    format: '상위 폴더',
    lastModified: file.lastModified,
    navigationPath: getDirectoryPath(selectedDirectory.value),
  }
})
const folderBrowserItems = computed(() => {
  const items = sortMediaItems(
    [...childFolderItems.value, ...directoryItems.value],
    sortKey.value,
    sortAscending.value,
  )
  return folderParentItem.value ? [folderParentItem.value, ...items] : items
})
const selectedItem = computed(() =>
  collection.value?.items.find((item) => item.id === selectedItemId.value),
)
const archiveBrowsing = computed(() => archiveIndex.value !== undefined)
const archiveItems = computed(() =>
  sortMediaItems(archiveIndex.value?.items ?? [], sortKey.value, sortAscending.value),
)
const archiveDirectoryNode = computed(() =>
  archiveIndex.value
    ? findDirectoryNode(archiveIndex.value.tree, selectedArchiveDirectory.value)
    : undefined,
)
const archiveDirectoryItems = computed(() =>
  sortMediaItems(
    (archiveIndex.value?.items ?? []).filter(
      (item) => item.directoryPath === selectedArchiveDirectory.value,
    ),
    sortKey.value,
    sortAscending.value,
  ),
)
const archiveChildFolderItems = computed(() =>
  (archiveDirectoryNode.value?.children ?? [])
    .filter((node) => node.kind === 'folder')
    .map(createArchiveFolderItem),
)
const archiveParentItem = computed<MediaItem | undefined>(() => {
  const index = archiveIndex.value
  const outerItemId = archiveOuterItemId.value
  if (!index || !outerItemId) return undefined

  return {
    id: `archive-parent:${outerItemId}:${selectedArchiveDirectory.value}`,
    kind: 'archive-parent',
    name: '..',
    path: '상위 폴더로',
    directoryPath: selectedArchiveDirectory.value,
    file: index.archiveFile,
    size: 0,
    format: '상위 폴더',
    lastModified: index.archiveFile.lastModified,
    navigationPath: getDirectoryPath(selectedArchiveDirectory.value),
  }
})
const archiveBrowserItems = computed(() => {
  const items = sortMediaItems(
    [...archiveChildFolderItems.value, ...archiveDirectoryItems.value],
    sortKey.value,
    sortAscending.value,
  )
  return archiveParentItem.value ? [archiveParentItem.value, ...items] : items
})
const browserItems = computed(() =>
  archiveBrowsing.value
    ? archiveBrowserItems.value
    : folderBrowserItems.value,
)
const statusItems = computed(() =>
  archiveBrowsing.value ? archiveDirectoryItems.value : directoryItems.value,
)
const statusImageCount = computed(() =>
  statusItems.value.filter(
    (item) => item.kind === 'image' || item.kind === 'archive-entry',
  ).length,
)
const statusTotalCount = computed(() =>
  browserItems.value.filter(
    (item) => item.kind !== 'folder-parent' && item.kind !== 'archive-parent',
  ).length,
)
const archiveIndexingStatus = computed(() =>
  archiveBrowsing.value && archiveIndexing.value
    ? `미리보기 ${archiveIndexingCompleted.value}/${archiveIndexingTotal.value}`
    : undefined,
)
const browserSelectedId = computed(() =>
  archiveBrowsing.value ? archiveSelectedItemId.value : selectedItemId.value,
)
const selectedTreeNodeId = computed(() => {
  if (pendingTreeNodeId.value) return pendingTreeNodeId.value
  if (browserTreeNodeId.value) return browserTreeNodeId.value
  const outerItemId = archiveOuterItemId.value
  if (!archiveBrowsing.value || !outerItemId) return `folder:${selectedDirectory.value}`
  return selectedArchiveDirectory.value
    ? `archive-directory:${outerItemId}:${selectedArchiveDirectory.value}`
    : `archive:${outerItemId}`
})
const selectedBrowserItem = computed(() =>
  browserItems.value.find((item) => item.id === browserSelectedId.value),
)
const selectedTextPreviewItem = computed(() => {
  const item = selectedBrowserItem.value
  if (item?.kind === 'text') return item
  if (item?.kind === 'archive-text-entry' && item.id === archivePreviewItemId.value) return item
  return undefined
})
const canOpenViewer = computed(() => browserItems.value.length > 0)
const canRefreshCollection = computed(() =>
  Boolean(currentDirectoryHandle.value || collection.value?.kind === 'folder'),
)
const batchSourceItems = computed(() =>
  (collection.value?.items ?? []).filter(
    (item) => item.directoryPath === selectedDirectory.value
      && (item.kind === 'image' || item.kind === 'archive'),
  ),
)
const batchImageCount = computed(() =>
  batchSourceItems.value.filter((item) => item.kind === 'image').length,
)
const batchArchiveCount = computed(() =>
  batchSourceItems.value.filter((item) => item.kind === 'archive').length,
)
const batchFolderLabel = computed(() =>
  selectedDirectoryNode.value?.name ?? collection.value?.name ?? '현재 폴더',
)
const canBatchTranslate = computed(() =>
  batchTranslationActive.value
  || Boolean(
    directoryHandleCache.get(selectedDirectory.value)
    && (batchImageCount.value > 0 || batchArchiveCount.value > 0),
  ),
)

function readViewMode(): MediaViewMode {
  return localStorage.getItem('websee-view-mode') === 'list' ? 'list' : 'grid'
}

function readSortKey(): MediaSortKey {
  const value = localStorage.getItem('websee-sort-key')
  return value === 'size' || value === 'format' || value === 'modified' ? value : 'name'
}

function readBooleanPreference(key: string, fallback: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? fallback : value === 'true'
}

function findDirectoryNode(
  node: MediaDirectoryNode,
  path: string,
): MediaDirectoryNode | undefined {
  if (node.kind === 'folder' && node.path === path) return node
  for (const child of node.children) {
    const match = findDirectoryNode(child, path)
    if (match) return match
  }
  return undefined
}

function createFolderItem(node: MediaDirectoryNode, parentPath: string): MediaItem {
  const file = collection.value?.items.find(
    (item) => item.path === node.path || item.path.startsWith(`${node.path}/`),
  )?.file ?? DIRECTORY_PLACEHOLDER_FILE

  return {
    id: `folder:${node.path}`,
    kind: 'folder',
    name: node.name,
    path: node.path,
    directoryPath: parentPath,
    file,
    size: 0,
    format: '폴더',
    lastModified: file.lastModified,
    navigationPath: node.path,
  }
}

function createArchiveFolderItem(node: MediaDirectoryNode): MediaItem {
  const index = archiveIndex.value
  const outerItemId = archiveOuterItemId.value
  if (!index || !outerItemId) throw new Error('Archive folder context is missing.')

  return {
    id: `archive-folder:${outerItemId}:${node.path}`,
    kind: 'folder',
    name: node.name,
    path: node.path,
    directoryPath: selectedArchiveDirectory.value,
    file: index.archiveFile,
    size: 0,
    format: '폴더',
    lastModified: index.archiveFile.lastModified,
    navigationPath: node.path,
  }
}

function findTreeNodeById(
  node: MediaDirectoryNode,
  id: string,
): MediaDirectoryNode | undefined {
  if (node.id === id) return node
  for (const child of node.children) {
    const match = findTreeNodeById(child, id)
    if (match) return match
  }
  return undefined
}

function createArchiveDirectoryTreeNode(
  node: MediaDirectoryNode,
  archiveItemId: string,
): MediaDirectoryNode {
  return {
    id: `archive-directory:${archiveItemId}:${node.path}`,
    kind: 'archive-directory',
    name: node.name,
    path: node.path,
    directCount: node.directCount,
    children: node.children.map((child) =>
      createArchiveDirectoryTreeNode(child, archiveItemId)),
    archiveItemId,
    indexed: true,
  }
}

function syncArchiveTree(item: MediaItem, index: ArchiveIndex): void {
  const tree = collection.value?.tree
  if (!tree) return
  const archiveNode = findTreeNodeById(tree, `archive:${item.id}`)
  if (!archiveNode) return

  archiveNode.directCount = index.tree.directCount
  archiveNode.children = index.tree.children.map((node) =>
    createArchiveDirectoryTreeNode(node, item.id))
  archiveNode.indexed = true
}

function getArchiveThumbnailUrl(item: MediaItem): string | undefined {
  return item.kind === 'archive-entry' ? archiveThumbnailUrls.get(item.id) : undefined
}

function clearArchiveThumbnails(): void {
  for (const url of archiveThumbnailUrls.values()) URL.revokeObjectURL(url)
  archiveThumbnailUrls.clear()
}

function cancelArchiveIndexing(): void {
  archiveIndexingRun += 1
  archiveIndexing.value = false
  archiveIndexingCompleted.value = 0
  archiveIndexingTotal.value = 0
}

function disposeArchiveBrowser(): void {
  archiveExtractionRequest += 1
  cancelArchivePreview()
  cancelArchiveIndexing()
  clearArchiveThumbnails()

  if (archiveIndex.value) {
    revokeItems(archiveIndex.value.items)
    for (const item of archiveIndex.value.items) item.file = archiveIndex.value.archiveFile
  }

  archiveEntryFiles.clear()
  archiveEntryRequests.clear()
  archiveEntryCacheOrder.splice(0)
  archiveIndex.value = undefined
  archiveOuterItemId.value = undefined
  selectedArchiveDirectory.value = ''
  archiveSelectedItemId.value = undefined
}

function leaveArchiveBrowser(): void {
  const outerItemId = archiveOuterItemId.value
  closeViewer()
  closeTextViewer()
  disposeArchiveBrowser()
  selectedItemId.value = outerItemId
  browserTreeNodeId.value = outerItemId ? `archive:${outerItemId}` : undefined
}

function ensureFolderLoaded(node: MediaDirectoryNode): Promise<void> {
  if (node.kind !== 'folder' || node.loaded !== false) return Promise.resolve()

  const existingRequest = directoryLoadRequests.get(node.path)
  if (existingRequest) return existingRequest

  const handle = directoryHandleCache.get(node.path)
  const activeCollection = collection.value
  const generation = directoryCollectionGeneration
  if (!handle || !activeCollection) return Promise.resolve()

  node.loading = true
  let request!: Promise<void>
  request = (async () => {
    try {
      const level = await loadDirectoryLevel(handle, node.path)
      if (
        generation !== directoryCollectionGeneration
        || collection.value !== activeCollection
      ) return

      for (const [path, childHandle] of level.handles) {
        directoryHandleCache.set(path, childHandle)
      }
      activeCollection.items.push(...level.items)
      node.children = level.children
      node.directCount = level.items.length
      node.loaded = true
      node.expandable = level.children.length > 0
    } catch (error) {
      const message = describeError(error, `${node.name} 폴더를 읽지 못했습니다.`)
      if (message) showError(message)
    } finally {
      if (generation === directoryCollectionGeneration) node.loading = false
      if (directoryLoadRequests.get(node.path) === request) {
        directoryLoadRequests.delete(node.path)
      }
    }
  })()

  directoryLoadRequests.set(node.path, request)
  return request
}

async function ensureDirectoryPathLoaded(path: string): Promise<MediaDirectoryNode | undefined> {
  const root = collection.value?.tree
  if (!root) return undefined
  if (!path) return root

  let currentNode = root
  let currentPath = ''
  for (const part of path.split('/').filter(Boolean)) {
    await ensureFolderLoaded(currentNode)
    currentPath = currentPath ? `${currentPath}/${part}` : part
    const child = currentNode.children.find(
      (candidate) => candidate.kind === 'folder' && candidate.path === currentPath,
    )
    if (!child) return undefined
    currentNode = child
  }
  await ensureFolderLoaded(currentNode)
  return currentNode
}

async function useCollection(
  nextCollection: MediaCollection,
  options: UseCollectionOptions = {},
): Promise<void> {
  closeViewer()
  closeTextViewer()
  disposeArchiveBrowser()
  revokeAll()
  directoryCollectionGeneration += 1
  directoryNavigationRequest += 1
  directoryLoadRequests.clear()
  directoryHandleCache = options.directoryHandles ?? new Map()
  currentDirectoryHandle.value = options.directoryHandle
  collection.value = nextCollection
  const restoredNode = options.restore?.directoryPath
    ? await ensureDirectoryPathLoaded(options.restore.directoryPath)
    : undefined
  selectedDirectory.value = restoredNode?.path ?? ''
  await nextTick()
  selectedItemId.value = folderBrowserItems.value.find(
    (item) => item.path === options.restore?.itemPath,
  )?.id ?? folderBrowserItems.value[0]?.id
  if (selectedItem.value) void ensureDimensions(selectedItem.value)
}

function showError(message: string): void {
  errorMessage.value = message
  window.setTimeout(() => {
    if (errorMessage.value === message) errorMessage.value = ''
  }, 6000)
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  if (error instanceof Error && /encrypted|password/i.test(error.message)) {
    return '암호화된 압축파일은 지원하지 않습니다.'
  }
  if (error instanceof Error && /multi-volume|volume archive|multi-part/i.test(error.message)) {
    return '분할 RAR 압축파일은 지원하지 않습니다.'
  }
  return fallback
}

async function openDirectory(): Promise<void> {
  pendingFolderRefresh = undefined
  if (!window.showDirectoryPicker) {
    folderInput.value?.click()
    return
  }

  try {
    const handle = await window.showDirectoryPicker()
    loadingMessage.value = '폴더의 이미지, 텍스트와 압축파일을 찾는 중입니다...'
    loading.value = true
    const loadedDirectory = await loadDirectoryHandle(handle)
    await useCollection(loadedDirectory.collection, {
      directoryHandle: handle,
      directoryHandles: loadedDirectory.handles,
    })
  } catch (error) {
    const message = describeError(error, '폴더를 읽지 못했습니다. 접근 권한을 확인해주세요.')
    if (message) showError(message)
  } finally {
    loading.value = false
  }
}

async function handleFolderSelection(event: Event): Promise<void> {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement) || !input.files?.length) return

  loadingMessage.value = '폴더의 이미지, 텍스트와 압축파일을 정리하는 중입니다...'
  loading.value = true
  try {
    const nextCollection = loadSelectedFiles([...input.files])
    const restore = pendingFolderRefresh
    pendingFolderRefresh = undefined
    await useCollection(nextCollection, { restore })
    if (!nextCollection.items.length) showError('지원하는 이미지, 텍스트 또는 압축파일이 없는 폴더입니다.')
  } finally {
    loading.value = false
    input.value = ''
  }
}

function getCollectionRestoreState(): CollectionRestoreState {
  const outerArchiveItem = archiveOuterItemId.value
    ? collection.value?.items.find((item) => item.id === archiveOuterItemId.value)
    : undefined

  return {
    directoryPath: selectedDirectory.value,
    itemPath: outerArchiveItem?.path ?? selectedBrowserItem.value?.path,
  }
}

async function refreshCollection(): Promise<void> {
  if (!collection.value || !canRefreshCollection.value) return

  const restore = getCollectionRestoreState()
  const handle = currentDirectoryHandle.value
  if (!handle) {
    pendingFolderRefresh = restore
    folderInput.value?.click()
    return
  }

  loadingMessage.value = '현재 폴더의 파일 목록을 새로고침하는 중입니다...'
  loading.value = true
  try {
    const loadedDirectory = await loadDirectoryHandle(handle)
    await useCollection(loadedDirectory.collection, {
      directoryHandle: handle,
      directoryHandles: loadedDirectory.handles,
      restore,
    })
  } catch (error) {
    const message = describeError(error, '파일 목록을 새로고침하지 못했습니다. 폴더 접근 권한을 확인해주세요.')
    if (message) showError(message)
  } finally {
    loading.value = false
  }
}

async function handleImageSelection(event: Event): Promise<void> {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement) || !input.files?.length) return

  await useCollection(loadSelectedFiles([...input.files]))
  input.value = ''
}

async function openArchiveFile(file: File): Promise<void> {
  const nextCollection = loadSelectedFiles([file])
  await useCollection(nextCollection)
  const archiveItem = nextCollection.items[0]
  if (archiveItem) await enterArchiveBrowser(archiveItem)
}

async function handleArchiveSelection(event: Event): Promise<void> {
  const input = event.currentTarget
  if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return
  await openArchiveFile(input.files[0])
  input.value = ''
}

async function getDroppedDirectoryHandles(
  dataTransfer: DataTransfer,
): Promise<FileSystemDirectoryHandle[]> {
  const handleRequests = [...dataTransfer.items]
    .filter((item) => item.kind === 'file' && item.getAsFileSystemHandle)
    .map((item) => item.getAsFileSystemHandle?.())
  const handles = await Promise.all(handleRequests)

  return handles.filter(
    (handle): handle is FileSystemDirectoryHandle => handle?.kind === 'directory',
  )
}

async function handleDrop(event: DragEvent): Promise<void> {
  dragDepth = 0
  dragActive.value = false
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return

  try {
    const directoryHandles = await getDroppedDirectoryHandles(dataTransfer)
    if (directoryHandles.length > 1) {
      showError('폴더는 한 번에 하나씩 놓아주세요.')
      return
    }
    if (directoryHandles[0]) {
      const handle = directoryHandles[0]
      loadingMessage.value = `${handle.name} 폴더의 이미지, 텍스트와 압축파일을 찾는 중입니다...`
      loading.value = true
      const loadedDirectory = await loadDirectoryHandle(handle)
      await useCollection(loadedDirectory.collection, {
        directoryHandle: handle,
        directoryHandles: loadedDirectory.handles,
      })
      return
    }
  } catch (error) {
    const message = describeError(error, '놓은 폴더를 읽지 못했습니다. 접근 권한을 확인해주세요.')
    if (message) showError(message)
    return
  } finally {
    loading.value = false
  }

  const files = [...dataTransfer.files]
  if (!files.length) return

  if (files.length === 1 && isArchiveFileName(files[0].name)) {
    await openArchiveFile(files[0])
    return
  }

  const nextCollection = loadSelectedFiles(files)
  if (!nextCollection.items.length) {
    showError('지원하는 이미지, 텍스트 또는 압축파일을 놓아주세요.')
    return
  }
  await useCollection(nextCollection)
}

function handleDragEnter(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return
  dragDepth += 1
  dragActive.value = true
}

function handleDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragActive.value = false
}

async function selectDirectory(path: string, preferredItemId?: string): Promise<void> {
  const requestId = ++directoryNavigationRequest
  if (archiveBrowsing.value) leaveArchiveBrowser()
  browserTreeNodeId.value = undefined
  cancelArchivePreview()
  selectedDirectory.value = path
  selectedItemId.value = undefined
  await ensureDirectoryPathLoaded(path)
  if (requestId !== directoryNavigationRequest || selectedDirectory.value !== path) return

  const hasPreferredItem = folderBrowserItems.value.some((item) => item.id === preferredItemId)
  selectedItemId.value = hasPreferredItem
    ? preferredItemId
    : folderBrowserItems.value[0]?.id
  if (hasPreferredItem) browserTreeNodeId.value = preferredItemId
  if (selectedItem.value) void ensureDimensions(selectedItem.value)
}

function selectArchiveDirectory(path: string, preferredItemId?: string): void {
  const index = archiveIndex.value
  if (!index || !findDirectoryNode(index.tree, path)) return

  browserTreeNodeId.value = undefined
  cancelArchivePreview()
  selectedArchiveDirectory.value = path
  const hasPreferredItem = archiveBrowserItems.value.some((item) => item.id === preferredItemId)
  archiveSelectedItemId.value = hasPreferredItem
    ? preferredItemId
    : archiveBrowserItems.value[0]?.id
  if (hasPreferredItem && preferredItemId?.startsWith('archive-folder:')) {
    const outerItemId = archiveOuterItemId.value
    const treePath = preferredItemId.slice(`archive-folder:${outerItemId}:`.length)
    browserTreeNodeId.value = `archive-directory:${outerItemId}:${treePath}`
  }
}

async function selectTreeNode(node: MediaDirectoryNode): Promise<void> {
  if (node.kind === 'folder') {
    await selectDirectory(node.path)
    return
  }

  pendingTreeNodeId.value = node.id

  try {
    const archiveItemId = node.archiveItemId
    const archiveItem = collection.value?.items.find((item) => item.id === archiveItemId)
    if (!archiveItem || archiveItem.kind !== 'archive') return

    if (!archiveBrowsing.value || archiveOuterItemId.value !== archiveItem.id) {
      await enterArchiveBrowser(archiveItem)
    }
    if (!archiveBrowsing.value || archiveOuterItemId.value !== archiveItem.id) return

    selectArchiveDirectory(node.kind === 'archive-directory' ? node.path : '')
  } finally {
    if (pendingTreeNodeId.value === node.id) pendingTreeNodeId.value = undefined
  }
}

function expandTreeNode(node: MediaDirectoryNode): void {
  if (node.kind === 'folder') void ensureFolderLoaded(node)
}

function selectItem(id: string): void {
  selectedItemId.value = id
  if (selectedItem.value) void ensureDimensions(selectedItem.value)
}

function selectBrowserItem(id: string): void {
  if (archiveBrowsing.value) {
    archiveSelectedItemId.value = id
    const item = browserItems.value.find((candidate) => candidate.id === id)
    const outerItemId = archiveOuterItemId.value
    if (outerItemId && item) {
      const treePath = item.kind === 'folder'
        ? item.navigationPath ?? ''
        : selectedArchiveDirectory.value
      browserTreeNodeId.value = treePath
        ? `archive-directory:${outerItemId}:${treePath}`
        : `archive:${outerItemId}`
    }
    if (item?.kind === 'archive-entry' || item?.kind === 'archive-text-entry') {
      scheduleArchivePreview(item)
    }
    else cancelArchivePreview()
    return
  }

  cancelArchivePreview()
  selectItem(id)
  const item = browserItems.value.find((candidate) => candidate.id === id)
  if (!item) return
  if (item.kind === 'archive') {
    browserTreeNodeId.value = `archive:${item.id}`
  } else if (item.kind === 'folder') {
    browserTreeNodeId.value = `folder:${item.navigationPath ?? ''}`
  } else if (item.kind === 'folder-parent') {
    browserTreeNodeId.value = `folder:${selectedDirectory.value}`
  } else {
    browserTreeNodeId.value = `folder:${selectedDirectory.value}`
  }
}

function openFolderImage(item: MediaItem, slideshow: boolean): void {
  const images = visibleItems.value.filter(isImageMediaItem)
  if (!images.some((image) => image.id === item.id)) return

  viewerSource.value = 'folder'
  viewerItems.value = images
  viewerCurrentId.value = item.id
  selectedItemId.value = item.id
  initialSlideshow.value = slideshow
  viewerOpen.value = true
}

function openTextViewer(item: MediaItem): void {
  if (item.kind !== 'text') return
  closeViewer()
  textViewerItem.value = item
  selectedItemId.value = item.id
}

function closeTextViewer(): void {
  textViewerItem.value = undefined
}

async function enterArchiveBrowser(item: MediaItem): Promise<void> {
  closeViewer()
  closeTextViewer()
  if (archiveBrowsing.value) disposeArchiveBrowser()

  loadingMessage.value = `${item.name} 파일 목록을 읽는 중입니다...`
  loading.value = true

  try {
    const index = await loadArchiveIndex(item.file)
    index.items.sort((left, right) => naturalCompare(left.path, right.path))
    syncArchiveTree(item, index)

    const archiveTreeNodeId = `archive:${item.id}`
    if (requestedExpandedTreeNodeId.value === archiveTreeNodeId) {
      requestedExpandedTreeNodeId.value = undefined
      await nextTick()
      requestedExpandedTreeNodeId.value = archiveTreeNodeId
    }

    if (!index.items.length) {
      showError('압축파일은 정상이지만 WebSee에서 지원하는 이미지나 텍스트가 없습니다.')
      return
    }

    selectedItemId.value = item.id
    archiveOuterItemId.value = item.id
    selectedArchiveDirectory.value = ''
    archiveIndex.value = index
    archiveSelectedItemId.value = archiveParentItem.value?.id
    startArchiveIndexing(archiveIndex.value)
  } catch (error) {
    const message = describeError(error, '압축파일을 열지 못했습니다. 파일이 손상되지 않았는지 확인해주세요.')
    if (message) showError(message)
  } finally {
    loading.value = false
  }
}

function touchArchiveCache(id: string): void {
  const existingIndex = archiveEntryCacheOrder.indexOf(id)
  if (existingIndex >= 0) archiveEntryCacheOrder.splice(existingIndex, 1)
  archiveEntryCacheOrder.push(id)
}

function cancelArchivePreview(clearReadyItem = true): void {
  archivePreviewRequest += 1
  if (archivePreviewTimer !== undefined) window.clearTimeout(archivePreviewTimer)
  archivePreviewTimer = undefined
  archivePreviewLoading.value = false
  if (clearReadyItem) archivePreviewItemId.value = undefined
}

function scheduleArchivePreview(item: MediaItem): void {
  cancelArchivePreview()

  const cachedFile = archiveEntryFiles.get(item.id)
  if (cachedFile) {
    item.file = cachedFile
    touchArchiveCache(item.id)
    archivePreviewItemId.value = item.id
    return
  }

  const requestId = archivePreviewRequest
  archivePreviewLoading.value = true
  archivePreviewTimer = window.setTimeout(() => {
    archivePreviewTimer = undefined
    void prepareArchivePreview(item, requestId)
  }, 160)
}

async function prepareArchivePreview(item: MediaItem, requestId: number): Promise<void> {
  const index = archiveIndex.value
  if (
    !index
    || (item.kind !== 'archive-entry' && item.kind !== 'archive-text-entry')
  ) return

  try {
    const file = await getArchiveEntryFile(index, item)
    if (
      requestId !== archivePreviewRequest
      || archiveIndex.value !== index
      || archiveSelectedItemId.value !== item.id
    ) return

    cacheArchiveEntry(index, item, file)
    archivePreviewItemId.value = item.id
  } catch (error) {
    if (requestId !== archivePreviewRequest) return
    const message = describeError(error, '압축파일 안의 미리보기를 만들지 못했습니다.')
    if (message) showError(message)
  } finally {
    if (requestId === archivePreviewRequest) archivePreviewLoading.value = false
  }
}

async function getArchiveEntryFile(index: ArchiveIndex, item: MediaItem): Promise<File> {
  const cached = archiveEntryFiles.get(item.id)
  if (cached) {
    touchArchiveCache(item.id)
    return cached
  }

  const existingRequest = archiveEntryRequests.get(item.id)
  if (existingRequest) return existingRequest

  const request = extractArchiveEntry(index, item)
  archiveEntryRequests.set(item.id, request)

  try {
    return await request
  } finally {
    if (archiveEntryRequests.get(item.id) === request) archiveEntryRequests.delete(item.id)
  }
}

function getNextArchiveIndexingItem(
  index: ArchiveIndex,
  pendingIds: ReadonlySet<string>,
): MediaItem | undefined {
  const currentDirectoryItem = archiveDirectoryItems.value.find((item) => pendingIds.has(item.id))
  return currentDirectoryItem ?? index.items.find((item) => pendingIds.has(item.id))
}

async function processArchiveIndexing(index: ArchiveIndex, runId: number): Promise<void> {
  const imageItems = index.items.filter((item) => item.kind === 'archive-entry')
  const pendingIds = new Set(imageItems.map((item) => item.id))

  while (pendingIds.size && archiveIndexingRun === runId && archiveIndex.value === index) {
    const item = getNextArchiveIndexingItem(index, pendingIds)
    if (!item) break

    try {
      if (item.size > ARCHIVE_THUMBNAIL_MAX_ENTRY_SIZE) {
        throw new Error('Archive entry is too large for background thumbnailing.')
      }
      const file = await getArchiveEntryFile(index, item)
      const thumbnail = await createImageThumbnail(file)
      if (archiveIndexingRun !== runId || archiveIndex.value !== index) return

      item.width = thumbnail.width
      item.height = thumbnail.height
      const previousUrl = archiveThumbnailUrls.get(item.id)
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      archiveThumbnailUrls.set(item.id, URL.createObjectURL(thumbnail.blob))
    } catch {
      // An unreadable image should not stop metadata indexing for the remaining archive entries.
    } finally {
      pendingIds.delete(item.id)
      if (archiveIndexingRun === runId && archiveIndex.value === index) {
        archiveIndexingCompleted.value = archiveIndexingTotal.value - pendingIds.size
      }
    }

    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  }

  if (archiveIndexingRun === runId && archiveIndex.value === index) {
    archiveIndexing.value = false
  }
}

function startArchiveIndexing(index: ArchiveIndex): void {
  const imageCount = index.items.filter((item) => item.kind === 'archive-entry').length
  const runId = ++archiveIndexingRun
  archiveIndexingCompleted.value = 0
  archiveIndexingTotal.value = imageCount
  archiveIndexing.value = imageCount > 0
  if (archiveIndexing.value) void processArchiveIndexing(index, runId)
}

function cacheArchiveEntry(index: ArchiveIndex, item: MediaItem, file: File): void {
  item.file = file
  archiveEntryFiles.set(item.id, file)
  touchArchiveCache(item.id)
  void ensureDimensions(item)

  while (archiveEntryCacheOrder.length > ARCHIVE_ENTRY_CACHE_LIMIT) {
    const evictIndex = archiveEntryCacheOrder.findIndex(
      (id) => id !== item.id
        && id !== viewerCurrentId.value
        && id !== textViewerItem.value?.id,
    )
    if (evictIndex < 0) break

    const [evictedId] = archiveEntryCacheOrder.splice(evictIndex, 1)
    const evictedItem = index.items.find((candidate) => candidate.id === evictedId)
    if (evictedItem) {
      revokeItems([evictedItem])
      evictedItem.file = index.archiveFile
    }
    archiveEntryFiles.delete(evictedId)
  }
}

async function openArchiveEntry(item: MediaItem): Promise<void> {
  const index = archiveIndex.value
  if (!index || item.kind !== 'archive-entry') return

  cancelArchivePreview()
  const requestId = ++archiveExtractionRequest
  const previousSelectedId = archiveSelectedItemId.value
  archiveSelectedItemId.value = item.id
  loadingMessage.value = `${item.name} 이미지를 여는 중입니다...`
  loading.value = true

  try {
    const file = await getArchiveEntryFile(index, item)
    if (requestId !== archiveExtractionRequest || archiveIndex.value !== index) return

    cacheArchiveEntry(index, item, file)
    archivePreviewItemId.value = item.id
    viewerSource.value = 'archive'
    viewerItems.value = archiveItems.value.filter(
      (candidate) => candidate.kind === 'archive-entry',
    )
    viewerCurrentId.value = item.id
    initialSlideshow.value = false
    viewerOpen.value = true
  } catch (error) {
    if (requestId !== archiveExtractionRequest) return
    archiveSelectedItemId.value = previousSelectedId
    const message = describeError(error, '압축파일 안의 이미지를 열지 못했습니다.')
    if (message) showError(message)
  } finally {
    if (requestId === archiveExtractionRequest) loading.value = false
  }
}

async function openArchiveTextEntry(item: MediaItem): Promise<void> {
  const index = archiveIndex.value
  if (!index || item.kind !== 'archive-text-entry') return

  closeViewer()
  closeTextViewer()
  cancelArchivePreview()
  const requestId = ++archiveExtractionRequest
  const previousSelectedId = archiveSelectedItemId.value
  archiveSelectedItemId.value = item.id
  loadingMessage.value = `${item.name} 텍스트를 여는 중입니다...`
  loading.value = true

  try {
    const file = await getArchiveEntryFile(index, item)
    if (requestId !== archiveExtractionRequest || archiveIndex.value !== index) return

    cacheArchiveEntry(index, item, file)
    archivePreviewItemId.value = item.id
    textViewerItem.value = item
  } catch (error) {
    if (requestId !== archiveExtractionRequest) return
    archiveSelectedItemId.value = previousSelectedId
    const message = describeError(error, '압축파일 안의 텍스트를 열지 못했습니다.')
    if (message) showError(message)
  } finally {
    if (requestId === archiveExtractionRequest) loading.value = false
  }
}

function openViewer(id?: string, slideshow = false): void {
  const targetId = id ?? browserSelectedId.value ?? browserItems.value[0]?.id
  if (!targetId) return

  const item = browserItems.value.find((candidate) => candidate.id === targetId)
  if (!item) return

  if (item.kind === 'folder') {
    if (archiveBrowsing.value) {
      const outerItemId = archiveOuterItemId.value
      requestedExpandedTreeNodeId.value = outerItemId
        ? `archive-directory:${outerItemId}:${item.navigationPath ?? ''}`
        : undefined
      selectArchiveDirectory(item.navigationPath ?? '')
    } else {
      requestedExpandedTreeNodeId.value = `folder:${item.navigationPath ?? ''}`
      selectDirectory(item.navigationPath ?? '')
    }
    return
  }

  if (item.kind === 'folder-parent') {
    const previousPath = selectedDirectory.value
    selectDirectory(item.navigationPath ?? '', `folder:${previousPath}`)
    return
  }

  if (item.kind === 'archive-parent') {
    if (selectedArchiveDirectory.value) {
      const previousPath = selectedArchiveDirectory.value
      const outerItemId = archiveOuterItemId.value
      selectArchiveDirectory(
        item.navigationPath ?? '',
        outerItemId ? `archive-folder:${outerItemId}:${previousPath}` : undefined,
      )
    } else {
      leaveArchiveBrowser()
    }
    return
  }

  if (item.kind === 'archive-entry') {
    void openArchiveEntry(item)
    return
  }

  if (item.kind === 'archive-text-entry') {
    void openArchiveTextEntry(item)
    return
  }

  if (item.kind === 'text') {
    openTextViewer(item)
    return
  }

  if (isArchiveMediaItem(item)) {
    requestedExpandedTreeNodeId.value = `archive:${item.id}`
    void enterArchiveBrowser(item)
    return
  }

  openFolderImage(item, slideshow)
}

function selectViewerItem(id: string): void {
  if (viewerSource.value === 'archive') {
    const item = archiveItems.value.find((candidate) => candidate.id === id)
    if (item) void openArchiveEntry(item)
    return
  }

  viewerCurrentId.value = id
  selectItem(id)
}

function closeViewer(): void {
  if (viewerSource.value === 'archive') {
    archiveExtractionRequest += 1
    loading.value = false
  }

  if (viewerSource.value === 'archive' && viewerCurrentId.value) {
    archiveSelectedItemId.value = viewerCurrentId.value
  }

  viewerOpen.value = false
  initialSlideshow.value = false
  viewerItems.value = []
  viewerCurrentId.value = undefined
  viewerSource.value = 'folder'
}

function updateDimensions(item: MediaItem, width: number, height: number): void {
  if (item.kind !== 'image' && item.kind !== 'archive-entry') return
  item.width = width
  item.height = height
}

function requestDimensions(item: MediaItem): void {
  if (item.kind === 'image') void ensureDimensions(item)
}

function getTranslationSidecarTarget(item: MediaItem): TranslationSidecarTarget | undefined {
  if (item.kind === 'image') {
    const directoryHandle = directoryHandleCache.get(item.directoryPath)
    return directoryHandle
      ? { directoryHandle, sourceItem: item }
      : undefined
  }

  if (item.kind !== 'archive-entry') return undefined
  const sourceItem = archiveOuterItemId.value
    ? collection.value?.items.find((candidate) => candidate.id === archiveOuterItemId.value)
    : undefined
  if (!sourceItem) return undefined
  const directoryHandle = directoryHandleCache.get(sourceItem.directoryPath)
  return directoryHandle
    ? { directoryHandle, sourceItem, archiveEntryPath: item.path }
    : undefined
}

async function loadSavedTranslation(
  item: MediaItem,
): Promise<ImageTranslationResult | undefined> {
  const target = getTranslationSidecarTarget(item)
  return target ? await loadTranslationSidecar(target, item) : undefined
}

async function prepareTranslationPersistence(item: MediaItem): Promise<boolean> {
  const target = getTranslationSidecarTarget(item)
  return target ? await requestTranslationSidecarPermission(target) : false
}

async function saveTranslation(
  item: MediaItem,
  result: ImageTranslationResult,
): Promise<void> {
  const target = getTranslationSidecarTarget(item)
  if (!target) throw new Error('번역 결과를 저장할 원본 폴더 핸들이 없습니다.')
  await saveTranslationSidecar(target, item, result)
}

function createCurrentBatchTranslationRun(options: BatchTranslationOptions) {
  const directoryHandle = directoryHandleCache.get(selectedDirectory.value)
  if (!directoryHandle) return undefined

  return createBatchTranslationRun({
    directoryHandle,
    folderLabel: batchFolderLabel.value,
    items: batchSourceItems.value,
    translationOptions: options,
  })
}

function handleStartBatchTranslation(options: BatchTranslationOptions): void {
  const run = createCurrentBatchTranslationRun(options)
  if (!run) {
    showError('현재 폴더에서 일괄 번역할 이미지나 압축파일을 찾지 못했습니다.')
    return
  }
  void startBatchTranslation(run)
}

function setViewMode(mode: MediaViewMode): void {
  viewMode.value = mode
}

function setSortKey(key: MediaSortKey): void {
  sortKey.value = key
}

function moveSelection(delta: number): void {
  if (!browserItems.value.length) return
  const currentIndex = browserItems.value.findIndex((item) => item.id === browserSelectedId.value)
  const nextIndex = Math.min(
    browserItems.value.length - 1,
    Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + delta),
  )
  selectBrowserItem(browserItems.value[nextIndex].id)
}

function handleBrowserKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return
  if (target instanceof Element && target.closest('.folder-tree')) return

  if (textViewerItem.value) {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      closeTextViewer()
    }
    return
  }

  if (viewerOpen.value) {
    if (event.key === 'Enter' && !(target instanceof HTMLButtonElement)) {
      event.preventDefault()
      closeViewer()
    }
    return
  }

  if (optionsOpen.value) {
    if (event.key === 'Escape') optionsOpen.value = false
    return
  }

  if (batchTranslationDialogOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!batchTranslationActive.value) batchTranslationDialogOpen.value = false
    }
    return
  }

  if (helpOpen.value) return

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault()
    void openDirectory()
    return
  }

  if (event.key === 'Enter' && canOpenViewer.value) {
    event.preventDefault()
    openViewer()
  }
  if (event.key === 'Backspace' && archiveBrowsing.value) {
    event.preventDefault()
    if (selectedArchiveDirectory.value) {
      const previousPath = selectedArchiveDirectory.value
      const outerItemId = archiveOuterItemId.value
      selectArchiveDirectory(
        getDirectoryPath(previousPath),
        outerItemId ? `archive-folder:${outerItemId}:${previousPath}` : undefined,
      )
    } else {
      leaveArchiveBrowser()
    }
  }
  if (
    viewMode.value === 'grid'
    && thumbnailGrid.value?.moveSelectionByKey(event.key)
  ) {
    event.preventDefault()
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveSelection(-1)
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    moveSelection(1)
  }
}

watch(viewMode, (value) => localStorage.setItem('websee-view-mode', value))
watch(sortKey, (value) => localStorage.setItem('websee-sort-key', value))
watch(sortAscending, (value) => localStorage.setItem('websee-sort-ascending', String(value)))

onMounted(() => window.addEventListener('keydown', handleBrowserKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleBrowserKeydown)
  disposeArchiveBrowser()
})
</script>

<template>
  <main
    class="websee-app"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <AppToolbar
      :batch-active="batchTranslationActive"
      :can-batch-translate="canBatchTranslate"
      :can-refresh="canRefreshCollection"
      :has-media="Boolean(collection?.items.length)"
      :sort-ascending="sortAscending"
      :sort-key="sortKey"
      :view-mode="viewMode"
      @open-directory="openDirectory"
      @open-images="imageInput?.click()"
      @open-archive="archiveInput?.click()"
      @refresh="refreshCollection"
      @show-batch-translation="batchTranslationDialogOpen = true"
      @set-view="setViewMode"
      @set-sort="setSortKey"
      @toggle-sort-direction="sortAscending = !sortAscending"
      @show-options="optionsOpen = true"
      @show-help="helpOpen = true"
    />

    <section
      v-if="collection"
      ref="mediaBrowser"
      class="media-browser"
      :class="{ 'is-resizing': resizing }"
      :style="paneStyle"
    >
      <div class="media-browser__sidebar">
        <FolderTree
          class="media-browser__tree"
          :tree="collection.tree"
          :selected-id="selectedTreeNodeId"
          :expand-id="requestedExpandedTreeNodeId"
          @select="selectTreeNode"
          @expand="expandTreeNode"
        />
        <button
          type="button"
          class="media-browser__separator media-browser__separator--horizontal"
          role="separator"
          aria-label="폴더 트리와 미리보기 높이 조절"
          aria-orientation="horizontal"
          :aria-valuemin="previewMinHeight"
          :aria-valuemax="Math.round(previewMaxHeight)"
          :aria-valuenow="Math.round(previewHeight)"
          title="드래그하여 미리보기 높이 조절 · 더블클릭하여 초기화"
          @pointerdown="startResize('preview', $event)"
          @pointermove="resize"
          @pointerup="endResize"
          @pointercancel="endResize"
          @keydown="resizeWithKeyboard('preview', $event)"
          @dblclick="resetPaneSize('preview')"
        />
        <TextPreviewPane
          v-if="selectedTextPreviewItem"
          :item="selectedTextPreviewItem"
        />
        <ImagePreviewPane
          v-else
          :item="selectedBrowserItem"
          :get-url="getUrl"
          :archive-entry-ready="selectedBrowserItem?.id === archivePreviewItemId"
          :loading="archivePreviewLoading"
          @dimensions="updateDimensions"
        />
      </div>

      <button
        type="button"
        class="media-browser__separator media-browser__separator--vertical"
        role="separator"
        aria-label="폴더 영역 폭 조절"
        aria-orientation="vertical"
        :aria-valuemin="sidebarMinWidth"
        :aria-valuemax="Math.round(sidebarMaxWidth)"
        :aria-valuenow="Math.round(sidebarWidth)"
        title="드래그하여 폴더 영역 폭 조절 · 더블클릭하여 초기화"
        @pointerdown="startResize('sidebar', $event)"
        @pointermove="resize"
        @pointerup="endResize"
        @pointercancel="endResize"
        @keydown="resizeWithKeyboard('sidebar', $event)"
        @dblclick="resetPaneSize('sidebar')"
      />

      <div
        v-if="browserItems.length"
        class="media-browser__content"
      >
        <ThumbnailGrid
          v-if="viewMode === 'grid'"
          ref="thumbnailGrid"
          :items="browserItems"
          :selected-id="browserSelectedId"
          :get-url="getUrl"
          :get-archive-thumbnail-url="getArchiveThumbnailUrl"
          @select="selectBrowserItem"
          @open="openViewer"
          @dimensions="updateDimensions"
        />
        <FileList
          v-else
          :items="browserItems"
          :selected-id="browserSelectedId"
          @select="selectBrowserItem"
          @open="openViewer"
          @request-dimensions="requestDimensions"
        />
      </div>

      <div v-else class="media-browser__empty-folder">
        <SvgIcon name="folder" :size="42" />
        <strong>이 폴더에는 지원하는 이미지, 텍스트나 압축파일이 없습니다.</strong>
        <p>왼쪽 폴더 트리에서 파일이 있는 폴더를 선택하세요.</p>
      </div>
    </section>

    <section v-else class="empty-workspace" aria-label="열린 이미지 없음" />

    <StatusBar
      :item="selectedBrowserItem"
      :image-count="statusImageCount"
      :task-status="archiveIndexingStatus"
      :total-count="statusTotalCount"
    />

    <input
      ref="folderInput"
      class="visually-hidden"
      type="file"
      webkitdirectory
      multiple
      aria-label="폴더 선택"
      @change="handleFolderSelection"
    />
    <input
      ref="imageInput"
      class="visually-hidden"
      type="file"
      accept="image/avif,image/bmp,image/gif,image/jpeg,image/png,image/svg+xml,image/webp,.ico"
      multiple
      aria-label="이미지 파일 선택"
      @change="handleImageSelection"
    />
    <input
      ref="archiveInput"
      class="visually-hidden"
      type="file"
      accept=".zip,.cbz,.rar,.cbr,application/zip,application/vnd.rar"
      aria-label="ZIP, CBZ, RAR 또는 CBR 파일 선택"
      @change="handleArchiveSelection"
    />

    <div v-if="dragActive" class="drop-overlay">
      <div><strong>여기에 놓아서 열기</strong><span>폴더, 이미지, 텍스트 또는 압축파일</span></div>
    </div>

    <div v-if="loading" class="loading-overlay" role="status">
      <div class="loading-overlay__dialog">
        <div class="loading-overlay__spinner" aria-hidden="true" />
        <strong>{{ loadingMessage }}</strong>
        <span>이미지 수에 따라 잠시 걸릴 수 있습니다.</span>
      </div>
    </div>

    <div v-if="errorMessage" class="error-toast" role="alert">
      <strong>열기 오류</strong>
      <span>{{ errorMessage }}</span>
      <button type="button" aria-label="오류 메시지 닫기" @click="errorMessage = ''">
        <SvgIcon name="close" :size="18" />
      </button>
    </div>

    <ImageViewer
      v-if="viewerOpen && viewerCurrentId"
      :items="viewerItems"
      :current-id="viewerCurrentId"
      :get-url="getUrl"
      :initial-slideshow="initialSlideshow"
      :load-saved-translation="loadSavedTranslation"
      :prepare-translation-persistence="prepareTranslationPersistence"
      :save-translation="saveTranslation"
      :translation-disabled="batchTranslationActive"
      @close="closeViewer"
      @select="selectViewerItem"
      @dimensions="updateDimensions"
    />

    <TextViewer
      v-if="textViewerItem"
      :item="textViewerItem"
      @close="closeTextViewer"
    />

    <HelpDialog v-if="helpOpen" @close="helpOpen = false" />
    <OptionsDialog
      v-if="optionsOpen"
      :translation-directory-handle="directoryHandleCache.get(selectedDirectory)"
      :translation-folder-label="batchFolderLabel"
      :translation-management-disabled="batchTranslationActive"
      @close="optionsOpen = false"
    />
    <BatchTranslationDialog
      v-if="batchTranslationDialogOpen"
      :archive-count="batchArchiveCount"
      :image-count="batchImageCount"
      :state="batchTranslationState"
      @close="batchTranslationDialogOpen = false"
      @continue="continueBatchTranslation"
      @pause="pauseBatchTranslation"
      @resume="resumeBatchTranslation"
      @start="handleStartBatchTranslation"
      @stop="stopBatchTranslation"
    />
  </main>
</template>

<style lang="scss">
.websee-app {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100dvh;
  min-height: 430px;
  overflow: hidden;
  color: var(--color-window-text);
  background: var(--color-face);
}

.media-browser {
  display: grid;
  grid-template-columns: var(--sidebar-width, 240px) 6px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-top: 1px solid var(--color-light);

  &__sidebar,
  &__tree,
  &__content {
    min-width: 0;
    min-height: 0;
  }

  &__sidebar {
    display: grid;
    grid-template-rows: minmax(110px, 1fr) 6px var(--preview-height, 210px);
  }

  &__tree {
    height: auto;
    border-right: 0;
    border-bottom: 0;
  }

  &__separator {
    position: relative;
    z-index: 1;
    min-width: 0;
    min-height: 0;
    padding: 0;
    touch-action: none;
    background: var(--color-face);
    border: 0;

    &::before {
      position: absolute;
      background: var(--color-shadow);
      box-shadow: 1px 1px var(--color-light);
      content: '';
    }

    &:hover,
    &:focus-visible {
      background: var(--color-highlight);
      outline: 1px dotted var(--color-selection-dark);
      outline-offset: -2px;
    }

    &--vertical {
      &::before {
        top: 0;
        bottom: 0;
        left: 2px;
        width: 1px;
      }
    }

    &--horizontal {
      &::before {
        top: 2px;
        right: 0;
        left: 0;
        height: 1px;
      }
    }
  }

  &__separator.media-browser__separator--vertical {
    cursor: col-resize;
  }

  &__separator.media-browser__separator--horizontal {
    cursor: row-resize;
  }

  &.is-resizing {
    user-select: none;
  }

  &__content {
    display: grid;
  }

  &__empty-folder {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    color: var(--color-muted);
    background: #fff;

    > span {
      font-size: 46px;
      color: #c6b877;
    }

    p {
      margin: 0;
    }
  }
}

.empty-workspace {
  min-width: 0;
  min-height: 0;
  background: #808080;
  background-image: linear-gradient(45deg, rgb(255 255 255 / 3%) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(255 255 255 / 3%) 25%, transparent 25%);
  background-size: 8px 8px;
}

.drop-overlay,
.loading-overlay {
  position: fixed;
  z-index: 150;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-overlay {
  background: rgb(10 36 106 / 34%);
  border: 6px dashed #fff;
  pointer-events: none;

  > div {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    padding: 24px 40px;
    color: #fff;
    background: var(--color-selection);
    border: 2px solid #fff;
    box-shadow: 0 6px 20px rgb(0 0 0 / 35%);
  }

  strong {
    font-size: 22px;
  }
}

.loading-overlay {
  background: rgb(0 0 0 / 28%);

  &__dialog {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 6px 12px;
    min-width: 330px;
    padding: 18px;
    background: var(--color-face);
    border: 1px solid;
    border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
      var(--color-light);
    box-shadow: 4px 5px 13px rgb(0 0 0 / 30%);

    > span {
      grid-column: 2;
      color: var(--color-muted);
    }
  }

  &__spinner {
    grid-row: 1 / 3;
    align-self: center;
    width: 24px;
    height: 24px;
    border: 3px solid #aebbd3;
    border-top-color: var(--color-selection);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

.error-toast {
  position: fixed;
  z-index: 180;
  right: 14px;
  bottom: 37px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 15px;
  width: min(420px, calc(100% - 28px));
  padding: 10px 12px;
  color: #fff;
  background: #8e2424;
  border: 1px solid #4e0b0b;
  box-shadow: 3px 4px 12px rgb(0 0 0 / 34%);

  span {
    grid-column: 1;
  }

  button {
    grid-row: 1 / 3;
    grid-column: 2;
    align-self: start;
    width: 24px;
    height: 24px;
    padding: 0;
    color: #fff;
    background: transparent;
    border: 1px solid rgb(255 255 255 / 45%);
  }
}

@keyframes spin {
  to {
    rotate: 360deg;
  }
}

@media (max-width: 700px) {
  .websee-app {
    min-width: 480px;
  }

  .media-browser {
    grid-template-columns: var(--sidebar-width, 180px) 6px minmax(0, 1fr);
  }

}
</style>
