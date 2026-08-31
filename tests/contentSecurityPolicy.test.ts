import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { CODEMIRROR_CSP_NONCE } from '@/utils/contentSecurityPolicy'

interface ExtensionManifest {
  content_security_policy: {
    extension_pages: string
  }
}

describe('extension content security policy', () => {
  it('allows the nonce used by CodeMirror generated styles', () => {
    const manifestPath = fileURLToPath(new URL('../public/manifest.json', import.meta.url))
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest

    expect(manifest.content_security_policy.extension_pages)
      .toContain(`style-src 'self' 'nonce-${CODEMIRROR_CSP_NONCE}'`)
  })
})
