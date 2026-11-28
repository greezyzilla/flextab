import { describe, expect, it } from "vitest"

import { AMO_LICENSE, REQUIRED_ENV, amoMetadata, missingEnv, signArgs, signEnv, sourceArchiveArgs } from "./amo-submit.mjs"

describe("AMO listed submission", () => {
  it("names every missing secret", () => {
    expect(missingEnv({})).toEqual(REQUIRED_ENV)
  })

  it("archives the tag's tracked source, which carries SOURCE_BUILD.md", () => {
    expect(sourceArchiveArgs("v0.2.0", "/tmp/src.zip")).toEqual(["archive", "--format=zip", "--output=/tmp/src.zip", "v0.2.0"])
  })

  it("signs listed with the source and the license attached and does not wait for review", () => {
    const args = signArgs({ sourceDir: "/b/ff", sourceArchive: "/tmp/src.zip", artifactsDir: "/tmp/a", metadataFile: "/tmp/meta.json" })
    expect(args).toContain("--channel=listed")
    expect(args).toContain("--upload-source-code=/tmp/src.zip")
    expect(args).toContain("--amo-metadata=/tmp/meta.json")
    expect(args).toContain("--approval-timeout=0")
    expect(args.join(" ")).not.toMatch(/api-key|api-secret/)
  })

  it("sends the license AMO requires for a listed version: All Rights Reserved", () => {
    expect(AMO_LICENSE).toBe("all-rights-reserved")
    expect(amoMetadata()).toEqual({ version: { license: "all-rights-reserved" } })
  })

  it("passes the keys through web-ext's environment, never the command line", () => {
    expect(signEnv({ AMO_JWT_ISSUER: "issuer", AMO_JWT_SECRET: "secret", PATH: "/bin" })).toMatchObject({ WEB_EXT_API_KEY: "issuer", WEB_EXT_API_SECRET: "secret", PATH: "/bin" })
  })
})
