/// <reference types="chrome-types" />

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('extension background service worker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens one viewer tab and focuses it on the next action click', async () => {
    const actionListeners: Array<() => void> = []
    const removedListeners: Array<(tabId: number) => void> = []
    let storedTabId: number | undefined
    const createTab = vi.fn(async () => ({ id: 17, windowId: 3 }))
    const getTab = vi.fn(async (tabId: number) => ({ id: tabId, windowId: 3 }))
    const updateTab = vi.fn(async () => undefined)
    const updateWindow = vi.fn(async () => undefined)

    vi.stubGlobal('chrome', {
      action: {
        onClicked: {
          addListener: (listener: () => void) => actionListeners.push(listener),
        },
      },
      runtime: {
        getURL: (path: string) => `chrome-extension://websee/${path}`,
      },
      storage: {
        session: {
          get: async () => ({ 'websee-viewer-tab-id': storedTabId }),
          remove: async () => {
            storedTabId = undefined
          },
          set: async (values: Record<string, unknown>) => {
            const tabId = values['websee-viewer-tab-id']
            storedTabId = typeof tabId === 'number' ? tabId : undefined
          },
        },
      },
      tabs: {
        create: createTab,
        get: getTab,
        onRemoved: {
          addListener: (listener: (tabId: number) => void) => removedListeners.push(listener),
        },
        update: updateTab,
      },
      windows: {
        update: updateWindow,
      },
    } as unknown as typeof chrome)

    await import('@/extension/background')
    expect(actionListeners).toHaveLength(1)
    expect(removedListeners).toHaveLength(1)

    actionListeners[0]()
    await vi.waitFor(() => expect(createTab).toHaveBeenCalledTimes(1))
    expect(storedTabId).toBe(17)

    actionListeners[0]()
    await vi.waitFor(() => expect(updateTab).toHaveBeenCalledWith(17, { active: true }))
    expect(createTab).toHaveBeenCalledTimes(1)
    expect(getTab).toHaveBeenCalledWith(17)
    expect(updateWindow).toHaveBeenCalledWith(3, { focused: true })
  })
})
