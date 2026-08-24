<script setup lang="ts">
import type { CSSProperties } from 'vue'

import { mapBoundsToDisplay } from '@/services/imageTranslation/detectorGeometry'
import type { ImageTranslationRegion } from '@/types/imageTranslation'

interface Props {
  displayHeight: number
  displayWidth: number
  imageHeight: number
  imageWidth: number
  regions: readonly ImageTranslationRegion[]
}

const props = defineProps<Props>()

function getRegionStyle(region: ImageTranslationRegion): CSSProperties {
  const { bounds, translatedText } = region
  const displayBounds = mapBoundsToDisplay(
    bounds,
    { width: props.imageWidth, height: props.imageHeight },
    { width: props.displayWidth, height: props.displayHeight },
  )
  const { x: left, y: top, width, height } = displayBounds
  const areaPerCharacter = width * height / Math.max(1, translatedText.length)
  const fontSize = Math.max(
    10,
    Math.min(height * 0.34, width * 0.2, Math.sqrt(areaPerCharacter) * 0.78),
  )
  const padding = Math.max(3, Math.min(width, height) * 0.06)

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    padding: `${padding}px`,
    fontSize: `${fontSize}px`,
  }
}
</script>

<template>
  <div class="image-translation-overlay" aria-label="이미지 번역 결과">
    <div
      v-for="region in regions"
      :key="region.id"
      class="image-translation-overlay__region"
      :class="`is-${region.kind}`"
      :style="getRegionStyle(region)"
      :title="region.sourceText"
      lang="ko"
    >
      <span>{{ region.translatedText }}</span>
    </div>
  </div>
</template>

<style lang="scss">
.image-translation-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;

  &__region {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-weight: 600;
    line-height: 1.28;
    color: #111;
    text-align: center;
    text-wrap: balance;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    background: rgb(255 255 255 / 94%);
    border: 1px solid rgb(0 0 0 / 28%);
    box-shadow: 0 1px 3px rgb(0 0 0 / 24%);

    &.is-bubble {
      border-radius: 45%;
    }

    &.is-free-text {
      background: rgb(255 255 255 / 88%);
      border-radius: 3px;
    }

    span {
      display: block;
      max-width: 100%;
      max-height: 100%;
      overflow: hidden;
    }
  }
}
</style>
