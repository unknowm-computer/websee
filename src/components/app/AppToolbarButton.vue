<script setup lang="ts">
import SvgIcon from "@/components/common/SvgIcon.vue";

interface Props {
  icon: InstanceType<typeof SvgIcon>["$props"]["name"];
  label: string;
}

defineProps<Props>();
</script>

<template>
  <button type="button" :aria-label="label">
    <SvgIcon :name="icon" />
    <span class="app-toolbar__label">{{ label }}</span>
  </button>
</template>
