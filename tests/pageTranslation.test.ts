import { readFileSync } from 'node:fs'

import { NodeTypes, parse as parseTemplate, type ElementNode, type RootNode } from '@vue/compiler-dom'
import { parse as parseComponent } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

interface TemplateElement {
  node: ElementNode
  ancestors: ElementNode[]
}

function readElements(path: string): TemplateElement[] {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const template = path.endsWith('.vue')
    ? parseComponent(source).descriptor.template?.content
    : source
  if (!template) throw new Error(`Missing template: ${path}`)
  const elements: TemplateElement[] = []

  function visit(parent: RootNode | ElementNode, ancestors: ElementNode[]): void {
    for (const node of parent.children) {
      if (node.type !== NodeTypes.ELEMENT) continue
      elements.push({ node, ancestors })
      visit(node, [...ancestors, node])
    }
  }

  visit(parseTemplate(template), [])
  return elements
}

function attribute(node: ElementNode, name: string): string | undefined {
  const prop = node.props.find((entry) => entry.type === NodeTypes.ATTRIBUTE && entry.name === name)
  return prop?.type === NodeTypes.ATTRIBUTE ? prop.value?.content : undefined
}

function blocksTranslation(node: ElementNode): boolean {
  return attribute(node, 'translate') === 'no'
    || (attribute(node, 'class')?.split(/\s+/).includes('notranslate') ?? false)
}

describe('page translation boundaries', () => {
  it('does not disable Chrome translation for the entire document', () => {
    const elements = readElements('../index.html')
    expect(elements.find(({ node }) => node.tag === 'html')?.node).toBeDefined()
    expect(elements.some(({ node }) => blocksTranslation(node))).toBe(false)
    expect(elements.some(({ node }) => node.tag === 'meta'
      && attribute(node, 'name') === 'google'
      && attribute(node, 'content') === 'notranslate')).toBe(false)
  })

  it('protects app controls and filenames without blocking text viewers', () => {
    const elements = readElements('../src/App.vue')
    for (const tag of ['AppToolbar', 'FolderTree', 'StatusBar', 'ImageViewer',
      'ImagePreviewPane', 'OptionsDialog', 'HelpDialog', 'BatchTranslationDialog',
      'BatchTranslationMiniStatus']) {
      const element = elements.find(({ node }) => node.tag === tag)
      expect(element, tag).toBeDefined()
      expect(element && blocksTranslation(element.node), tag).toBe(true)
    }
    const fileList = elements.find(({ node }) => attribute(node, 'class')?.split(/\s+/)
      .includes('media-browser__content'))
    expect(fileList && blocksTranslation(fileList.node)).toBe(true)
    for (const tag of ['TextViewer', 'TextPreviewPane']) {
      const element = elements.find(({ node }) => node.tag === tag)
      expect(element, tag).toBeDefined()
      expect(element && [...element.ancestors, element.node].some(blocksTranslation), tag).toBe(false)
    }
  })

  it.each([
    '../src/components/viewer/TextViewer.vue',
    '../src/components/browser/TextPreviewPane.vue',
  ])('allows reading text but protects toolbar and filename in %s', (path) => {
    const elements = readElements(path)
    const body = elements.find(({ node }) => node.tag === 'pre')
    expect(body).toBeDefined()
    expect(body && attribute(body.node, 'translate')).toBe('yes')
    expect(body?.ancestors.some(blocksTranslation)).toBe(false)
    for (const tag of ['header', 'footer']) {
      const element = elements.find(({ node }) => node.tag === tag)
      expect(element, tag).toBeDefined()
      expect(element && blocksTranslation(element.node), tag).toBe(true)
    }
  })

  it('protects editable source text from automatic translation', () => {
    const editor = readElements('../src/components/viewer/TextViewer.vue')
      .find(({ node }) => node.tag === 'TextEditor')
    expect(editor).toBeDefined()
    expect(editor && blocksTranslation(editor.node)).toBe(true)
  })
})
