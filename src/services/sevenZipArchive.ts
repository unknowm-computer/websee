import type { SevenZipEntry } from './sevenZipReader'

type Result = SevenZipEntry[] | Uint8Array<ArrayBuffer>

interface SevenZipArchive {
  entries: SevenZipEntry[]
  readEntry(index: number): Promise<Uint8Array<ArrayBuffer>>
  release(): void
}

export async function openSevenZip(file: File): Promise<SevenZipArchive> {
  let worker: Worker | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let queue: Promise<void> = Promise.resolve()
  let cancelRequest: ((error: Error) => void) | undefined
  let generation = 0

  function stopWorker(): void {
    clearTimeout(idleTimer)
    worker?.terminate()
    worker = undefined
  }
  function request(index?: number): Promise<Result> {
    const requestGeneration = generation
    const result = queue.then(() => new Promise<Result>((resolve, reject) => {
      if (requestGeneration !== generation) throw new DOMException('Archive released', 'AbortError')
      clearTimeout(idleTimer)
      worker ??= new Worker(new URL('./sevenZip.worker.ts', import.meta.url), { type: 'module' })
      cancelRequest = reject
      worker.onmessage = ({ data }: MessageEvent<Result | { error: string }>) => {
        if ('error' in data) reject(new Error(data.error))
        else resolve(data)
      }
      worker.onerror = event => reject(new Error(event.message || '7z worker failed'))
      worker.onmessageerror = () => reject(new Error('Invalid response from 7z worker'))
      worker.postMessage({ file, index })
    }))
    queue = result.then(() => {
      cancelRequest = undefined
      // An inactive batch or browser can reopen its cursor on the next request.
      idleTimer = setTimeout(stopWorker, 30_000)
    }, () => {
      cancelRequest = undefined
      stopWorker()
    })
    return result
  }
  const entries = await request()
  if (!Array.isArray(entries)) throw new Error('Missing 7z directory')
  return {
    entries,
    async readEntry(index: number): Promise<Uint8Array<ArrayBuffer>> {
      const bytes = await request(index)
      if (!(bytes instanceof Uint8Array)) throw new Error('Missing 7z entry data')
      return bytes
    },
    release(): void {
      generation++
      stopWorker()
      cancelRequest?.(new DOMException('Archive released', 'AbortError'))
    },
  }
}
