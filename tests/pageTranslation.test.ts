import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('page translation opt-out', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

  it('excludes the page from Chrome page translation', () => {
    expect(html).toContain('<meta name="google" content="notranslate" />')
  })

  it('keeps viewer content outside automatic DOM translation', () => {
    expect(html).toMatch(/<html\b[^>]*\btranslate="no"/)
    expect(html).toMatch(/<html\b[^>]*\bclass="notranslate"/)
  })
})
