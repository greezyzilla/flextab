import { describe, expect, it } from "vitest"

import { REQUIRED_ENV, missingEnv, signArgs, signEnv, sourceArchiveArgs } from "./amo-submit.mjs"

describe("AMO listed submission", () => {
  it("names every missing secret", () => {
    expect(missingEnv({})).toEqual(REQUIRED_ENV)
  })

  it("archives the tag's tracked source, which carries SOURCE_BUILD.md", () => {
    expect(sourceArchiveArgs("v0.2.0", "/tmp/src.zip")).toEqual(["archive", "--format=zip", "--output=/tmp/src.zip", "v0.2.0"])
  })

  it("signs listed with the source attached and does not wait for review", () => {
    const args = signArgs({ sourceDir: "/b/ff", sourceArchive: "/tmp/src.zip", artifactsDir: "/tmp/a" })
    expect(args).toContain("--channel=listed")
    expect(args).toContain("--upload-source-code=/tmp/src.zip")
    expect(args).toContain("--approval-timeout=0")
    expect(args.join(" ")).not.toMatch(/api-key|api-secret/)
  })

  it("passes the keys through web-ext's environment, never the command line", () => {
    expect(signEnv({ AMO_JWT_ISSUER: "issuer", AMO_JWT_SECRET: "secret", PATH: "/bin" })).toMatchObject({ WEB_EXT_API_KEY: "issuer", WEB_EXT_API_SECRET: "secret", PATH: "/bin" })
  })
})
