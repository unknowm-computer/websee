<script setup lang="ts">
import { computed, ref, watch } from 'vue'

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
  (event: 'expand', node: MediaDirectoryNode): void
}>()

const expanded = ref(props.depth === 0)
const canExpand = computed(() =>
  props.node.children.length > 0 || props.node.loaded === false || props.node.loading,
)

function containsNode(node: MediaDirectoryNode, id: string): boolean {
  if (node.id === id) return true
  return node.children.some((child) => containsNode(child, id))
}

watch(
  () => [props.expandId, props.node.children.length] as const,
  ([expandId]) => {
    if (expandId && canExpand.value && containsNode(props.node, expandId)) {
      expanded.value = true
    }
  },
  { immediate: true },
)

function handleHorizontalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'ArrowLeft') {
    expanded.value = false
    return
  }
  if (!canExpand.value) return
  expanded.value = true
  emit('expand', props.node)
}

function toggleExpanded(): void {
  expanded.value = !expanded.value
  if (expanded.value) emit('expand', props.node)
}
</script>

<template>
  <li class="folder-tree-item">
    <div class="folder-tree-item__row" :style="{ paddingLeft: `${depth * 15 + 4}px` }">
      <button
        v-if="canExpand"
        type="button"
        class="folder-tree-item__toggle"
        :aria-label="expanded ? `${node.name} 접기` : `${node.name} 펼치기`"
        :aria-expanded="expanded"
        @click="toggleExpanded"
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
        :title="node.kind === 'archive' ? `${node.name} 압축파일` : node.name"
        @click="emit('select', node)"
        @keydown="handleHorizontalKeydown"
      >
        <SvgIcon
          :name="node.kind === 'archive' ? 'folder-zip' : expanded ? 'folder-open' : 'folder'"
          :size="17"
        />
        <span>{{ node.name }}</span>
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
        @expand="emit('expand', $event)"
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
    width: 100%;
    min-width: max-content;
    height: 25px;
    box-sizing: border-box;
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
    flex: 1 0 auto;
    grid-template-columns: 18px minmax(24px, 1fr);
    gap: 3px;
    align-items: center;
    min-width: max-content;
    height: 22px;
    padding: 1px 5px 1px 2px;
    font: inherit;
    color: var(--color-window-text);
    text-align: left;
    white-space: nowrap;
    background: transparent;
    border: 1px solid transparent;

    span:nth-child(2) {
      white-space: nowrap;
    }

    &:hover {
      background: var(--color-highlight);
      border-color: var(--color-shadow);
    }

    &.is-selected {
      color: #fff;
      background: var(--color-selection);
      border-color: var(--color-selection-dark);

    }
  }
}
</style>
