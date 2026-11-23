import { beforeEach, describe, expect, it, vi } from "vitest"

import { installSteps, runInstallSteps } from "./installLifecycle"
import {
  APPLY_UPDATE_NOW_MESSAGE, PREPARE_UPDATE_MESSAGE, RESTORE_TABS_KEY, UPDATE_ALARM, UPDATE_FORCE_KEY, UPDATE_READY_KEY,
  flexTabKind, installUpdateFlow, restoreTabsAfterUpdate, tryApplyUpdate, type RestoreTab,
} from "./updateFlow"

const ORIGIN = "chrome-extension://test/"

type Tab = Partial<chrome.tabs.Tab> & { id: number }
let disk: Record<string, unknown>
let tabs: Tab[]
let focused: { focused: boolean; activeId?: number }

const c = chrome as unknown as Record<string, any>

beforeEach(() => {
  disk = {}
  tabs = []
  focused = { focused: true }
  vi.mocked(chrome.storage.local.get).mockImplementation((async (keys: string | string[]) =>
    Object.fromEntries([keys].flat().filter((k) => k in disk).map((k) => [k, structuredClone(disk[k])]))) as never)
  vi.mocked(chrome.storage.local.set).mockImplementation((async (v: Record<string, unknown>) => { Object.assign(disk, structuredClone(v)) }) as never)
  vi.mocked(chrome.storage.local.remove).mockImplementation((async (keys: string | string[]) => { for (const k of [keys].flat()) delete disk[k] }) as never)
  c.tabs.query = vi.fn(async () => tabs.map((t) => ({ windowId: 1, index: 0, active: false, ...t })))
  c.tabs.sendMessage = vi.fn(async () => ({ ok: true }))
  c.tabs.get = vi.fn(async (id: number) => {
    const tab = tabs.find((t) => t.id === id)
    if (!tab) throw new Error("No tab")
    return tab
  })
  c.tabs.update = vi.fn(async () => ({}))
  c.tabs.create = vi.fn(async () => ({}))
  c.windows.getLastFocused = vi.fn(async () => ({
    focused: focused.focused,
    tabs: tabs.map((t) => ({ ...t, active: t.id === focused.activeId })),
  }))
  c.alarms = { ...c.alarms, clear: vi.fn(async () => true) }
})

const ready = () => { disk[UPDATE_READY_KEY] = { version: "0.1.0.8", at: 1 } }
const deps = () => ({ flushBackground: vi.fn(async () => {}), reload: vi.fn() })

describe("installSteps (TASK-113)", () => {
  it("runs the shared setup on a first install", () => {
    expect(installSteps("install")).toEqual(["deviceId", "menus", "initialPush"])
  })

  it("restores the dropped pages on an update and runs no install-only work", () => {
    expect(installSteps("update")).toEqual(["deviceId", "menus", "restoreTabs", "clearUpdateRequired", "initialPush"])
    expect(installSteps("install")).not.toContain("restoreTabs")
  })

  it("treats a browser update like a start: no restore", () => {
    expect(installSteps("chrome_update")).not.toContain("restoreTabs")
  })

  it("runs every step even when one fails", async () => {
    const ran: string[] = []
    await runInstallSteps("update", {
      deviceId: () => ran.push("deviceId"),
      menus: () => { throw new Error("menus") },
      restoreTabs: () => ran.push("restoreTabs"),
      clearUpdateRequired: () => ran.push("clearUpdateRequired"),
      initialPush: () => ran.push("initialPush"),
    })
    expect(ran).toEqual(["deviceId", "restoreTabs", "clearUpdateRequired", "initialPush"])
  })
})

describe("flexTabKind", () => {
  it("tells an overriding new tab from an extension page and other pages", () => {
    expect(flexTabKind("chrome://newtab/", ORIGIN)).toBe("newtab")
    expect(flexTabKind(`${ORIGIN}newtab.html#/settings`, ORIGIN)).toBe("page")
    expect(flexTabKind("https://example.com/", ORIGIN)).toBeNull()
    expect(flexTabKind("chrome://new-tab-page/", ORIGIN)).toBeNull()
    expect(flexTabKind(undefined, ORIGIN)).toBeNull()
  })
})

describe("tryApplyUpdate", () => {
  it("does nothing without a waiting update", async () => {
    const d = deps()
    expect(await tryApplyUpdate(d)).toBe(false)
    expect(d.reload).not.toHaveBeenCalled()
  })

  it("waits while FlexTab is the active tab of the focused window", async () => {
    ready()
    tabs = [{ id: 1, url: "chrome://newtab/" }]
    focused = { focused: true, activeId: 1 }
    const d = deps()
    expect(await tryApplyUpdate(d)).toBe(false)
    expect(d.reload).not.toHaveBeenCalled()
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it("asks every FlexTab page and the background to finish, records the tabs, then reloads", async () => {
    ready()
    tabs = [
      { id: 1, url: "chrome://newtab/", windowId: 1, index: 0 },
      { id: 2, url: "https://example.com/", windowId: 1, index: 1 },
      { id: 3, url: `${ORIGIN}newtab.html#/settings`, windowId: 2, index: 4, active: true },
    ]
    focused = { focused: true, activeId: 2 }
    const order: string[] = []
    c.tabs.sendMessage = vi.fn(async (id: number) => { order.push(`flush ${id}`); return { ok: true } })
    const d = { flushBackground: vi.fn(async () => { order.push("flush background") }), reload: vi.fn(() => order.push("reload")) }

    expect(await tryApplyUpdate(d)).toBe(true)
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: PREPARE_UPDATE_MESSAGE })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, { type: PREPARE_UPDATE_MESSAGE })
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(2, expect.anything())
    expect(order.at(-1)).toBe("reload")
    expect(disk[RESTORE_TABS_KEY]).toEqual([
      { id: 1, windowId: 1, index: 0, url: "chrome://newtab/", active: false, kind: "newtab" },
      { id: 3, windowId: 2, index: 4, url: `${ORIGIN}newtab.html#/settings`, active: true, kind: "page" },
    ])
  })

  it("still reloads when a page never answers", async () => {
    vi.useFakeTimers()
    try {
      ready()
      tabs = [{ id: 1, url: "chrome://newtab/" }]
      c.tabs.sendMessage = vi.fn(() => new Promise(() => {}))
      const d = deps()
      const applied = tryApplyUpdate(d)
      await vi.advanceTimersByTimeAsync(5000)
      expect(await applied).toBe(true)
      expect(d.reload).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it("counts a tab still loading FlexTab by its pending URL", async () => {
    ready()
    tabs = [{ id: 1, url: "", pendingUrl: "chrome://newtab/" }]
    focused = { focused: true, activeId: 1 }
    expect(await tryApplyUpdate(deps())).toBe(false)
  })

  it("applies when the focused window cannot be read", async () => {
    ready()
    c.windows.getLastFocused = vi.fn(async () => { throw new Error("no window") })
    const d = deps()
    expect(await tryApplyUpdate(d)).toBe(true)
  })

  it("runs one apply at a time", async () => {
    ready()
    tabs = [{ id: 1, url: "chrome://newtab/" }]
    let answer!: () => void
    c.tabs.sendMessage = vi.fn(() => new Promise<void>((r) => { answer = r }))
    const d = deps()
    const first = tryApplyUpdate(d)
    await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalled())
    expect(await tryApplyUpdate(d)).toBe(false)
    answer()
    expect(await first).toBe(true)
    expect(d.reload).toHaveBeenCalledOnce()
  })

  it("gives up when the user comes back to FlexTab while the writes finish", async () => {
    ready()
    tabs = [{ id: 1, url: "chrome://newtab/" }]
    c.tabs.sendMessage = vi.fn(async () => { focused = { focused: true, activeId: 1 }; return { ok: true } })
    const d = deps()
    expect(await tryApplyUpdate(d)).toBe(false)
    expect(d.reload).not.toHaveBeenCalled()
    expect(disk[RESTORE_TABS_KEY]).toBeUndefined()
  })
})

describe("restoreTabsAfterUpdate", () => {
  const saved = (t: Partial<RestoreTab> & { id: number }): RestoreTab =>
    ({ windowId: 1, index: 0, url: "chrome://newtab/", active: false, kind: "newtab", ...t })

  it("puts FlexTab back in a new tab the reload left on the browser's new tab page", async () => {
    disk[RESTORE_TABS_KEY] = [saved({ id: 1 })]
    tabs = [{ id: 1, url: "chrome://new-tab-page/" }]
    await restoreTabsAfterUpdate()
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "chrome://newtab/" })
  })

  it("leaves a new tab the user has already taken elsewhere", async () => {
    disk[RESTORE_TABS_KEY] = [saved({ id: 1 })]
    tabs = [{ id: 1, url: "https://example.com/" }]
    await restoreTabsAfterUpdate()
    expect(chrome.tabs.update).not.toHaveBeenCalled()
  })

  it("reopens a closed extension page where it was", async () => {
    const page = saved({ id: 7, windowId: 2, index: 3, url: `${ORIGIN}newtab.html#/settings`, active: true, kind: "page" })
    disk[RESTORE_TABS_KEY] = [page]
    await restoreTabsAfterUpdate()
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 2, index: 3, url: page.url, active: true })
  })

  it("clears the waiting update, the recorded tabs and the alarm, and runs once", async () => {
    ready()
    disk[RESTORE_TABS_KEY] = [saved({ id: 1 })]
    tabs = [{ id: 1, url: "chrome://new-tab-page/" }]
    await restoreTabsAfterUpdate()
    expect(disk[UPDATE_READY_KEY]).toBeUndefined()
    expect(disk[RESTORE_TABS_KEY]).toBeUndefined()
    expect(chrome.alarms.clear).toHaveBeenCalledWith(UPDATE_ALARM)
    await restoreTabsAfterUpdate()
    expect(chrome.tabs.update).toHaveBeenCalledOnce()
  })
})

describe("installUpdateFlow", () => {
  it("marks the update ready, starts the alarm, and checks on each signal", async () => {
    const on = (name: string) => ({ addListener: vi.fn() as ReturnType<typeof vi.fn> & { name?: string }, name })
    c.runtime.onUpdateAvailable = on("update")
    c.tabs.onActivated = on("tab")
    c.windows.onFocusChanged = on("window")
    c.alarms = { ...c.alarms, create: vi.fn(), onAlarm: on("alarm") }
    const d = deps()
    installUpdateFlow(d)

    c.runtime.onUpdateAvailable.addListener.mock.calls[0][0]({ version: "0.1.0.8" })
    await vi.waitFor(() => expect(d.reload).toHaveBeenCalledOnce()) // nothing open: applied at once
    expect(chrome.alarms.create).toHaveBeenCalledWith(UPDATE_ALARM, { periodInMinutes: 1 })
    expect(disk[UPDATE_READY_KEY]).toMatchObject({ version: "0.1.0.8" })

    focused = { focused: true, activeId: 1 }
    tabs = [{ id: 1, url: "chrome://newtab/" }]
    c.tabs.onActivated.addListener.mock.calls[0][0]()
    c.windows.onFocusChanged.addListener.mock.calls[0][0]()
    c.alarms.onAlarm.addListener.mock.calls[0][0]({ name: "other" })
    c.alarms.onAlarm.addListener.mock.calls[0][0]({ name: UPDATE_ALARM })
    await new Promise((r) => setTimeout(r, 0))
    expect(d.reload).toHaveBeenCalledOnce() // FlexTab in front: still waiting
  })
})

describe("installing at once when the user asks (TASK-114)", () => {
  it("applies with FlexTab in front once the user asked, and the restore forgets the request", async () => {
    ready()
    disk[UPDATE_FORCE_KEY] = true
    tabs = [{ id: 1, url: "chrome://newtab/" }]
    focused = { focused: true, activeId: 1 }
    const d = deps()
    expect(await tryApplyUpdate(d)).toBe(true)
    expect(d.reload).toHaveBeenCalledOnce()
    await restoreTabsAfterUpdate()
    expect(disk[UPDATE_FORCE_KEY]).toBeUndefined()
  })

  it("turns the page's request into the force flag, from this extension only", async () => {
    c.runtime.onMessage = { addListener: vi.fn() }
    c.runtime.onUpdateAvailable = { addListener: vi.fn() }
    c.tabs.onActivated = { addListener: vi.fn() }
    c.windows.onFocusChanged = { addListener: vi.fn() }
    c.alarms = { ...c.alarms, create: vi.fn(), onAlarm: { addListener: vi.fn() } }
    installUpdateFlow(deps())
    const onMessage = c.runtime.onMessage.addListener.mock.calls[0][0]
    onMessage({ type: APPLY_UPDATE_NOW_MESSAGE }, { id: "someone-else" })
    onMessage({ type: "other" }, { id: chrome.runtime.id })
    await new Promise((r) => setTimeout(r, 0))
    expect(disk[UPDATE_FORCE_KEY]).toBeUndefined()
    onMessage({ type: APPLY_UPDATE_NOW_MESSAGE }, { id: chrome.runtime.id })
    await vi.waitFor(() => expect(disk[UPDATE_FORCE_KEY]).toBe(true))
  })
})
