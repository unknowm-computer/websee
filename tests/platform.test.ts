import { afterEach, describe, expect, it, vi } from 'vitest'

import { isMacOS } from '@/utils/platform'

afterEach(() => vi.unstubAllGlobals())

describe('macOS platform detection', () => {
  it('uses User-Agent Client Hints before legacy platform values', () => {
    expect(isMacOS({ userAgentData: { platform: 'macOS' }, platform: 'MacIntel' })).toBe(true)
    expect(isMacOS({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false)
    expect(isMacOS({ userAgentData: { platform: 'Linux' } })).toBe(false)
    expect(isMacOS({ userAgentData: { platform: 'Chrome OS' } })).toBe(false)
  })

  it('recognizes macOS when Client Hints are unavailable', () => {
    expect(isMacOS({ platform: 'MacIntel', maxTouchPoints: 0 })).toBe(true)
    expect(isMacOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(true)
    expect(isMacOS({ platform: 'Win32' })).toBe(false)
    expect(isMacOS({ platform: 'Linux x86_64' })).toBe(false)
  })

  it('excludes iPad desktop mode and iOS devices', () => {
    expect(isMacOS({ platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Macintosh' })).toBe(false)
    expect(isMacOS({ userAgent: 'iPhone; CPU iPhone OS 18_0 like Mac OS X' })).toBe(false)
  })

  it('keeps native options unavailable if the OS cannot be identified', () => {
    expect(isMacOS({})).toBe(false)
    vi.stubGlobal('navigator', undefined)
    expect(isMacOS()).toBe(false)
  })
})
