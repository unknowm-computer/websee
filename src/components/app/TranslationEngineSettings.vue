<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { useAppleTranslationConnection } from "@/composables/useAppleTranslationConnection";
import type { AppleTranslationModel, OcrEngineId, TranslationEngineId } from "@/types/translationEngine";

interface Props {
  engine: TranslationEngineId;
  appleModel: AppleTranslationModel;
  ocrEngine: OcrEngineId;
}

const props = defineProps<Props>();
const { extensionId, state, message, checkConnection } = useAppleTranslationConnection(
  () => props.engine,
  () => props.appleModel,
  () => props.ocrEngine,
);
const installCommand = extensionId ? `sh native/macos/install.sh ${extensionId}` : undefined;
const copyMessage = ref("");
const commandElement = ref<HTMLElement>();
const helpOpen = ref(false);
const statusLabel = computed(() => {
  if (state.value === "checking") return "도우미 연결 확인 중…";
  if (state.value === "connected") return "도우미 연결됨";
  if (state.value === "error") return "도우미 연결 안 됨";
  return "도우미 연결 대기";
});

watch(state, (value) => {
  if (value === "connected") copyMessage.value = "";
});

async function copyInstallCommand(): Promise<void> {
  if (!installCommand) return;
  try {
    await navigator.clipboard.writeText(installCommand);
    copyMessage.value = "복사했습니다. WebSee 소스 폴더에서 터미널에 붙여넣어 실행하세요. 돌아오면 연결을 다시 확인합니다.";
  } catch {
    helpOpen.value = true;
    await nextTick();
    const range = document.createRange();
    if (commandElement.value) {
      range.selectNodeContents(commandElement.value);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    copyMessage.value = "자동 복사가 허용되지 않았습니다. 설치 안내의 명령을 Cmd+C로 복사해주세요.";
  }
}

watch(
  [() => props.engine, () => props.ocrEngine],
  () => {
    copyMessage.value = "";
    helpOpen.value = false;
  },
);
</script>

<template>
  <div class="translation-engine-settings">
    <p class="translation-engine-settings__note">
      개별·일괄 번역에 적용됩니다. 저장된 결과는 유지되며 다른 OCR이나 번역기를
      적용하려면 다시 번역하세요.
    </p>
    <template v-if="engine === 'apple' || ocrEngine === 'apple-vision'">
      <p class="translation-engine-settings__description">
        macOS 26 이상과 macOS 번역·OCR 도우미가 필요합니다.
      </p>
      <p v-if="engine === 'apple'" class="translation-engine-settings__description">
        {{ appleModel === 'high-fidelity'
          ? 'Apple Intelligence는 macOS 26.4 이상에서 사용할 수 있습니다. Apple Intelligence가 꺼져 있으면 기존 모델로 대체될 수 있습니다.'
          : 'macOS Apple 번역은 다운로드한 언어팩을 사용하는 기존 번역 모델로, 빠르고 자원을 적게 사용합니다.' }}
        두 모델 모두 기기에서 번역을 처리합니다.
      </p>
      <p v-if="ocrEngine === 'apple-vision'" class="translation-engine-settings__description">
        macOS Vision이 기기에서 글자를 인식합니다. 말풍선·영역 감지는 기존 모델을 사용하며, 번역기는 별도로 선택할 수 있습니다.
      </p>
      <div class="translation-engine-settings__connection">
        <strong
          class="translation-engine-settings__connection-state"
          :class="`translation-engine-settings__connection-state--${state}`"
          role="status"
        >{{ statusLabel }}</strong>
        <div class="translation-engine-settings__actions">
          <button
            v-if="state === 'error' && installCommand"
            type="button"
            @click="copyInstallCommand"
          >설치 명령 복사</button>
          <button type="button" :disabled="state === 'checking'" @click="checkConnection">
            다시 확인
          </button>
        </div>
      </div>
      <p v-if="message" class="translation-engine-settings__description">{{ message }}</p>
      <p v-if="copyMessage" class="translation-engine-settings__description" role="status">{{ copyMessage }}</p>
      <details class="translation-engine-settings__help" :open="helpOpen">
        <summary>macOS 도우미 설치 안내</summary>
        <p>
          WebSee 소스 폴더에서 다음 명령을 터미널에 실행하세요. Swift
          컴파일러(Command Line Tools)가 필요합니다.
        </p>
        <code ref="commandElement">{{ installCommand ?? "sh native/macos/install.sh <WebSee 확장 프로그램 ID>" }}</code>
        <button v-if="installCommand && state !== 'error'" type="button" @click="copyInstallCommand">설치 명령 복사</button>
        <p v-if="!extensionId">
          확장 프로그램 ID는 chrome://extensions에서 개발자 모드를 켜 확인할 수
          있습니다. 개발 서버에서는 도우미에 연결할 수 없습니다.
        </p>
        <p v-if="engine === 'apple'">
          시스템 설정 → 일반 → 언어 및 지역 → 번역 언어에서 원문 언어와 한국어를
          다운로드하세요. 도우미는 사용 시에만 실행됩니다.
        </p>
        <p v-else>OCR에는 번역 언어팩이 필요하지 않으며 도우미는 사용 시에만 실행됩니다.</p>
      </details>
    </template>
  </div>
</template>

<style lang="scss">
.translation-engine-settings {
  display: grid;
  gap: 10px;
  margin-top: 12px;

  &__note {
    color: var(--color-muted);
  }

  &__help {
    summary {
      cursor: pointer;
      padding-bottom: 10px;
    }

    code {
      display: block;
      padding: 8px;
      margin-bottom: 10px;
      overflow-wrap: anywhere;
      user-select: text;
      background: var(--color-face);
    }
  }

  &__description {
    margin-bottom: 0 !important;
  }

  &__connection {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }

  &__connection-state {
    color: var(--color-muted);

    &--connected {
      color: var(--color-selection-dark);
    }

    &--error {
      color: var(--color-window-text);
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
