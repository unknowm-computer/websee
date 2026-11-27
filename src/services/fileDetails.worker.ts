import mediaInfoFactory, { type MediaInfo, type MediaInfoResult } from 'mediainfo.js'
import wasmUrl from 'mediainfo.js/MediaInfoModule.wasm?url'

import type { FileDetails, FileDetailsRequest } from './fileDetails'
import { readTextFileDetails } from './textFile'

const numbers = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 })
let parser: MediaInfo<'object'> | undefined

function mediaDetails(result: MediaInfoResult, kind: FileDetailsRequest['kind']): FileDetails {
  const tracks = result.media?.track ?? []
  const general = tracks.find(track => track['@type'] === 'General')
  const video = tracks.find(track => track['@type'] === 'Video')
  const audio = tracks.find(track => track['@type'] === 'Audio')
  const visual = kind === 'image' ? tracks.find(track => track['@type'] === 'Image') ?? video : video
  const details: FileDetails = {
    fields: [],
    width: visual?.Width,
    height: visual?.Height,
    duration: general?.Duration ?? video?.Duration ?? audio?.Duration,
  }
  function add(label: string, value?: string): void {
    if (value) details.fields.push({ label, value })
  }
  if (kind === 'image' && visual) {
    add('이미지 형식', [visual.Format, visual.Format_Profile].filter(Boolean).join(' '))
    add('색 공간', visual.ColorSpace)
    if (visual.BitDepth) add('비트 깊이', `${visual.BitDepth}비트`)
    const compression = visual.Compression_Mode
    add('압축 방식', compression === 'Lossless' ? '무손실' : compression === 'Lossy' ? '손실' : compression)
    if (video?.FrameCount && video.FrameCount > 1) add('프레임 수', numbers.format(video.FrameCount))
  }
  if (kind === 'video') {
    if (video?.Width && video.Height) {
      // Match the player's display dimensions for anamorphic and rotated video.
      const aspect = video.PixelAspectRatio || 1
      const width = aspect > 1 ? Math.round(video.Width * aspect) : video.Width
      const height = aspect > 0 && aspect < 1 ? Math.round(video.Height / aspect) : video.Height
      const quarterTurn = Math.abs(Number(video.Rotation) % 180) === 90
      details.width = quarterTurn ? height : width
      details.height = quarterTurn ? width : height
    }
    add('컨테이너', general?.Format)
    add('영상 코덱', [video?.Format, video?.Format_Profile].filter(Boolean).join(' '))
    if (video?.FrameRate) add('프레임률', `${numbers.format(video.FrameRate)} fps`)
    if (general?.OverallBitRate) add('전체 비트레이트', `${numbers.format(Math.round(general.OverallBitRate / 1000))} kbps`)
  }
  if ((kind === 'audio' || kind === 'video') && audio) {
    add('오디오 코덱', [audio.Format, audio.Format_Profile].filter(Boolean).join(' '))
    if (audio.BitRate) {
      const mode = audio.BitRate_Mode
      const label = kind === 'video' ? '오디오 비트레이트' : mode === 'VBR' ? '평균 비트레이트' : '비트레이트'
      add(label, `${Math.round(audio.BitRate / 1000)} kbps${mode ? ` (${mode})` : ''}`)
    }
    if (audio.SamplingRate) add('샘플레이트', `${numbers.format(audio.SamplingRate / 1000)} kHz`)
    if (audio.Channels) {
      const layout = audio.Channels === 1 ? ' (모노)' : audio.Channels === 2 ? ' (스테레오)' : ''
      add('채널 수', `${audio.Channels}${layout}`)
    }
  }
  return details
}

self.onmessage = async ({ data: { file, kind } }: MessageEvent<FileDetailsRequest>): Promise<void> => {
  try {
    let details: FileDetails
    if (kind === 'text') {
      const { encoding, lineEndings } = await readTextFileDetails(file)
      details = { fields: [{ label: '인코딩', value: encoding }, { label: '줄바꿈', value: lineEndings }] }
    } else {
      // Requests are sequential. analyzeData resets the parser for each new file.
      parser ??= await mediaInfoFactory({ locateFile: () => wasmUrl })
      const result = await parser.analyzeData(file.size, async (size, offset) =>
        new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()))
      details = mediaDetails(result, kind)
    }
    self.postMessage(details)
  } catch {
    parser?.close()
    parser = undefined
    self.postMessage(null)
  }
}
