import { createSevenZipReader, type SevenZipReader } from './sevenZipReader'

let reader: SevenZipReader | undefined
self.onmessage = async ({ data }: MessageEvent<{ file: File; index?: number }>): Promise<void> => {
  try {
    reader ??= await createSevenZipReader(data.file)
    if (data.index === undefined) {
      self.postMessage(reader.list())
    } else {
      const bytes = reader.extract(data.index)
      self.postMessage(bytes, { transfer: [bytes.buffer] })
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '7z decoding failed' })
  }
}
