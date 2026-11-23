import { describe, expect, it, vi } from "vitest"

import { latestStableTag, nextBetaTag } from "./channel.mjs"
import { releaseBeta } from "./release-beta.mjs"

describe("latestStableTag", () => {
  it("picks the highest vX.Y.Z by number, ignoring other tags", () => {
    expect(latestStableTag(["v0.9.0", "v0.10.0", "v0.2.1", "beta-v0.11.0.3", "v1.0.0-rc"])).toBe("v0.10.0")
  })

  it("is undefined without a stable tag", () => {
    expect(latestStableTag(["beta-v0.1.0.2"])).toBeUndefined()
  })
})

describe("nextBetaTag", () => {
  it("counts the commits since the last stable tag", () => {
    expect(nextBetaTag({ stableTag: "v0.1.0", commitsSince: 7, betaTags: ["beta-v0.1.0.3"] })).toBe("beta-v0.1.0.7")
  })

  it("fails without a stable tag", () => {
    expect(() => nextBetaTag({ stableTag: undefined, commitsSince: 0, betaTags: [] })).toThrow(/No stable tag/)
  })

  it("fails with no commits since the stable tag", () => {
    expect(() => nextBetaTag({ stableTag: "v0.1.0", commitsSince: 0, betaTags: [] })).toThrow(/No commits since v0.1.0/)
  })

  it("fails when the version would not go up", () => {
    expect(() => nextBetaTag({ stableTag: "v0.1.0", commitsSince: 7, betaTags: ["beta-v0.1.0.7"] })).toThrow(/not above the last beta tag beta-v0.1.0.7/)
    expect(() => nextBetaTag({ stableTag: "v0.1.0", commitsSince: 7, betaTags: ["beta-v0.2.0.1"] })).toThrow(/not above/)
  })
})

/** A fake repository: answers the git calls releaseBeta makes and records every call. */
function fakeGit({ branch = "dev", status = "", stable = ["v0.1.0"], betas = [], commits = "7" } = {}) {
  const calls = []
  const git = vi.fn((args) => {
    calls.push(args)
    const [cmd] = args
    if (cmd === "rev-parse") return branch
    if (cmd === "status") return status
    if (cmd === "tag" && args[1] === "--list") return (args[2] === "v*" ? stable : betas).join("\n")
    if (cmd === "rev-list") return commits
    if (cmd === "tag" && args[1] === "--annotate") return ""
    throw new Error(`unexpected git ${args.join(" ")}`)
  })
  const tagged = () => calls.some((a) => a[0] === "tag" && a[1] === "--annotate")
  return { git, tagged }
}

describe("releaseBeta", () => {
  it("builds first, then creates the tag", () => {
    const { git, tagged } = fakeGit()
    const build = vi.fn(() => {
      expect(tagged()).toBe(false)
      return true
    })
    expect(releaseBeta({ git, build })).toBe("beta-v0.1.0.7")
    expect(build).toHaveBeenCalledWith("beta-v0.1.0.7")
    expect(git).toHaveBeenCalledWith(["tag", "--annotate", "beta-v0.1.0.7", "--message", "FlexTab 0.1.0 Beta 7"])
  })

  it.each([
    ["not on dev", { branch: "main" }, /cut from dev/],
    ["uncommitted changes", { status: " M package.json" }, /uncommitted changes/],
    ["no stable tag", { stable: [] }, /No stable tag/],
    ["no commits since the stable tag", { commits: "0" }, /No commits since/],
    ["a version that does not go up", { betas: ["beta-v0.1.0.9"] }, /not above/],
  ])("aborts with no build and no tag when %s", (_, repo, message) => {
    const { git, tagged } = fakeGit(repo)
    const build = vi.fn(() => true)
    expect(() => releaseBeta({ git, build })).toThrow(message)
    expect(build).not.toHaveBeenCalled()
    expect(tagged()).toBe(false)
  })

  it("aborts with no tag when the build fails", () => {
    const { git, tagged } = fakeGit()
    expect(() => releaseBeta({ git, build: () => false })).toThrow(/build failed, so beta-v0.1.0.7 was not created/)
    expect(tagged()).toBe(false)
  })
})
