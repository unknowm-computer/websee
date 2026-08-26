export interface AttentionSound {
  prepare: () => void
  play: () => void
  dispose: () => void
}

export function createAttentionSound(): AttentionSound {
  let context: AudioContext | undefined

  function prepare(): void {
    if (typeof AudioContext === 'undefined') return
    try {
      if (!context || context.state === 'closed') context = new AudioContext()
      if (context.state === 'suspended') void context.resume().catch(() => undefined)
    } catch {
      context = undefined
    }
  }

  function playTone(): void {
    if (!context || context.state !== 'running') return

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const startedAt = context.currentTime

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(740, startedAt)
    oscillator.frequency.setValueAtTime(940, startedAt + 0.18)

    gain.gain.setValueAtTime(0.0001, startedAt)
    gain.gain.exponentialRampToValueAtTime(0.055, startedAt + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.12)
    gain.gain.setValueAtTime(0.0001, startedAt + 0.18)
    gain.gain.exponentialRampToValueAtTime(0.055, startedAt + 0.19)
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.31)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect()
      gain.disconnect()
    }, { once: true })
    oscillator.start(startedAt)
    oscillator.stop(startedAt + 0.33)
  }

  function play(): void {
    if (!context) return
    if (context.state === 'suspended') {
      void context.resume().then(playTone).catch(() => undefined)
      return
    }
    playTone()
  }

  function dispose(): void {
    const activeContext = context
    context = undefined
    if (activeContext && activeContext.state !== 'closed') {
      void activeContext.close().catch(() => undefined)
    }
  }

  return { prepare, play, dispose }
}
