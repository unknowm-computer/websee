<script setup lang="ts">
interface Props {
  label: string
  fileName?: string
  filePath?: string
}

defineProps<Props>()
</script>

<template>
  <section class="preview-pane" :aria-label="label">
    <header class="pane-heading notranslate" translate="no">
      미리보기
      <slot name="actions" />
    </header>

    <slot />

    <footer v-if="fileName" class="preview-pane__footer notranslate" translate="no">
      <strong :title="filePath">{{ fileName }}</strong>
      <span><slot name="metadata" /></span>
    </footer>
  </section>
</template>

<style lang="scss">
.preview-pane {
  display: grid;
  grid-template-rows: 27px minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--color-face);

  > .pane-heading {
    justify-content: space-between;

    > .action-button {
      display: grid;
      place-items: center;
      min-height: 0;
      padding: 1px 3px;
    }
  }

  &__state {
    display: flex;
    flex-direction: column;
    gap: 7px;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    padding: 10px;
    text-align: center;
  }

  &__footer {
    display: grid;
    gap: 2px;
    padding: 5px 7px;
    border-top: 1px solid var(--color-shadow-dark);

    strong,
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      font-size: 11px;
      color: var(--color-muted);
    }
  }
}
</style>
