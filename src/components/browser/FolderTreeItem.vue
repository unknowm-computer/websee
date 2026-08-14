<script setup lang="ts">
import { ref, watch } from 'vue'

import SvgIcon from '@/components/common/SvgIcon.vue'
import type { MediaDirectoryNode } from '@/types/media'

interface Props {
  node: MediaDirectoryNode
  selectedId: string
  expandId?: string
  depth?: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
})

const emit = defineEmits<{
  (event: 'select', node: MediaDirectoryNode): void
}>()

const expanded = ref(props.depth === 0)

function containsNode(node: MediaDirectoryNode, id: string): boolean {
  if (node.id === id) return true
  return node.children.some((child) => containsNode(child, id))
}

watch(
  () => props.expandId,
  (expandId) => {
    if (expandId && props.node.children.length && containsNode(props.node, expandId)) {
      expanded.value = true
    }
  },
  { immediate: true },
)

function handleHorizontalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

  event.preventDefault()
  event.stopPropagation()
  if (!props.node.children.length) return

  expanded.value = event.key === 'ArrowRight'
}
</script>

<template>
  <li class="folder-tree-item">
    <div class="folder-tree-item__row" :style="{ paddingLeft: `${depth * 15 + 4}px` }">
      <button
        v-if="node.children.length"
        type="button"
        class="folder-tree-item__toggle"
        :aria-label="expanded ? `${node.name} 접기` : `${node.name} 펼치기`"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <SvgIcon :name="expanded ? 'remove' : 'add'" :size="12" />
      </button>
      <span v-else class="folder-tree-item__spacer" />
      <button
        type="button"
        class="folder-tree-item__name"
        :data-node-id="node.id"
        :class="{
          'is-archive': node.kind === 'archive',
          'is-selected': selectedId === node.id,
        }"
        :title="node.kind === 'archive' ? `${node.name} 압축파일` : `${node.name} (${node.directCount})`"
        @click="emit('select', node)"
        @keydown="handleHorizontalKeydown"
      >
        <SvgIcon
          :name="node.kind === 'archive' ? 'folder-zip' : expanded ? 'folder-open' : 'folder'"
          :size="17"
        />
        <span>{{ node.name }}</span>
        <small v-if="node.kind !== 'archive'">{{ node.directCount }}</small>
      </button>
    </div>

    <ul v-if="expanded && node.children.length">
      <FolderTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :expand-id="expandId"
        :depth="depth + 1"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>

<style lang="scss">
.folder-tree-item {
  list-style: none;

  ul {
    padding: 0;
    margin: 0;
  }

  &__row {
    display: flex;
    align-items: center;
    min-width: max-content;
    height: 25px;
  }

  &__toggle,
  &__spacer {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    padding: 0;
    font: 12px/12px sans-serif;
  }

  &__toggle {
    display: grid;
    place-items: center;
    color: var(--color-window-text);
    background: #fff;
    border: 1px solid var(--color-shadow);
  }

  &__name {
    display: grid;
    grid-template-columns: 18px minmax(24px, 1fr) auto;
    gap: 3px;
    align-items: center;
    max-width: 205px;
    height: 22px;
    padding: 1px 5px 1px 2px;
    overflow: hidden;
    font: inherit;
    color: var(--color-window-text);
    text-align: left;
    white-space: nowrap;
    background: transparent;
    border: 1px solid transparent;

    span:nth-child(2) {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    small {
      color: var(--color-muted);
    }

    &:hover {
      background: var(--color-highlight);
      border-color: var(--color-shadow);
    }

    &.is-selected {
      color: #fff;
      background: var(--color-selection);
      border-color: var(--color-selection-dark);

      small {
        color: #fff;
      }
    }
  }
}
</style>
