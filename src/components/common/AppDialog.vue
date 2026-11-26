<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from "vue";

import SvgIcon from "@/components/common/SvgIcon.vue";

interface Props {
  title: string;
  panelClass?: string;
  closeLabel?: string;
  busy?: boolean;
  dismissible?: boolean;
  closeOnBackdropClick?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  closeLabel: "닫기",
  busy: false,
  dismissible: true,
  closeOnBackdropClick: true,
});

const emit = defineEmits<{
  (event: "close"): void;
}>();

const dialog = ref<HTMLDialogElement>();
const titleId = useId();

function requestClose(): void {
  if (!props.busy) emit("close");
}

function requestDismiss(): void {
  if (props.dismissible) requestClose();
}

onMounted(() => dialog.value?.showModal());
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <dialog
    ref="dialog"
    class="dialog-backdrop"
    :aria-labelledby="titleId"
    :aria-busy="busy"
    @cancel.prevent="requestDismiss"
    @click.self="closeOnBackdropClick && requestDismiss()"
  >
    <section class="app-dialog" :class="panelClass">
      <header class="app-dialog__header">
        <strong :id="titleId" class="app-dialog__title">
          <slot name="title-icon" />
          {{ title }}
        </strong>
        <slot name="title-actions" />
        <button
          class="action-button"
          type="button"
          :aria-label="closeLabel"
          :disabled="busy"
          @click="requestClose"
        >
          <SvgIcon name="close" :size="17" />
        </button>
      </header>

      <slot />

      <footer class="app-dialog__footer">
        <slot name="actions" :close="requestClose">
          <button class="action-button" type="button" autofocus :disabled="busy" @click="requestClose">
            확인
          </button>
        </slot>
      </footer>
    </section>
  </dialog>
</template>

<style lang="scss">
.dialog-backdrop {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  padding: 18px;
  margin: 0;
  background: transparent;
  border: 0;

  &[open] {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &::backdrop {
    background: rgb(0 0 0 / 34%);
  }
}

.app-dialog {
  color: var(--color-window-text);
  background: var(--color-face);
  border: 1px solid var(--color-shadow-dark);
  box-shadow:
    inset 1px 1px var(--color-light),
    4px 5px 15px rgb(0 0 0 / 35%);

  &__header {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 30px;
    padding: 3px 4px 3px 8px;
    color: var(--color-light);
    background: var(--color-selection);

    > button {
      display: grid;
      flex: none;
      place-items: center;
      width: 23px;
      height: 22px;
      min-height: 0;
      padding: 0;
    }
  }

  &__title {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    min-width: 0;
    margin-inline-end: auto;
  }

  &__footer {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    padding: 8px 12px;

    > button {
      min-width: 76px;
    }
  }
}
</style>
