import { describe, expect, it } from "vitest"
import { flexTabPageText, openTabText } from "./openTabText"

describe("what an Opened Tabs row prints for each tab state", () => {
  it("a titled page, offloaded or not: its title, the address under it", () => {
    expect(openTabText({ title: "Minimal MacBook Mockup", url: "https://mockups-design.com/minimal-macbook/" }))
      .toEqual({ name: "Minimal MacBook Mockup", address: "https://mockups-design.com/minimal-macbook/" })
  })

  it("a page Chrome has no title for (no <title>, not loaded yet): its site, the address under it", () => {
    // Chrome titles it with its own address, host + path without the scheme.
    expect(openTabText({ title: "mockups-design.com/minimal-macbook-mockup/", url: "https://mockups-design.com/minimal-macbook-mockup/" }))
      .toEqual({ name: "mockups-design.com", address: "https://mockups-design.com/minimal-macbook-mockup/" })
    expect(openTabText({ title: "www.doku.com/harga", url: "https://www.doku.com/harga" })).toEqual({ name: "doku.com", address: "https://www.doku.com/harga" })
    expect(openTabText({ title: "", url: "https://slow.example/page" })).toEqual({ name: "slow.example", address: "https://slow.example/page" })
    expect(openTabText({ url: "https://no-title-field.example/a" })).toEqual({ name: "no-title-field.example", address: "https://no-title-field.example/a" })
    expect(openTabText({ title: "café.test/menü", url: "https://xn--caf-dma.test/men%C3%BC" }).address).toBe("https://xn--caf-dma.test/men%C3%BC")
  })

  it("an error page, titled by its host: its site, the address under it", () => {
    expect(openTabText({ title: "doesnotexist.invalid", url: "https://doesnotexist.invalid/x" })).toEqual({ name: "doesnotexist.invalid", address: "https://doesnotexist.invalid/x" })
  })

  it("a tab not committed yet: named from where it is going", () => {
    expect(openTabText({ title: "", url: "", pendingUrl: "https://github.com/x" })).toEqual({ name: "github.com", address: "https://github.com/x" })
    expect(openTabText({ title: "about:blank", url: "about:blank", pendingUrl: "https://slow.test/still-loading" })).toEqual({ name: "slow.test", address: "https://slow.test/still-loading" })
    // A page on its way to another keeps its own name until the new one commits, as in Chrome's tab strip.
    expect(openTabText({ title: "Docs", url: "https://docs.example/", pendingUrl: "https://next.example/" })).toEqual({ name: "Docs", address: "https://docs.example/" })
  })

  it("untitled pages off the web are named for what they are, the address under it", () => {
    expect(openTabText({ title: "data:text/html,<p>hello</p>", url: "data:text/html,<p>hello</p>" })).toEqual({ name: "Data page", address: "data:text/html,<p>hello</p>" })
    expect(openTabText({ title: "Data titled", url: "data:text/html,<title>Data titled</title>" }).name).toBe("Data titled")
    expect(openTabText({ title: "view-source:https://www.kinds.test/page", url: "view-source:https://www.kinds.test/page" })).toEqual({ name: "Source of kinds.test", address: "view-source:https://www.kinds.test/page" })
    expect(openTabText({ title: "view-source:nonsense", url: "view-source:nonsense" }).name).toBe("Page source")
    const ext = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html"
    expect(openTabText({ title: ext, url: ext })).toEqual({ name: "Extension page", address: ext })
    expect(openTabText({ title: "file:///Users/me/My%20notes.txt", url: "file:///Users/me/My%20notes.txt" }).name).toBe("My notes.txt")
    expect(openTabText({ title: "file:///", url: "file:///" }).name).toBe("Local file")
    expect(openTabText({ title: "file:///bad%E0%A4", url: "file:///bad%E0%A4" }).name).toBe("bad%E0%A4")
    expect(openTabText({ title: "readme.txt", url: "file:///tmp/readme.txt" })).toEqual({ name: "readme.txt", address: "file:///tmp/readme.txt" })
  })

  it("browser pages keep their own names; an address of an unknown kind or nothing at all is named plainly", () => {
    expect(openTabText({ title: "About Version", url: "chrome://version" })).toEqual({ name: "About Version", address: "chrome://version" })
    expect(openTabText({ title: "Version", url: "chrome://version" })).toEqual({ name: "Version", address: "chrome://version" })
    expect(openTabText({ title: "about:blank", url: "about:blank" })).toEqual({ name: "Blank page", address: "about:blank" })
    expect(openTabText({ title: "%E0%A4%A", url: "%E0%A4%A" })).toEqual({ name: "%E0%A4%A" })
    expect(openTabText({ title: "javascript:void(0)", url: "javascript:void(0)" })).toEqual({ name: "javascript:void(0)" })
    expect(openTabText({ title: "", url: "" })).toEqual({ name: "New tab" })
    expect(openTabText({ title: "Draft", url: "" })).toEqual({ name: "Draft" })
  })
})

describe("a FlexTab page in Opened Tabs", () => {
  const ext = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
  it("is named for which page it is, FlexTab under it, never its machine address", () => {
    expect(flexTabPageText("chrome://newtab/")).toEqual({ name: "New tab", address: "FlexTab" })
    expect(flexTabPageText(`${ext}/newtab.html#/`).name).toBe("New tab")
    expect(flexTabPageText(`${ext}/newtab.html`).name).toBe("New tab")
    expect(flexTabPageText(`${ext}/newtab.html#/settings/saving`).name).toBe("Settings · Saving & opening")
    expect(flexTabPageText(`${ext}/newtab.html#/settings/sync`).name).toBe("Settings · Sync & backup") // a link from before TASK-84
    expect(flexTabPageText(`${ext}/newtab.html#/settings/spaces/s1`).name).toBe("Settings · Spaces")
    expect(flexTabPageText(`${ext}/newtab.html#/settings`).name).toBe("Settings · Theme") // where Settings opens (TASK-84)
    expect(flexTabPageText(`${ext}/newtab.html#/settings/account`).name).toBe("Settings · Profile") // a link from before TASK-84
    expect(flexTabPageText(`${ext}/newtab.html#/signin`).name).toBe("Sign in")
    expect(flexTabPageText(`${ext}/options.html`).name).toBe("Settings")
    expect(flexTabPageText(`${ext}/popup.html`).name).toBe("Popup")
    expect(flexTabPageText("not a url").name).toBe("FlexTab")
  })
})
