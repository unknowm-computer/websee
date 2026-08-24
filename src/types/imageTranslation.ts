export type ImageTranslationPhase =
  | 'idle'
  | 'preparing'
  | 'detecting'
  | 'recognizing'
  | 'awaiting-translation'
  | 'translating'
  | 'complete'
  | 'error'

export type TranslationRegionKind = 'bubble' | 'free-text'

export interface ImageBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RecognizedTextRegion {
  id: string
  kind: TranslationRegionKind
  bounds: ImageBounds
  sourceText: string
  detectionScore: number
}

export interface ImageTranslationRegion extends RecognizedTextRegion {
  translatedText: string
}

export interface ImageTranslationResult {
  itemId: string
  imageWidth: number
  imageHeight: number
  regions: ImageTranslationRegion[]
}

export interface ImageTranslationProgress {
  phase: ImageTranslationPhase
  message: string
  completed?: number
  total?: number
}

export interface AnalyzeImageRequest {
  type: 'analyze-image'
  requestId: number
  file: File
}

export interface CancelImageAnalysisRequest {
  type: 'cancel'
  requestId: number
}

export interface DisposeImageAnalysisRequest {
  type: 'dispose'
}

export type ImageTranslationWorkerRequest =
  | AnalyzeImageRequest
  | CancelImageAnalysisRequest
  | DisposeImageAnalysisRequest

export interface ImageAnalysisProgressResponse {
  type: 'progress'
  requestId: number
  progress: ImageTranslationProgress
}

export interface ImageAnalysisResultResponse {
  type: 'result'
  requestId: number
  imageWidth: number
  imageHeight: number
  regions: RecognizedTextRegion[]
}

export interface ImageAnalysisErrorResponse {
  type: 'error'
  requestId: number
  message: string
}

export type ImageTranslationWorkerResponse =
  | ImageAnalysisProgressResponse
  | ImageAnalysisResultResponse
  | ImageAnalysisErrorResponse
