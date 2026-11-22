import { beforeEach, describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { DndContext } from "@dnd-kit/core"
import { DragOverlayContent } from "./DragOverlayContent"
import { useSettingsStore } from "~src/store/useSettingsStore"
import type { SavedTab } from "~src/types"

const card = (props: Partial<Parameters<typeof DragOverlayContent>[0]>) =>
  render(<DndContext><DragOverlayContent activeId="x" draggedGroup={null} draggedTab={null} draggedSavedTab={null} draggedContainer={null} {...props} /></DndContext>).container

// TASK-95: a dragged tab's card prints the page as its row does, never the raw address.
describe("the drag card of a tab", () => {
  beforeEach(() => useSettingsStore.setState({ titleCut: 100, linkCut: 0, linkCutScope: "all" }))

  it("an open tab: the row's name and its address without the scheme", () => {
    const el = card({ draggedTab: { id: 1, title: "Issues · vercel/next.js", url: "https://github.com/vercel/next.js/issues" } as chrome.tabs.Tab })
    expect(el.textContent).toContain("Issues · vercel/next.js")
    expect(el.textContent).toContain("github.com/vercel/next.js/issues")
    expect(el.textContent).not.toContain("https://")
  })

  it("an open tab with no title of its own is named as its row names it", () => {
    const el = card({ draggedTab: { id: 2, title: "about:blank", url: "about:blank" } as chrome.tabs.Tab })
    expect(el.textContent).toContain("Blank page")
  })

  it("a saved tab: its title and its address without the scheme", () => {
    const tab: SavedTab = { id: "t", title: "Lo-fi beats", url: "https://music.example.test/lofi", favicon: "", order: 0 }
    const el = card({ draggedSavedTab: tab })
    expect(el.textContent).toContain("Lo-fi beats")
    expect(el.textContent).toContain("music.example.test/lofi")
    expect(el.textContent).not.toContain("https://")
  })
})
