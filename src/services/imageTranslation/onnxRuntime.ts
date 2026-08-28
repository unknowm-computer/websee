import * as ort from 'onnxruntime-web/webgpu'
import ortWasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'

let configured = false
let webGpuDisabled = false

type OrtInferenceSession = import('onnxruntime-web').InferenceSession
type OrtSessionOptions = import('onnxruntime-web').InferenceSession.SessionOptions

function isWebGpuAvailable(): boolean {
  const globalNavigator = globalThis.navigator as Navigator & { gpu?: unknown }
  return Boolean(globalNavigator?.gpu)
}

export function getInferenceExecutionProviders(
  webGpuAvailable = isWebGpuAvailable(),
): readonly ('webgpu' | 'wasm')[] {
  return webGpuAvailable && !webGpuDisabled
    ? ['webgpu', 'wasm']
    : ['wasm']
}

export function getOnnxRuntime(): typeof ort {
  if (!configured) {
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    ort.env.wasm.wasmPaths = {
      mjs: new URL(ortWasmModuleUrl, self.location.href).href,
      wasm: new URL(ortWasmUrl, self.location.href).href,
    }
    configured = true
  }

  return ort
}

export async function createInferenceSession(
  model: ArrayBuffer,
  options: Omit<OrtSessionOptions, 'executionProviders'> = {},
): Promise<OrtInferenceSession> {
  const runtime = getOnnxRuntime()
  const executionProviders = getInferenceExecutionProviders()

  if (executionProviders[0] === 'webgpu') {
    try {
      return await runtime.InferenceSession.create(model, {
        ...options,
        executionProviders,
      })
    } catch (error) {
      webGpuDisabled = true
      console.warn('WebGPU 모델 실행을 시작하지 못해 WASM으로 전환합니다.', error)
    }
  }

  return runtime.InferenceSession.create(model, {
    ...options,
    executionProviders: ['wasm'],
  })
}
