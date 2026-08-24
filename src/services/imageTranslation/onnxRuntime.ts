import * as ort from 'onnxruntime-web/wasm'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

let configured = false

export function getOnnxRuntime(): typeof ort {
  if (!configured) {
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    ort.env.wasm.wasmPaths = {
      wasm: new URL(ortWasmUrl, self.location.href).href,
    }
    configured = true
  }

  return ort
}
