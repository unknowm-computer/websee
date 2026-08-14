<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import type { MediaDirectoryNode } from '@/types/media'

import FolderTreeItem from './FolderTreeItem.vue'

interface Props {
  tree: MediaDirectoryNode
  selectedId: string
  expandId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (event: 'select', node: MediaDirectoryNode): void
}>()

const scrollContainer = ref<HTMLElement>()

function findNode(node: MediaDirectoryNode, id: string): MediaDirectoryNode | undefined {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return undefined
}

function getVisibleNodeButtons(): HTMLButtonElement[] {
  if (!scrollContainer.value) return []
  return Array.from(
    scrollContainer.value.querySelectorAll<HTMLButtonElement>('.folder-tree-item__name'),
  )
}

function keepButtonVisible(button: HTMLButtonElement): void {
  const container = scrollContainer.value
  if (!container) return

  const containerRect = container.getBoundingClientRect()
  const buttonRect = button.getBoundingClientRect()
  if (buttonRect.top < containerRect.top) {
    container.scrollTop -= containerRect.top - buttonRect.top
  } else if (buttonRect.bottom > containerRect.bottom) {
    container.scrollTop += buttonRect.bottom - containerRect.bottom
  }
}

function focusSelectedNode(): void {
  const button = getVisibleNodeButtons().find(
    (candidate) => candidate.dataset.nodeId === props.selectedId,
  )
  if (!button) return
  button.focus({ preventScroll: true })
  keepButtonVisible(button)
}

function scrollSelectedNodeIntoView(): void {
  const button = getVisibleNodeButtons().find(
    (candidate) => candidate.dataset.nodeId === props.selectedId,
  )
  if (button) keepButtonVisible(button)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

  const buttons = getVisibleNodeButtons()
  if (!buttons.length) return

  event.preventDefault()
  event.stopPropagation()

  const focusedButton = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>('.folder-tree-item__name')
    : null
  const focusedIndex = focusedButton ? buttons.indexOf(focusedButton) : -1
  const selectedIndex = buttons.findIndex((button) => button.dataset.nodeId === props.selectedId)
  const currentIndex = Math.max(0, focusedIndex >= 0 ? focusedIndex : selectedIndex)
  const delta = event.key === 'ArrowUp' ? -1 : 1
  const nextIndex = Math.min(buttons.length - 1, Math.max(0, currentIndex + delta))
  const nextButton = buttons[nextIndex]
  const nodeId = nextButton.dataset.nodeId
  if (!nodeId) return

  const node = findNode(props.tree, nodeId)
  if (!node) return

  nextButton.focus({ preventScroll: true })
  keepButtonVisible(nextButton)
  emit('select', node)
}

watch(
  () => props.selectedId,
  async () => {
    await nextTick()
    if (scrollContainer.value?.contains(document.activeElement)) {
      focusSelectedNode()
    } else {
      scrollSelectedNodeIntoView()
    }
  },
)
</script>

<template>
  <aside class="folder-tree" aria-label="폴더 및 압축파일 탐색">
    <div class="folder-tree__title">탐색</div>
    <div
      ref="scrollContainer"
      class="folder-tree__scroll"
      tabindex="0"
      @keydown="handleKeydown"
    >
      <ul>
        <FolderTreeItem
          :node="tree"
          :selected-id="selectedId"
          :expand-id="expandId"
          @select="emit('select', $event)"
        />
      </ul>
    </div>
  </aside>
</template>

<style lang="scss">
.folder-tree {
  display: grid;
  grid-template-rows: 27px minmax(0, 1fr);
  min-width: 0;
  height: 100%;
  background: #fff;
  border-right: 1px solid var(--color-shadow-dark);

  &__title {
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-weight: 700;
    background: var(--color-face);
    border-bottom: 1px solid var(--color-shadow-dark);
    box-shadow: inset 0 1px var(--color-light);
  }

  &__scroll {
    min-height: 0;
    padding: 3px 0;
    overflow: auto;
  }

  ul {
    padding: 0;
    margin: 0;
  }
}
</style>
