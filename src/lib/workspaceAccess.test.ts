import { describe, expect, it } from "vitest"
import { SIGN_IN_ROUTE, signInPageUrl } from "./workspaceAccess"

describe("sign-in route", () => {
  it("builds the sign-in page URL on the extension's new tab page", () => {
    expect(signInPageUrl()).toBe(`chrome-extension://test/newtab.html#${SIGN_IN_ROUTE}`)
  })
})
