import { describe, expect, it } from "vitest"
import { inPreviewOrder, useContainerPreview } from "./useContainerPreview"

const list = [{ id: "a" }, { id: "b" }, { id: "c" }]
const ids = (l: { id: string }[]) => l.map((x) => x.id).join("")

describe("container preview order (TASK-92)", () => {
  it("moves the dragged item next to its neighbour, on the side shown", () => {
    expect(ids(inPreviewOrder(list, "project", { kind: "project", id: "a", next: "c", edge: "after" }))).toBe("bca")
    expect(ids(inPreviewOrder(list, "project", { kind: "project", id: "a", next: "c", edge: "before" }))).toBe("bac")
    expect(ids(inPreviewOrder(list, "category", { kind: "category", id: "c", next: "a", edge: "before" }))).toBe("cab")
  })

  it("leaves a list alone without a preview, for the other kind, or when the items are not in it", () => {
    expect(inPreviewOrder(list, "project", null)).toBe(list)
    expect(inPreviewOrder(list, "category", { kind: "project", id: "a", next: "c", edge: "after" })).toBe(list)
    expect(inPreviewOrder(list, "project", { kind: "project", id: "x", next: "c", edge: "after" })).toBe(list)
    expect(inPreviewOrder(list, "project", { kind: "project", id: "a", next: "x", edge: "after" })).toBe(list)
  })

  it("keeps the same preview object for the same spot", () => {
    const store = useContainerPreview.getState()
    store.show({ kind: "project", id: "a", next: "c", edge: "after" })
    const first = useContainerPreview.getState().preview
    store.show({ kind: "project", id: "a", next: "c", edge: "after" })
    expect(useContainerPreview.getState().preview).toBe(first)
    store.show(null)
    expect(useContainerPreview.getState().preview).toBeNull()
  })
})
