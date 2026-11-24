import { describe, expect, it } from "vitest"
import { countGroups, countTabs, parseBookmarksHtml, parseImport, parseOneTab, withFreshIds } from "./importFormats"

let n = 0
const ids = () => `id${++n}`

// What Chrome's "Export bookmarks" writes (trimmed).
const CHROME = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://github.com/" ADD_DATE="1" ICON="data:image/png;base64,AAAA">GitHub</A>
        <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
        <DT><H3>Dev</H3>
        <DL><p>
            <DT><H3>React</H3>
            <DL><p>
                <DT><A HREF="https://react.dev/">React</A>
                <DT><A HREF="https://react.dev/learn">Learn React</A>
            </DL><p>
        </DL><p>
    </DL><p>
    <DT><H3>Other bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://news.ycombinator.com/">Hacker News</A>
        <DT><A HREF="chrome://settings">Settings</A>
    </DL><p>
    <DT><A HREF="https://loose.example/"></A>
</DL><p>`

describe("parseBookmarksHtml", () => {
  it("maps top folders to projects and link folders to groups named by path, keeping only web pages", () => {
    const { spaces, skipped, source } = parseBookmarksHtml(CHROME, ids)
    expect(source).toBe("bookmarks")
    expect(skipped).toBe(2) // the bookmarklet and chrome://settings
    const [s] = spaces
    expect(s.name).toBe("Bookmarks")
    expect(s.projects.map((p) => p.name)).toEqual(["Bookmarks bar", "Other bookmarks", "Bookmarks"])
    const groups = s.projects.map((p) => p.categories[0].groups.map((g) => [g.name, g.tabs.map((t) => t.title)]))
    expect(groups).toEqual([
      [["Bookmarks bar", ["GitHub"]], ["Dev › React", ["React", "Learn React"]]],
      [["Other bookmarks", ["Hacker News"]]],
      [["Bookmarks", ["https://loose.example/"]]], // a link outside any folder; no title falls back to the address
    ])
    expect(s.projects[0].categories[0].groups[0].tabs[0].favicon).toBe("") // stored icons are dropped
    expect(countTabs(spaces)).toBe(5)
    expect(countGroups(spaces)).toBe(4)
  })

  it("explains a file with nothing to import", () => {
    expect(() => parseBookmarksHtml("<p>hi</p>")).toThrow("no folders or links")
    expect(() => parseBookmarksHtml("<DL><DT><A HREF=\"javascript:x\">x</A></DL>")).toThrow("None of these bookmarks")
    expect(() => parseBookmarksHtml("<DL><DT><H3>Empty</H3><DL></DL></DL>")).toThrow("has no links")
  })

  it("skips links without an address, names unnamed folders, and ignores folders without a list", () => {
    const html = `<DL><DT><A>no href</A><DT><H3></H3><DL><DT><A HREF="https://a.example/">A</A></DL><DT><H3>Lonely</H3></DL>`
    const { spaces, skipped } = parseBookmarksHtml(html, ids)
    expect(skipped).toBe(1)
    expect(spaces[0].projects.map((p) => p.name)).toEqual(["Folder"])
  })

  it("reads a folder whose list follows it in a DD", () => {
    const html = `<DL><DT><H3>Work</H3><DD><DL><DT><A HREF="https://a.example/">A</A></DL></DL>`
    expect(parseBookmarksHtml(html, ids).spaces[0].projects[0].categories[0].groups[0].tabs[0].url).toBe("https://a.example/")
  })
})

describe("parseOneTab", () => {
  it("turns blank-line blocks into groups and keeps titles with pipes", () => {
    const text = "https://a.example/ | A | with pipe\nhttps://b.example/\n\n\nhttps://c.example/ | C\nnot a url | X\n"
    const { spaces, skipped } = parseOneTab(text, ids)
    const groups = spaces[0].projects[0].categories[0].groups
    expect(spaces[0].name).toBe("OneTab")
    expect(groups.map((g) => g.name)).toEqual(["OneTab 1", "OneTab 2"])
    expect(groups[0].tabs.map((t) => [t.url, t.title])).toEqual([["https://a.example/", "A | with pipe"], ["https://b.example/", "https://b.example/"]])
    expect(skipped).toBe(1)
    expect(parseOneTab("https://a.example/ | A", ids).spaces[0].projects[0].categories[0].groups[0].name).toBe("OneTab")
  })

  it("explains a file that is not a OneTab export", () => {
    expect(() => parseOneTab("hello\nworld")).toThrow("OneTab")
  })
})

describe("parseImport", () => {
  it("recognises each format from the content", () => {
    expect(parseImport(CHROME).source).toBe("bookmarks")
    expect(parseImport("https://a.example/ | A").source).toBe("onetab")
    expect(parseImport(JSON.stringify([{ id: "s", name: "S", projects: [] }])).source).toBe("flextab")
    expect(() => parseImport("{ broken")).toThrow("can't be read")
  })

  it("gives a backup fresh ids for adding beside the workspace it came from", () => {
    const backup = [{ id: "s", name: "S", projects: [{ id: "p", name: "P", categories: [{ id: "c", name: "C", groups: [{ id: "g", name: "G", tabs: [{ id: "t", url: "https://x/", title: "x", favicon: "" }] }] }] }] }]
    const fresh = withFreshIds(backup, ids)
    const all = JSON.stringify(fresh)
    for (const old of ["\"s\"", "\"p\"", "\"c\"", "\"g\"", "\"t\""]) expect(all).not.toContain(`"id":${old}`)
    expect(fresh[0].projects[0].categories[0].groups[0].tabs[0].url).toBe("https://x/")
  })
})
