export interface TranslationModelAsset {
  id: string
  label: string
  url: string
  bytes: number
  sha256: string
}

const DETECTOR_COMMIT = '16e8a622f91fabc6b5b65c96d32d1183f8843546'
const BABERU_COMMIT = 'd9cc13153e9a1cd8fdfa3b7b1cc329da2020aeae'

export const IMAGE_TRANSLATION_MODEL_CACHE = 'websee-image-translation-models-v1'

export const DETECTOR_MODEL: TranslationModelAsset = {
  id: 'comic-text-detector-int8',
  label: '텍스트 영역 감지 모델',
  url: `https://huggingface.co/ogkalu/comic-text-and-bubble-detector/resolve/${DETECTOR_COMMIT}/detector-v4-s_int8.onnx`,
  bytes: 11_120_765,
  sha256: '5fe9e4f576e49d4e7e8b0e029d6d3cdc252abd4694113e1cae120e62c931ea79',
}

export const BABERU_MODELS: readonly TranslationModelAsset[] = [
  {
    id: 'baberu-vision-int4',
    label: 'Baberu 이미지 인식 모델',
    url: `https://huggingface.co/genshiai-daichi/baberu-ocr/resolve/${BABERU_COMMIT}/onnx/vision_int4.onnx`,
    bytes: 52_293_486,
    sha256: '9526bcf99eb8de805df7ea2f66b385cfcbcb5dff0e99a5dcfb02bdb2d4182bde',
  },
  {
    id: 'baberu-decoder-prefill-int8',
    label: 'Baberu OCR 초기 디코더',
    url: `https://huggingface.co/genshiai-daichi/baberu-ocr/resolve/${BABERU_COMMIT}/onnx/decoder_prefill_int8.onnx`,
    bytes: 35_133_596,
    sha256: '4f8d28d4e5e8b6c7f3a4510663aa0a9199a7eec06bcb1dc0afb3ca571494e97f',
  },
  {
    id: 'baberu-decoder-step-int8',
    label: 'Baberu OCR 반복 디코더',
    url: `https://huggingface.co/genshiai-daichi/baberu-ocr/resolve/${BABERU_COMMIT}/onnx/decoder_step_int8.onnx`,
    bytes: 33_929_034,
    sha256: '2eaf792ca70b67e55140ef0bcfbfc3c3b1e07d72ca277dcc46aae27c81f27ac8',
  },
  {
    id: 'baberu-vocab',
    label: 'Baberu 문자표',
    url: `https://huggingface.co/genshiai-daichi/baberu-ocr/resolve/${BABERU_COMMIT}/tokenizer/vocab.json`,
    bytes: 130_761,
    sha256: '681de4eb83154a397af49e2ddae4705041b12a22e16fe00860b829e889e5f47c',
  },
]

export const IMAGE_TRANSLATION_MODELS: readonly TranslationModelAsset[] = [
  DETECTOR_MODEL,
  ...BABERU_MODELS,
]

export const IMAGE_TRANSLATION_MODEL_TOTAL_BYTES = IMAGE_TRANSLATION_MODELS.reduce(
  (total, asset) => total + asset.bytes,
  0,
)
