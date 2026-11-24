import { describe, expect, it } from "vitest"

import { unpinned } from "./check-actions-pinned.mjs"

const SHA = "11d5960a326750d5838078e36cf38b85af677262"

describe("unpinned", () => {
  it("passes SHA-pinned and local actions", () => {
    expect(unpinned(`steps:\n  - uses: actions/checkout@${SHA} # v4\njobs:\n  verify:\n    uses: ./.github/workflows/verify.yml\n`)).toEqual([])
  })

  it("flags a tag, a branch, a short SHA and a quoted tag, with their lines", () => {
    const text = [
      "steps:",
      "  - uses: actions/checkout@v4",
      "  - uses: owner/action@main",
      `  - uses: owner/action@${SHA.slice(0, 7)}`,
      '      uses: "owner/action@v1" # quoted',
    ].join("\n")
    expect(unpinned(text)).toEqual([
      { line: 2, ref: "actions/checkout@v4" },
      { line: 3, ref: "owner/action@main" },
      { line: 4, ref: `owner/action@${SHA.slice(0, 7)}` },
      { line: 5, ref: "owner/action@v1" },
    ])
  })
})
