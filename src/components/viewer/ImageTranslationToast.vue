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
    <button type="button" aria-label="번역 안내 닫기" @click="emit('close')">
      <SvgIcon name="close" :size="17" />
    </button>
  </aside>
</template>

<style lang="scss">
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
  color: var(--color-window-text);
  background: var(--color-face);
  border: 1px solid;
  border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
    var(--color-light);
  box-shadow: 2px 2px 8px rgb(0 0 0 / 42%);

  button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: inherit;
    background: var(--color-face);
    border: 1px solid;
    border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
      var(--color-light);
  }
}
</style>
