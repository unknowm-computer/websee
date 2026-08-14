<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon.vue'
import type { MediaSortKey, MediaViewMode } from '@/types/media'

interface Props {
  canRefresh: boolean
  hasMedia: boolean
  sortAscending: boolean
  sortKey: MediaSortKey
  viewMode: MediaViewMode
}

defineProps<Props>()

const emit = defineEmits<{
  (event: 'open-directory'): void
  (event: 'open-images'): void
  (event: 'open-archive'): void
  (event: 'refresh'): void
  (event: 'set-view', mode: MediaViewMode): void
  (event: 'set-sort', key: MediaSortKey): void
  (event: 'toggle-sort-direction'): void
  (event: 'show-help'): void
}>()
</script>

<template>
  <div class="app-toolbar" role="toolbar" aria-label="파일 탐색 도구">
    <button type="button" title="폴더 열기" @click="emit('open-directory')">
      <SvgIcon class="app-toolbar__icon" name="folder-open" />
      <span>폴더</span>
    </button>
    <button type="button" title="이미지 파일 열기" @click="emit('open-images')">
      <SvgIcon class="app-toolbar__icon" name="image" />
      <span>이미지</span>
    </button>
    <button type="button" title="ZIP, CBZ, RAR 또는 CBR 열기" @click="emit('open-archive')">
      <SvgIcon class="app-toolbar__icon" name="folder-zip" />
      <span>압축파일</span>
    </button>
    <button
      type="button"
      title="현재 폴더의 파일 목록 새로고침"
      :disabled="!canRefresh"
      @click="emit('refresh')"
    >
      <SvgIcon class="app-toolbar__icon" name="refresh" />
      <span>새로고침</span>
    </button>

    <span class="app-toolbar__separator" aria-hidden="true" />

    <button
      type="button"
      :class="{ 'is-pressed': viewMode === 'grid' }"
      :aria-pressed="viewMode === 'grid'"
      title="썸네일 보기"
      @click="emit('set-view', 'grid')"
    >
      <SvgIcon class="app-toolbar__icon" name="grid" />
      <span>썸네일</span>
    </button>
    <button
      type="button"
      :class="{ 'is-pressed': viewMode === 'list' }"
      :aria-pressed="viewMode === 'list'"
      title="목록 보기"
      @click="emit('set-view', 'list')"
    >
      <SvgIcon class="app-toolbar__icon" name="list" />
      <span>목록</span>
    </button>

    <span class="app-toolbar__separator" aria-hidden="true" />

    <label class="app-toolbar__sort">
      <span>정렬</span>
      <select
        :value="sortKey"
        :disabled="!hasMedia"
        aria-label="정렬 기준"
        @change="emit('set-sort', ($event.target as HTMLSelectElement).value as MediaSortKey)"
      >
        <option value="name">이름</option>
        <option value="size">크기</option>
        <option value="format">형식</option>
        <option value="modified">수정일</option>
      </select>
    </label>
    <button
      type="button"
      class="app-toolbar__direction"
      :disabled="!hasMedia"
      :title="sortAscending ? '오름차순' : '내림차순'"
      @click="emit('toggle-sort-direction')"
    >
      <SvgIcon :name="sortAscending ? 'arrow-up' : 'arrow-down'" :size="18" />
    </button>

    <span class="app-toolbar__separator" aria-hidden="true" />

    <button type="button" title="단축키와 사용 방법" @click="emit('show-help')">
      <span class="app-toolbar__icon" aria-hidden="true">?</span>
      <span>도움말</span>
    </button>
  </div>
</template>

<style lang="scss">
.app-toolbar {
  display: flex;
  gap: 2px;
  align-items: stretch;
  min-height: 51px;
  padding: 4px 5px;
  background: var(--color-face);
  border-bottom: 1px solid var(--color-shadow-dark);
  box-shadow: inset 0 1px var(--color-light);

  > button {
    display: flex;
    flex-direction: column;
    gap: 1px;
    align-items: center;
    justify-content: center;
    min-width: 58px;
    padding: 2px 7px;
    font: inherit;
    color: var(--color-window-text);
    background: transparent;
    border: 1px solid transparent;

    &:hover:not(:disabled) {
      background: var(--color-highlight);
      border-color: var(--color-shadow);
    }

    &:active:not(:disabled),
    &.is-pressed {
      padding-top: 3px;
      padding-bottom: 1px;
      background: var(--color-pressed);
      border-color: var(--color-shadow-dark) var(--color-light) var(--color-light)
        var(--color-shadow-dark);
    }

    &:disabled {
      color: var(--color-disabled);
    }
  }

  &__icon {
    color: inherit;
  }

  &__separator {
    width: 1px;
    margin: 2px 4px;
    background: var(--color-shadow);
    box-shadow: 1px 0 var(--color-light);
  }

  &__sort {
    display: flex;
    gap: 5px;
    align-items: center;
    margin-left: 2px;

    select {
      width: 92px;
      height: 25px;
      font: inherit;
      background: #fff;
      border: 1px solid var(--color-shadow-dark);
    }
  }

  &__direction {
    align-self: center;
    min-width: 28px !important;
    height: 25px;
    padding: 0 !important;
    font-size: 17px !important;
  }

}

@media (max-width: 760px) {
  .app-toolbar {
    flex-wrap: wrap;
  }
}
</style>
