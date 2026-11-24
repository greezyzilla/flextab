import { describe, expect, it } from "vitest"

import { EXEMPT, badCommits, isConventional, subjectOf } from "./check-commits.mjs"

describe("isConventional (TASK-116)", () => {
  it.each([
    "feat(ui): the Spaces page draws its tabs",
    "fix: keep edits made offline",
    "build(release): one build switch",
    "feat(api)!: drop the v1 sync endpoint",
    "chore(main): release 0.2.0",
    "build(deps): bump the npm group",
    'Revert "feat(ui): something"',
    "Merge branch 'main' into dev",
  ])("accepts %s", (subject) => {
    expect(isConventional(subject)).toBe(true)
  })

  it.each([
    "Fix build pipeline and UI issues",
    "fix+test: lossless deep merge",
    "cleanup: Remove dead code",
    "feat:missing space",
    "feat(): empty scope",
    "feat( ui): scope with a leading space",
    "Feat: capital type",
    "",
  ])("rejects %j", (subject) => {
    expect(isConventional(subject)).toBe(false)
  })
})

describe("subjectOf", () => {
  it("skips git's comment lines and blank lines", () => {
    expect(subjectOf("\n# Please enter the commit message\nfix(sync): keep edits\n\nBody")).toBe("fix(sync): keep edits")
  })
})

describe("badCommits", () => {
  it("reports only non-exempt commits that break the rule", () => {
    const old = [...EXEMPT][0]
    expect(badCommits([
      ["a".repeat(40), "feat: fine"],
      ["b".repeat(40), "Add a thing"],
      [old, "Fix build pipeline and UI issues"],
    ])).toEqual([["b".repeat(40), "Add a thing"]])
  })
})
