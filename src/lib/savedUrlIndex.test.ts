import { describe, expect, it } from "vitest"
import type { SavedSpace } from "~src/types"
import { buildSavedUrlIndex, describeAlsoSaved, describeSaved, normalizeUrl, savedElsewhere } from "./savedUrlIndex"

const spaces: SavedSpace[] = [{
  id: "s", name: "Work", order: 0, projects: [{ id: "p", name: "Site", order: 0, categories: [{
    id: "c", name: "Research", order: 0, groups: [
      { id: "g1", name: "Sprint", order: 0, tabs: [
        { id: "t1", url: "https://Example.com/a/", title: "A", favicon: "", order: 0 },
        { id: "t2", url: "https://example.com/a", title: "A again", favicon: "", order: 1 },
      ] },
      { id: "g2", name: "Reading", order: 1, tabs: [{ id: "t3", url: "https://example.com/a", title: "A", favicon: "", order: 0 }] },
    ],
  }] }],
}]

describe("savedUrlIndex", () => {
  it("normalizes host case and a trailing slash, but keeps query and hash", () => {
    expect(normalizeUrl("https://Example.com/a/")).toBe("https://example.com/a")
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com")
    expect(normalizeUrl("https://mail.example.com/#inbox")).toBe("https://mail.example.com#inbox")
    expect(normalizeUrl("https://example.com/a?x=1")).toBe("https://example.com/a?x=1")
    expect(normalizeUrl("not a url/")).toBe("not a url")
    expect(normalizeUrl(undefined)).toBe("")
  })

  it("indexes every group a URL is saved in, once per group", () => {
    const locs = buildSavedUrlIndex(spaces).get("https://example.com/a")!
    expect(locs.map((l) => l.groupId)).toEqual(["g1", "g2"])
    expect(locs[0].path).toBe("Work › Site › Research › Sprint")
  })

  it("finds other places a URL is saved and describes them", () => {
    expect(savedElsewhere(spaces, ["https://example.com/a/"], "g1").map((l) => l.groupId)).toEqual(["g2"])
    expect(savedElsewhere(spaces, ["https://other.com"])).toEqual([])
    expect(describeSaved(undefined)).toBeNull()
    expect(describeSaved(buildSavedUrlIndex(spaces).get("https://example.com/a"))).toBe("Saved in 2 places")
    expect(describeSaved([{ spaceId: "s", projectId: "p", categoryId: "c", groupId: "g1", path: "W › S" }])).toBe("Saved in W › S")
    expect(describeAlsoSaved([])).toBeNull()
    expect(describeAlsoSaved(["A"])).toBe("Also saved in A")
    expect(describeAlsoSaved(["A", "B", "C"])).toBe("Also saved in A and 2 more")
  })
})
