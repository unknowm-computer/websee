import { describe, expect, it } from 'vitest'

import { getInferenceExecutionProviders } from '@/services/imageTranslation/onnxRuntime'

describe('image translation ONNX runtime', () => {
  it('prefers WebGPU and keeps WASM as a fallback', () => {
    expect(getInferenceExecutionProviders(true)).toEqual(['webgpu', 'wasm'])
  })

  it('uses WASM when WebGPU is unavailable', () => {
    expect(getInferenceExecutionProviders(false)).toEqual(['wasm'])
  })
})
