import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { DestinationPicker, type PickerValue } from "./DestinationPicker"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { RECENT_DESTINATIONS_KEY } from "~src/lib/recentDestinations"
import type { SavedSpace } from "~src/types"

const tree = (): SavedSpace[] => [
  { id: "sw", name: "Work", order: 0, projects: [
    { id: "pw", name: "Watch", order: 0, categories: [
      { id: "ca", name: "Anime", order: 0, groups: [
        { id: "u", name: "Unsorted", order: 0, config: { kind: "unsorted" }, tabs: [] },
        { id: "g1", name: "Summer 2026", order: 1, tabs: [] },
        { id: "g2", name: "Finished", order: 2, color: "green", tabs: [] },
      ] },
    ] },
    { id: "pf", name: "Frontend", order: 1, categories: [
      { id: "cr", name: "Research", order: 0, groups: [{ id: "g3", name: "React 19", order: 0, tabs: [] }] },
    ] },
  ] },
  { id: "sp", name: "Personal", order: 1, projects: [
    { id: "pr", name: "Reading", order: 0, categories: [{ id: "cl", name: "Later", order: 0, groups: [] }] },
  ] },
]

let recent: unknown[] = []
beforeEach(() => {
  recent = []
  vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => (key === RECENT_DESTINATIONS_KEY ? { [key]: recent } : {}))
  useSavedSpacesStore.setState({ savedSpaces: tree(), activeSpaceId: "sw" })
})

function Panel({ start, groupLevel = true }: { start: PickerValue; groupLevel?: boolean }) {
  const [value, setValue] = useState<PickerValue>(start)
  return <DestinationPicker size="panel" groupLevel={groupLevel} value={value} onChange={setValue} />
}
const expanded = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-expanded")

describe("DestinationPicker panel size (TASK-72)", () => {
  it("opens only the current destination's branch; a header folds or opens its own", () => {
    render(<Panel start={{ spaceId: "sw", projectId: "pw", categoryId: "ca", groupId: "g1" }} />)
    expect([expanded("Work"), expanded("Watch"), expanded("Anime"), expanded("Frontend"), expanded("Personal")])
      .toEqual(["true", "true", "true", "false", "false"])
    expect(screen.getByRole("radio", { name: "Summer 2026" })).toBeChecked()
    expect(screen.queryByRole("button", { name: "Research" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Frontend" }))
    fireEvent.click(screen.getByRole("button", { name: "Research" }))
    fireEvent.click(screen.getByRole("radio", { name: "React 19" }))
    expect(screen.getByRole("radio", { name: "React 19" })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Watch" }))
    expect(screen.queryByRole("radio", { name: "Summer 2026" })).not.toBeInTheDocument()
  })

  it("draws one guide per open branch, heavier the higher the level", () => {
    const { container } = render(<Panel start={{ spaceId: "sw", projectId: "pw", categoryId: "ca" }} />)
    const guides = [...container.querySelectorAll<HTMLElement>("[data-guide]")]
    expect(guides.map((g) => [g.dataset.guide, g.style.background])).toEqual([
      ["0", "hsl(var(--ink) / 0.38)"], ["1", "hsl(var(--ink) / 0.24)"], ["2", "hsl(var(--ink) / 0.14)"],
    ])
    fireEvent.click(screen.getByRole("button", { name: "Anime" }))
    expect(container.querySelectorAll("[data-guide]")).toHaveLength(2)
  })

  it("search opens every matching branch", () => {
    render(<Panel start={{ spaceId: "sw", projectId: "pw", categoryId: "ca" }} />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a destination" }), { target: { value: "react" } })
    expect(screen.getByRole("radio", { name: "React 19" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^New / })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a destination" }), { target: { value: "zzz" } })
    expect(screen.getByText("No match.")).toBeInTheDocument()
  })

  it("names a new group, category or project inline at panel size", () => {
    render(<Panel start={{ spaceId: "sw", projectId: "pw", categoryId: "ca" }} />)
    fireEvent.click(screen.getByRole("button", { name: "New group in Anime" }))
    const name = screen.getByRole("textbox", { name: "New group name" })
    fireEvent.change(name, { target: { value: "Fall 2026" } })
    fireEvent.keyDown(name, { key: "Enter" })
    expect(screen.getByRole("radio", { name: "New group: Fall 2026" })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "New category in Watch" }))
    fireEvent.keyDown(screen.getByRole("textbox", { name: "New category name" }), { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: "New project in Work" }))
    fireEvent.keyDown(screen.getByRole("textbox", { name: "New project name" }), { key: "Escape" })
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("at category level, categories are the choices", () => {
    render(<Panel groupLevel={false} start={{ spaceId: "sw", projectId: "pw", categoryId: "ca" }} />)
    expect(screen.getByRole("radio", { name: "Anime" })).toBeChecked()
    expect(screen.queryByRole("button", { name: "Anime" })).not.toBeInTheDocument()
  })

  it("a recent chip picks its place and opens its branch", async () => {
    recent = [{ spaceId: "sp", projectId: "pr", categoryId: "cl" }, { spaceId: "sw", projectId: "pw", categoryId: "ca", groupId: "g2" }]
    render(<Panel start={{ spaceId: "sw", projectId: "pw", categoryId: "ca", groupId: "g2" }} />)
    const chips = await screen.findByText("Recent")
    const box = chips.parentElement as HTMLElement
    expect(within(box).getAllByRole("button").map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"])
    fireEvent.click(within(box).getByRole("button", { name: /Later/ }))
    expect(expanded("Personal")).toBe("true")
    // Anime's branch stays open; the checked Unsorted is Later's.
    expect(screen.getAllByRole("radio", { name: "Unsorted" }).map((r) => (r as HTMLInputElement).checked)).toEqual([false, true])
  })
})
