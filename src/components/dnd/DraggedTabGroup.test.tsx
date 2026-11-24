import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { DraggedTabGroup } from "./DraggedTabGroup"
import type { SavedGroup } from "~src/types"

const group: SavedGroup = { id: "g1", name: "Radio", order: 0, tabs: [] }

// A dragged group is a copy of its own card, never a re-laid-out summary.
describe("DraggedTabGroup", () => {
  it("copies the group's card as rendered, inert, on the page colour, in the card's own place", () => {
    render(
      <div style={{ paddingTop: "12px", paddingInline: "20px" }}>
        <div data-group-card="g1" id="card-g1" className="rounded-card border ring-2 ring-[var(--accent)]">
          <span>Radio</span><span>2 tabs</span><a href="https://a.example">Station one</a>
        </div>
      </div>,
    )
    const { container } = render(<div><DraggedTabGroup group={group} /></div>)
    const holder = container.querySelector('[data-dragged-group="g1"]')!
    const copy = holder.firstElementChild as HTMLElement
    expect(copy.textContent).toBe("Radio2 tabsStation one")
    expect(copy.hasAttribute("data-group-card")).toBe(false) // never found again as the real card
    expect(copy.id).toBe("")
    expect(copy.className).not.toContain("ring-2") // a search flash is not part of it
    expect(holder.className).toContain("bg-black-900")
    expect(holder.parentElement!.hasAttribute("inert")).toBe(true)
    expect(holder.parentElement!.getAttribute("aria-hidden")).toBe("true")
    expect(holder.parentElement!.style.paddingTop).toBe("12px")
    expect(holder.parentElement!.style.paddingInline).toBe("20px")
    // The real card is untouched.
    expect(screen.getAllByText("Station one")).toHaveLength(2)
    expect(document.getElementById("card-g1")!.className).toContain("ring-2")
  })

  it("draws nothing when the card is not on the page", () => {
    const { container } = render(<DraggedTabGroup group={{ ...group, id: "gone" }} />)
    expect(container.querySelector('[data-dragged-group="gone"]')!.childElementCount).toBe(0)
  })
})
