interface PlatformNavigator {
  readonly userAgentData?: { readonly platform: string }
  readonly platform?: string
  readonly userAgent?: string
  readonly maxTouchPoints?: number
}

export function isMacOS(info: PlatformNavigator | undefined = globalThis.navigator): boolean {
  if (!info) return false
  const hintedPlatform = info.userAgentData?.platform
  if (hintedPlatform) return hintedPlatform.toLowerCase() === 'macos'

  // 데스크톱 사이트 모드의 iPad도 MacIntel을 보고하므로 구분합니다.
  if ((info.maxTouchPoints ?? 0) > 1 || /iPad|iPhone|iPod/i.test(info.userAgent ?? '')) return false
  if (info.platform) return /^Mac/i.test(info.platform)
  return /Macintosh|Mac OS X/i.test(info.userAgent ?? '')
}
