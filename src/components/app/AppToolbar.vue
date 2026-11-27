<script setup lang="ts">
import AppToolbarButton from "@/components/app/AppToolbarButton.vue";
import type { MediaViewMode } from "@/types/media";

interface Props {
  batchActive: boolean;
  canBatchTranslate: boolean;
  canShowFileInfo: boolean;
  canRefresh: boolean;
  showLabels: boolean;
  translationEnabled: boolean;
  viewMode: MediaViewMode;
}

defineProps<Props>();

const emit = defineEmits<{
  (event: "open-directory"): void;
  (event: "open-files"): void;
  (event: "open-archive"): void;
  (event: "refresh"): void;
  (event: "show-batch-translation"): void;
  (event: "set-view", mode: MediaViewMode): void;
  (event: "show-file-info"): void;
  (event: "show-options"): void;
  (event: "show-help"): void;
}>();
</script>

<template>
  <div
    class="app-toolbar"
    :class="{ 'app-toolbar--icons-only': !showLabels }"
    role="toolbar"
    aria-label="파일 탐색 도구"
  >
    <AppToolbarButton icon="folder-open" label="폴더" title="폴더 열기" @click="emit('open-directory')" />
    <AppToolbarButton
      icon="file"
      label="파일"
      title="이미지, 텍스트, 음악, 동영상 파일 열기"
      @click="emit('open-files')"
    />
    <AppToolbarButton
      icon="folder-zip"
      label="압축파일"
      title="ZIP, CBZ, RAR, CBR 또는 7z 열기"
      @click="emit('open-archive')"
    />
    <AppToolbarButton
      icon="refresh"
      label="새로고침"
      title="현재 폴더의 파일 목록 새로고침 (F5)"
      :disabled="!canRefresh"
      @click="emit('refresh')"
    />

    <span class="app-toolbar__separator" aria-hidden="true" />

    <AppToolbarButton
      icon="grid"
      label="썸네일"
      :class="{ 'is-pressed': viewMode === 'grid' }"
      :aria-pressed="viewMode === 'grid'"
      title="썸네일 보기"
      @click="emit('set-view', 'grid')"
    />
    <AppToolbarButton
      icon="list"
      label="목록"
      :class="{ 'is-pressed': viewMode === 'list' }"
      :aria-pressed="viewMode === 'list'"
      title="목록 보기"
      @click="emit('set-view', 'list')"
    />

    <span class="app-toolbar__separator" aria-hidden="true" />

    <AppToolbarButton
      icon="info"
      label="파일 정보"
      title="파일 정보 (I)"
      aria-keyshortcuts="I"
      aria-haspopup="dialog"
      :disabled="!canShowFileInfo"
      @click="emit('show-file-info')"
    />

    <template v-if="translationEnabled">
      <span class="app-toolbar__separator" aria-hidden="true" />

      <AppToolbarButton
        icon="auto"
        label="일괄 번역"
        :class="{ 'is-pressed': batchActive }"
        :aria-pressed="batchActive"
        title="현재 폴더의 이미지와 압축파일을 일괄 번역"
        :disabled="!canBatchTranslate"
        @click="emit('show-batch-translation')"
      />
    </template>

    <span class="app-toolbar__separator" aria-hidden="true" />

    <AppToolbarButton icon="options" label="옵션" title="WebSee 옵션" @click="emit('show-options')" />

    <span class="app-toolbar__separator" aria-hidden="true" />

    <AppToolbarButton icon="help" label="도움말" title="단축키와 사용 방법" @click="emit('show-help')" />
  </div>
</template>

<style lang="scss">
.app-toolbar {
  display: flex;
  flex-wrap: wrap;
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
      border-color: var(--border-pressed);
    }

    &:disabled {
      color: var(--color-disabled);
    }
  }

  &__separator {
    width: 1px;
    margin: 2px 4px;
    background: var(--color-shadow);
    box-shadow: 1px 0 var(--color-light);
  }

  &--icons-only {
    min-height: 40px;

    > button {
      min-width: 36px;
      padding-inline: 5px;
    }
  }

  &--icons-only &__label {
    display: none;
  }
}

</style>
