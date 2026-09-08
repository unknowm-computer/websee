export const MAX_IMAGE_ENHANCEMENT_PIXELS = 40_000_000

export type ImageEnhancementRenderResult = 'rendered' | 'too-large' | 'failed'

export interface ImageEnhancementRenderer {
  dispose: () => void
  render: (image: HTMLImageElement) => ImageEnhancementRenderResult
}

function skipGifSubBlocks(bytes: Uint8Array, startOffset: number): number {
  let offset = startOffset

  while (offset < bytes.length) {
    const blockSize = bytes[offset]
    offset += 1
    if (blockSize === 0) return offset
    if (offset + blockSize > bytes.length) throw new Error('GIF data block is truncated.')
    offset += blockSize
  }

  throw new Error('GIF data block terminator is missing.')
}

export function isAnimatedGif(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.length < 13) throw new Error('GIF header is truncated.')

  const signature = String.fromCharCode(...bytes.subarray(0, 6))
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    throw new Error('GIF signature is invalid.')
  }

  const globalColorTablePacked = bytes[10]
  const globalColorTableSize = globalColorTablePacked & 0x80
    ? 3 * 2 ** ((globalColorTablePacked & 0x07) + 1)
    : 0
  let offset = 13 + globalColorTableSize
  let frameCount = 0

  if (offset > bytes.length) throw new Error('GIF global color table is truncated.')

  while (offset < bytes.length) {
    const marker = bytes[offset]
    offset += 1

    if (marker === 0x3b) return false
    if (marker === 0x00) continue

    if (marker === 0x21) {
      if (offset >= bytes.length) throw new Error('GIF extension label is missing.')
      offset += 1
      offset = skipGifSubBlocks(bytes, offset)
      continue
    }

    if (marker !== 0x2c) throw new Error('GIF block marker is invalid.')
    if (offset + 9 > bytes.length) throw new Error('GIF image descriptor is truncated.')

    const localColorTablePacked = bytes[offset + 8]
    const localColorTableSize = localColorTablePacked & 0x80
      ? 3 * 2 ** ((localColorTablePacked & 0x07) + 1)
      : 0
    offset += 9 + localColorTableSize
    if (offset >= bytes.length) throw new Error('GIF image data is truncated.')

    frameCount += 1
    if (frameCount > 1) return true

    offset += 1
    offset = skipGifSubBlocks(bytes, offset)
  }

  throw new Error('GIF trailer is missing.')
}

export function supportsImageEnhancement(format: string, animatedGif: boolean): boolean {
  const normalizedFormat = format.toUpperCase()
  if (normalizedFormat === 'SVG') return false
  return normalizedFormat !== 'GIF' || !animatedGif
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;

  uniform sampler2D u_image;
  uniform vec2 u_texelSize;
  varying vec2 v_texCoord;

  void main() {
    vec4 center = texture2D(u_image, v_texCoord);
    vec3 blur = center.rgb * 0.5;
    blur += texture2D(u_image, v_texCoord + vec2(u_texelSize.x, 0.0)).rgb * 0.125;
    blur += texture2D(u_image, v_texCoord - vec2(u_texelSize.x, 0.0)).rgb * 0.125;
    blur += texture2D(u_image, v_texCoord + vec2(0.0, u_texelSize.y)).rgb * 0.125;
    blur += texture2D(u_image, v_texCoord - vec2(0.0, u_texelSize.y)).rgb * 0.125;

    vec3 sharpened = center.rgb + (center.rgb - blur) * 0.55;
    vec3 enhanced = (sharpened - 0.5) * 1.04 + 0.5;
    gl_FragColor = vec4(clamp(enhanced, 0.0, 1.0), center.a);
  }
`

const QUAD_VERTICES = new Float32Array([
  -1, -1, 0, 0,
  1, -1, 1, 0,
  -1, 1, 0, 1,
  -1, 1, 0, 1,
  1, -1, 1, 0,
  1, 1, 1, 1,
])

export function isImageWithinEnhancementLimits(
  width: number,
  height: number,
  maxTextureSize: number,
  maxRenderbufferSize: number,
  maxPixels = MAX_IMAGE_ENHANCEMENT_PIXELS,
): boolean {
  return Number.isInteger(width)
    && Number.isInteger(height)
    && width > 0
    && height > 0
    && width <= maxTextureSize
    && height <= maxTextureSize
    && width <= maxRenderbufferSize
    && height <= maxRenderbufferSize
    && width * height <= maxPixels
}

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | undefined {
  const shader = gl.createShader(type)
  if (!shader) return undefined

  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader

  gl.deleteShader(shader)
  return undefined
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | undefined {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
    return undefined
  }

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    return undefined
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  gl.deleteProgram(program)
  return undefined
}

class WebGlImageEnhancementRenderer implements ImageEnhancementRenderer {
  private readonly maxRenderbufferSize: number
  private readonly maxTextureSize: number

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGLRenderingContext,
    private readonly program: WebGLProgram,
    private readonly buffer: WebGLBuffer,
    private readonly texture: WebGLTexture,
    private readonly texelSizeLocation: WebGLUniformLocation,
  ) {
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    this.maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
  }

  render(image: HTMLImageElement): ImageEnhancementRenderResult {
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!isImageWithinEnhancementLimits(
      width,
      height,
      this.maxTextureSize,
      this.maxRenderbufferSize,
    )) return 'too-large'

    const { canvas, gl } = this
    if (gl.isContextLost()) return 'failed'

    try {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
      gl.useProgram(this.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      )
      gl.uniform2f(this.texelSizeLocation, 1 / width, 1 / height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.flush()

      if (gl.getError() === gl.NO_ERROR) return 'rendered'
    } catch {
      // GPU 메모리 부족이나 텍스처 업로드 실패는 호출부의 CSS 폴백으로 처리합니다.
    }

    canvas.width = 1
    canvas.height = 1
    return 'failed'
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture)
    this.gl.deleteBuffer(this.buffer)
    this.gl.deleteProgram(this.program)
    this.canvas.width = 1
    this.canvas.height = 1
  }
}

export function createImageEnhancementRenderer(
  canvas: HTMLCanvasElement,
): ImageEnhancementRenderer | undefined {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: false,
    stencil: false,
  })
  if (!gl) return undefined

  const program = createProgram(gl)
  const buffer = gl.createBuffer()
  const texture = gl.createTexture()
  if (!program || !buffer || !texture) {
    if (program) gl.deleteProgram(program)
    if (buffer) gl.deleteBuffer(buffer)
    if (texture) gl.deleteTexture(texture)
    return undefined
  }

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const textureCoordinateLocation = gl.getAttribLocation(program, 'a_texCoord')
  const texelSizeLocation = gl.getUniformLocation(program, 'u_texelSize')
  if (positionLocation < 0 || textureCoordinateLocation < 0 || !texelSizeLocation) {
    gl.deleteTexture(texture)
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
    return undefined
  }

  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(textureCoordinateLocation)
  gl.vertexAttribPointer(textureCoordinateLocation, 2, gl.FLOAT, false, 16, 8)

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  return new WebGlImageEnhancementRenderer(
    canvas,
    gl,
    program,
    buffer,
    texture,
    texelSizeLocation,
  )
}
