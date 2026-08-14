/// <reference types="chrome-types" />

const VIEWER_TAB_STORAGE_KEY = 'websee-viewer-tab-id'

async function readViewerTabId(): Promise<number | undefined> {
  const stored = await chrome.storage.session.get(VIEWER_TAB_STORAGE_KEY)
  const tabId = stored[VIEWER_TAB_STORAGE_KEY]
  return typeof tabId === 'number' ? tabId : undefined
}

async function rememberViewerTabId(tabId: number): Promise<void> {
  await chrome.storage.session.set({ [VIEWER_TAB_STORAGE_KEY]: tabId })
}

async function forgetViewerTabId(): Promise<void> {
  await chrome.storage.session.remove(VIEWER_TAB_STORAGE_KEY)
}

async function focusViewerTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId)
    await chrome.tabs.update(tabId, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
    return true
  } catch {
    await forgetViewerTabId()
    return false
  }
}

async function openViewer(): Promise<void> {
  const existingTabId = await readViewerTabId()
  if (existingTabId !== undefined && await focusViewerTab(existingTabId)) return

  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
  if (tab.id !== undefined) await rememberViewerTabId(tab.id)
}

chrome.action.onClicked.addListener(() => {
  void openViewer()
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void readViewerTabId().then((viewerTabId) => {
    if (viewerTabId === tabId) return forgetViewerTabId()
  })
})
