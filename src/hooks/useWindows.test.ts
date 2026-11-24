import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useWindows } from "./useWindows"

describe("the window list follows tabs that move", () => {
  it("lists the windows again when a tab moves within its window or into another", async () => {
    const getAll = vi.mocked(chrome.windows.getAll)
    getAll.mockResolvedValue([{ id: 1, tabs: [{ id: 5, url: "https://a.example" }] }] as any)
    const attached = { addListener: vi.fn(), removeListener: vi.fn() }
    ;(chrome.tabs as any).onAttached = attached
    const { result, unmount } = renderHook(() => useWindows({ populate: true }))
    await waitFor(() => expect(result.current.windows).toHaveLength(1))
    const before = getAll.mock.calls.length
    const moved = vi.mocked(chrome.tabs.onMoved.addListener).mock.lastCall![0] as unknown as () => void
    await act(async () => { moved() })
    await act(async () => { attached.addListener.mock.lastCall![0]() })
    expect(getAll.mock.calls.length).toBe(before + 2)
    unmount()
    expect(chrome.tabs.onMoved.removeListener).toHaveBeenCalledWith(moved)
    expect(attached.removeListener).toHaveBeenCalled()
    delete (chrome.tabs as any).onAttached
  })
})
