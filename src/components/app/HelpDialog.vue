<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon.vue'

const emit = defineEmits<{
  (event: 'close'): void
}>()
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')">
    <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <header>
        <strong id="help-title">WebSee 도움말</strong>
        <button type="button" aria-label="도움말 닫기" @click="emit('close')">
          <SvgIcon name="close" :size="17" />
        </button>
      </header>
      <div class="help-dialog__body">
        <p>왼쪽 탐색 트리에서 폴더와 압축파일을 열 수 있습니다. 이미지와 텍스트 파일은 왼쪽에서 미리 보고 상세보기로 열 수 있습니다. 압축파일의 이미지 썸네일과 해상도는 뒤에서 순서대로 만듭니다.</p>
        <dl>
          <div><dt><kbd>Enter</kbd></dt><dd>상세보기 열기·닫기</dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd>상세보기에서 브라우저로 돌아가기</dd></div>
          <div><dt><kbd>Backspace</kbd></dt><dd>압축파일 목록에서 상위 폴더로 돌아가기</dd></div>
          <div><dt><kbd>←</kbd> <kbd>↑</kbd> / <kbd>→</kbd> <kbd>↓</kbd></dt><dd>이전·다음 이미지</dd></div>
          <div><dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>확대·축소</dd></div>
          <div><dt><kbd>휠</kbd></dt><dd>확대 이미지 상하 이동</dd></div>
          <div><dt><kbd>Shift</kbd> + <kbd>휠</kbd></dt><dd>확대 이미지 좌우 이동</dd></div>
          <div><dt>트랙패드 핀치</dt><dd>확대·축소</dd></div>
          <div><dt><kbd>0</kbd></dt><dd>화면 맞춤·100% 전환</dd></div>
          <div><dt><kbd>R</kbd></dt><dd>시계 방향 회전</dd></div>
          <div><dt><kbd>F</kbd></dt><dd>전체화면</dd></div>
          <div><dt><kbd>Space</kbd></dt><dd>다음 이미지</dd></div>
        </dl>
        <p>이미지 상세보기의 <strong>화질 개선</strong> 버튼은 원본을 수정하지 않고 선과 글자를 조금 더 또렷하게 표시합니다. 일반 이미지는 GPU로 처리하며, 크기가 너무 크거나 WebGL을 사용할 수 없으면 가벼운 대비 보정으로 자동 전환됩니다.</p>
        <p>이미지 상세보기의 <strong>번역</strong> 버튼은 현재 한 장의 말풍선과 텍스트를 한국어로 표시합니다. 번역 레이어의 마지막 표시·숨김 상태는 다음 이미지와 다음 실행에도 유지됩니다. 최초 사용 시 영역 감지 모델 약 11MB와 Baberu OCR 모델 약 121MB를 내려받으며, 저장된 모델은 메인 툴바의 <strong>옵션</strong>에서 관리할 수 있습니다.</p>
        <p><strong>폴더 열기</strong>로 연 파일은 쓰기 권한을 허용하면 번역 결과를 원본 폴더의 숨김용 <code>.websee</code> 폴더에 저장합니다. 일반 이미지는 파일별 JSON으로, 압축파일은 압축파일별 JSON 하나로 보존하며 다음에 열 때 자동으로 불러옵니다. 현재 폴더의 저장 용량 확인·사용하지 않는 데이터 정리·전체 삭제는 <strong>일괄 번역</strong> 창에서 할 수 있습니다.</p>
        <p><strong>일괄 번역</strong>은 현재 폴더의 이미지와 선택한 압축파일 내부 이미지를 한 장씩 번역합니다. 저장된 결과는 기본적으로 건너뛰므로 중지하거나 WebSee를 다시 연 뒤에도 같은 작업을 이어갈 수 있습니다. 하위 폴더는 포함하지 않습니다.</p>
        <p class="help-dialog__privacy">선택한 파일은 서버에 업로드되지 않고 이 브라우저에서만 처리됩니다.</p>
      </div>
      <footer><button type="button" autofocus @click="emit('close')">확인</button></footer>
    </section>
  </div>
</template>

<style lang="scss">
.dialog-backdrop {
  position: fixed;
  z-index: 200;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgb(0 0 0 / 34%);
}

.help-dialog {
  width: min(460px, 100%);
  color: var(--color-window-text);
  background: var(--color-face);
  border: 1px solid var(--color-shadow-dark);
  box-shadow: inset 1px 1px var(--color-light), 4px 5px 15px rgb(0 0 0 / 35%);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    padding: 3px 4px 3px 8px;
    color: #fff;
    background: var(--color-selection);

    button {
      display: grid;
      place-items: center;
      width: 23px;
      height: 22px;
      padding: 0;
      background: var(--color-face);
      border: 1px solid;
      border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
        var(--color-light);
    }
  }

  &__body {
    padding: 13px 16px 8px;
  }

  p {
    margin: 0 0 12px;
  }

  dl {
    margin: 0 0 12px;
    background: #fff;
    border: 1px solid var(--color-shadow);

    div {
      display: grid;
      grid-template-columns: 150px 1fr;
      min-height: 28px;
      border-bottom: 1px solid #e4e4e4;

      &:last-child {
        border-bottom: 0;
      }
    }

    dt,
    dd {
      padding: 5px 8px;
      margin: 0;
    }
  }

  kbd {
    padding: 1px 5px;
    font: inherit;
    background: #f6f6f6;
    border: 1px solid #aaa;
    border-radius: 2px;
    box-shadow: 0 1px #777;
  }

  &__privacy {
    color: var(--color-muted);
  }

  footer {
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px 12px;

    button {
      min-width: 76px;
      min-height: 27px;
      font: inherit;
      background: var(--color-face);
      border: 1px solid;
      border-color: var(--color-light) var(--color-shadow-dark) var(--color-shadow-dark)
        var(--color-light);
    }
  }
}
</style>
