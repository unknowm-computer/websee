<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon.vue'

interface Props {
  message: string
}

defineProps<Props>()

const emit = defineEmits<{
  (event: 'close'): void
}>()
</script>

<template>
  <aside
    class="image-translation-toast"
    role="status"
    aria-live="polite"
    @pointerdown.stop
    @dblclick.stop
    @wheel.stop
  >
    <SvgIcon name="translate" :size="20" />
    <span>{{ message }}</span>
    <button class="action-button" type="button" aria-label="번역 안내 닫기" @click="emit('close')">
      <SvgIcon name="close" :size="17" />
    </button>
  </aside>
</template>

<style lang="scss">
@use '../../styles/surfaces';

.image-translation-toast {
  position: absolute;
  z-index: 3;
  right: 12px;
  bottom: 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: min(430px, calc(100% - 24px));
  padding: 9px 10px;
  @include surfaces.raised-panel;

  button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    min-height: 0;
    padding: 0;
  }
}
</style>
