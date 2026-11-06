import { describe, expect, it } from "vitest"
import { canUseWorkspace, SIGN_IN_ROUTE, signInPageUrl } from "./workspaceAccess"
import type { SavedSpace } from "~src/types"

const space = (tabs: number): SavedSpace => ({
  id: "s", name: "S", order: 0,
  projects: [{ id: "p", name: "P", order: 0, categories: [{ id: "c", name: "C", order: 0,
    groups: [{ id: "g", name: "G", order: 0, tabs: Array.from({ length: tabs }, (_, i) => ({ id: `t${i}`, url: "https://a.com", title: "A", favicon: "", order: i })) }] }] }],
})

describe("canUseWorkspace", () => {
  it("allows signed-in users, guests and devices that still hold tabs", () => {
    expect(canUseWorkspace({ isAuthenticated: true, guestMode: false, spaces: [] })).toBe(true)
    expect(canUseWorkspace({ isAuthenticated: false, guestMode: true, spaces: [] })).toBe(true)
    expect(canUseWorkspace({ isAuthenticated: false, guestMode: false, spaces: [space(1)] })).toBe(true)
  })

  it("sends a fresh signed-out install (only the empty seed space) to first run", () => {
    expect(canUseWorkspace({ isAuthenticated: false, guestMode: false, spaces: [space(0)] })).toBe(false)
  })

  it("builds the sign-in page URL on the extension's new tab page", () => {
    expect(signInPageUrl()).toBe(`chrome-extension://test/newtab.html#${SIGN_IN_ROUTE}`)
  })
})
