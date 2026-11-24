import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { SearchBar } from "./SearchBar"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import { useSettingsStore } from "~src/store/useSettingsStore"
import type { SavedSpace } from "~src/types"

const { openOrFocus } = vi.hoisted(() => ({ openOrFocus: vi.fn(async () => "opened") }))
vi.mock("~src/services/openTab", () => ({ openOrFocus }))

const tabs = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, title: `Docs ${prefix} ${i}`, url: `https://${prefix}.example/${i}`, favicon: "" }))
const spaces: SavedSpace[] = [{ id: "s1", name: "Work", projects: [
  { id: "p1", name: "General", categories: [{ id: "c1", name: "Uncategorized", groups: [{ id: "g1", name: "Docs inbox", tabs: tabs(8, "a") }] }] },
] }]

beforeEach(() => {
  vi.clearAllMocks()
  window.location.hash = "#/"
  useSavedSpacesStore.setState({ savedSpaces: spaces, activeSpaceId: "s1", activeProjectId: "p1", activeCategoryId: "c1", expandedProjectIds: [] })
  vi.mocked(chrome.tabs.query).mockResolvedValue([
    { id: 7, windowId: 1, title: "Docs on MDN", url: "https://developer.mozilla.org/", favIconUrl: "" },
    { id: 8, windowId: 1, title: "Docs a 0", url: "https://a.example/0" },
  ] as chrome.tabs.Tab[])
})

async function type(text: string) {
  cleanup() // one palette at a time
  render(<SearchBar />)
  const input = screen.getByRole("combobox", { name: "Search tabs, groups and spaces" })
  fireEvent.focus(input)
  await screen.findByRole("combobox") // let the open-tabs query settle
  await new Promise((r) => setTimeout(r, 0))
  fireEvent.change(input, { target: { value: text } })
  return input
}

describe("SearchBar command palette", () => {
  it("groups open tabs, saved tabs and places, and never cuts results silently", async () => {
    const input = await type("docs")
    expect(input).toHaveAttribute("aria-expanded", "true")
    const list = screen.getByRole("listbox", { name: "Search results" })
    expect(within(list).getByRole("group", { name: /Open tabs/ })).toHaveTextContent("Docs on MDN")
    const saved = within(list).getByRole("group", { name: /Saved tabs/ })
    expect(within(saved).getAllByRole("option")).toHaveLength(6) // 5 + "Show 3 more"
    expect(saved).toHaveTextContent("Open") // a.example/0 is open: one row, marked
    expect(within(list).getByRole("group", { name: /Places/ })).toHaveTextContent("Docs inbox")
    // The first row is active, and the input points at it.
    expect(input.getAttribute("aria-activedescendant")).toBe(within(list).getAllByRole("option")[0].id)
    fireEvent.click(within(saved).getByRole("option", { name: /Show 3 more saved tabs/ }))
    expect(within(saved).getAllByRole("option")).toHaveLength(8)
  })

  it("Enter goes to the page; arrows move; Shift+Enter shows a saved tab in FlexTab", async () => {
    const input = await type("docs a 3")
    fireEvent.keyDown(input, { key: "Enter" })
    // The opened tab remembers which saved tab it came from.
    expect(openOrFocus).toHaveBeenCalledWith("https://a.example/3", expect.objectContaining({ tabId: expect.any(String), groupId: expect.any(String) }))
    const again = await type("docs a 3")
    expect(screen.getAllByText(/show in FlexTab/).length).toBeGreaterThan(0) // the hint names both keys
    fireEvent.keyDown(again, { key: "Enter", shiftKey: true })
    expect(useUIStore.getState().flashTarget).toMatchObject({ kind: "tab", id: "a3" })
    expect(useSavedSpacesStore.getState().expandedProjectIds).toContain("p1")
  })

  it("switches to an open tab, and goes to a place", async () => {
    const input = await type("mdn")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true })
    expect(chrome.windows.update).toHaveBeenCalledWith(1, { focused: true })
    const place = await type("inbox")
    fireEvent.keyDown(place, { key: "ArrowDown" })
    fireEvent.keyDown(place, { key: "ArrowUp" })
    fireEvent.keyDown(place, { key: "Enter" })
    expect(useUIStore.getState().flashTarget).toMatchObject({ kind: "group", id: "g1" })
  })

  it("lets only a moving pointer change the active row", async () => {
    const input = await type("docs")
    const options = screen.getAllByRole("option")
    fireEvent.mouseEnter(options[3])
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id)
    fireEvent.mouseMove(options[3])
    expect(input.getAttribute("aria-activedescendant")).toBe(options[3].id)
  })

  it("says when nothing matches", async () => {
    await type("zzz")
    expect(screen.getByText("No results for “zzz”")).toBeInTheDocument()
  })

  it("switches the theme from an Actions section", async () => {
    useSettingsStore.setState({ theme: "system" })
    const input = await type("dark")
    const actions = within(screen.getByRole("listbox", { name: "Search results" })).getByRole("group", { name: /Actions/ })
    expect(within(actions).getByRole("option", { name: /Use dark theme/ })).toBeInTheDocument()
    expect(screen.getByText("apply")).toBeInTheDocument()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(useSettingsStore.getState().theme).toBe("dark")
    await type("theme")
    expect(within(screen.getByRole("group", { name: /Actions/ })).getByRole("option", { name: /Use dark theme.*Current/ })).toBeInTheDocument()
  })
})
