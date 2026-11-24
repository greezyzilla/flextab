import { describe, expect, it } from "vitest"
import { describeChange, stripSiteSuffix } from "./describeChange"

const t = (title: string, url = "https://a.test/x") => ({ title, url })

describe("describeChange (TASK-72)", () => {
  it("names the show and the episode change, dropping shared site boilerplate", () => {
    expect(describeChange(
      t("Kusuriya no Hitorigoto Season 2 (Episode 01) Subtitle Indonesia - AnimeStream"),
      t("Kusuriya no Hitorigoto Season 2 (Episode 02) Subtitle Indonesia - AnimeStream"),
    )).toEqual({ name: "Kusuriya no Hitorigoto Season 2", from: "Episode 01", to: "Episode 02" })
  })

  it("handles 'Chapter 12' style labels and a trailing separator in the name", () => {
    expect(describeChange(t("Dune - Chapter 12 | Reader"), t("Dune - Chapter 13 | Reader")))
      .toEqual({ name: "Dune", from: "Chapter 12", to: "Chapter 13" })
  })

  it("keeps changed words as they are when they are not bare numbers", () => {
    expect(describeChange(t("Course: Lesson Intro - Site"), t("Course: Lesson Advanced - Site")))
      .toEqual({ name: "Course: Lesson", from: "Intro", to: "Advanced" })
  })

  it("compares the end of the address when the title did not change", () => {
    expect(describeChange(
      { title: "Show Player", url: "https://s.test/anime/2650/kusuriya/episode/1" },
      { title: "Show Player", url: "https://s.test/anime/2650/kusuriya/episode/2" },
    )).toEqual({ name: "Show Player", from: "…/episode/1", to: "…/episode/2" })
  })

  it("gives both titles when they share no start", () => {
    expect(describeChange(t("Old page title - Site"), t("Completely new - Site")))
      .toEqual({ name: null, from: "Old page title - Site", to: "Completely new - Site" })
  })

  it("falls back to the old title when the new page has none", () => {
    expect(describeChange({ title: "Same", url: "https://s.test/a" }, { url: "https://s.test/b" }).to).toBe("/b")
  })

  it("copes with addresses that do not parse and with a title that is all separators", () => {
    expect(describeChange({ title: "Same", url: "not a url" }, { title: "Same", url: "also not" })).toEqual({ name: "Same", from: "/", to: "/" })
    expect(describeChange({ title: "Same", url: "https://s.test/a" }, { title: "Same" })).toEqual({ name: "Same", from: "/a", to: "/" })
    expect(describeChange({ title: "—", url: "https://s.test/a" }, { title: "—", url: "https://s.test/b" }).name).toBeNull()
  })
})

describe("stripSiteSuffix", () => {
  it("drops the words a site puts on every page, keeping the episode", () => {
    expect(stripSiteSuffix("Mikata ga Yowasugite (Episode 03) Subtitle Indonesia - AnimeStream", [
      "Ore dake Level Up (Episode 01) Subtitle Indonesia - AnimeStream",
      "Mikata ga Yowasugite (Episode 03) Subtitle Indonesia - AnimeStream",
    ])).toBe("Mikata ga Yowasugite (Episode 03)")
  })
  it("drops a separator plus site name; keeps the title when one word is shared, nothing is shared, or the shared end has a number", () => {
    expect(stripSiteSuffix("Docs - GitHub", ["Issues - GitHub"])).toBe("Docs")
    expect(stripSiteSuffix("Docs GitHub", ["Issues GitHub"])).toBe("Docs GitHub")
    expect(stripSiteSuffix("Alpha beta", ["Gamma delta"])).toBe("Alpha beta")
    expect(stripSiteSuffix("Show Episode 3 of 12", ["Other Episode 9 of 12"])).toBe("Show Episode 3 of 12")
    expect(stripSiteSuffix("Same words here", [])).toBe("Same words here")
  })
})
