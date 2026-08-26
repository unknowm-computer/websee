<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

import addUrl from "@/images/icons/add.svg";
import arrowDownUrl from "@/images/icons/arrow_down.svg";
import arrowLeftUrl from "@/images/icons/arrow_left.svg";
import arrowRightUrl from "@/images/icons/arrow_right.svg";
import arrowUpUrl from "@/images/icons/arrow_up.svg";
import autoUrl from "@/images/icons/auto.svg";
import blurOffUrl from "@/images/icons/blur_off.svg";
import blurOnUrl from "@/images/icons/blur_on.svg";
import closeUrl from "@/images/icons/close.svg";
import deleteUrl from "@/images/icons/delete.svg";
import docsUrl from "@/images/icons/docs.svg";
import downloadForOfflineUrl from "@/images/icons/download_for_offline.svg";
import fileUrl from "@/images/icons/file.svg";
import fitScreenUrl from "@/images/icons/fit_screen.svg";
import fitWidthUrl from "@/images/icons/fit_width.svg";
import folderUrl from "@/images/icons/folder.svg";
import folderOpenUrl from "@/images/icons/folder_open.svg";
import folderZipUrl from "@/images/icons/folder_zip.svg";
import translateUrl from "@/images/icons/g_translate.svg";
import gridUrl from "@/images/icons/grid.svg";
import helpUrl from "@/images/icons/help.svg";
import imageUrl from "@/images/icons/image.svg";
import listUrl from "@/images/icons/list.svg";
import optionsUrl from "@/images/icons/options.svg";
import playUrl from "@/images/icons/play.svg";
import realSizeUrl from "@/images/icons/real_size.svg";
import refreshUrl from "@/images/icons/refresh.svg";
import removeUrl from "@/images/icons/remove.svg";
import rotateUrl from "@/images/icons/rotate.svg";
import zoomInUrl from "@/images/icons/zoom_in.svg";
import zoomOutUrl from "@/images/icons/zoom_out.svg";

const iconUrls = {
  plus: addUrl,
  "arrow-down": arrowDownUrl,
  "arrow-left": arrowLeftUrl,
  "arrow-right": arrowRightUrl,
  "arrow-up": arrowUpUrl,
  auto: autoUrl,
  "blur-off": blurOffUrl,
  "blur-on": blurOnUrl,
  close: closeUrl,
  docs: docsUrl,
  "download-for-offline": downloadForOfflineUrl,
  file: fileUrl,
  "fit-screen": fitScreenUrl,
  "fit-width": fitWidthUrl,
  folder: folderUrl,
  "folder-open": folderOpenUrl,
  "folder-zip": folderZipUrl,
  grid: gridUrl,
  help: helpUrl,
  translate: translateUrl,
  image: imageUrl,
  list: listUrl,
  options: optionsUrl,
  play: playUrl,
  refresh: refreshUrl,
  minus: removeUrl,
  remove: deleteUrl,
  rotate: rotateUrl,
  "zoom-in": zoomInUrl,
  "zoom-out": zoomOutUrl,
  "real-size": realSizeUrl,
} as const;

interface Props {
  name: keyof typeof iconUrls;
  size?: number;
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
});

type IconStyle = CSSProperties & {
  "--svg-icon-mask": string;
};

const iconStyle = computed<IconStyle>(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  "--svg-icon-mask": `url("${iconUrls[props.name]}")`,
}));
</script>

<template>
  <span class="svg-icon" :style="iconStyle" aria-hidden="true" />
</template>

<style lang="scss">
.svg-icon {
  display: inline-block;
  flex: 0 0 auto;
  background-color: currentColor;
  mask: var(--svg-icon-mask) center / contain no-repeat;
}
</style>
