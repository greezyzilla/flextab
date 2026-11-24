import { describe, expect, it } from "vitest"

import { DEV_NAME, OPT_IN, devEnvFiles, devEnvProblems, devGate, resolveDevEnv } from "./dev.mjs"

const DEVELOPMENT = `PLASMO_PUBLIC_API_URL=http://localhost:3000
PLASMO_PUBLIC_API_HOST=http://localhost/*
FLEXTAB_EXT_NAME="FlexTab Dev"
`
const PRODUCTION = `PLASMO_PUBLIC_API_URL=https://api.flextabmanager.com
PLASMO_PUBLIC_API_HOST=https://api.flextabmanager.com/*
`
const files = (names) => names.map(([name, contents]) => ({ name, contents }))

describe("devEnvFiles", () => {
  it("lists the files plasmo dev reads, in Plasmo's order", () => {
    expect(devEnvFiles([], {})).toEqual([
      ".env.chrome.local", ".env.dev.local", ".env.development.local", ".env.local",
      ".env.chrome", ".env.dev", ".env.development", ".env",
    ])
  })

  it("never reads .env.production, even when the shell says NODE_ENV=production (plasmo dev forces development)", () => {
    expect(devEnvFiles([], { NODE_ENV: "production" })).not.toContain(".env.production")
    expect(devEnvFiles([], { NODE_ENV: "production" })).toEqual(devEnvFiles([], {}))
  })

  it("follows --target, --tag, PLASMO_TAG and --env like Plasmo", () => {
    expect(devEnvFiles(["--target=firefox-mv3"], {})[0]).toBe(".env.firefox.local")
    expect(devEnvFiles([], { PLASMO_TAG: "prod" })).toContain(".env.prod")
    expect(devEnvFiles(["--tag=staging"], { PLASMO_TAG: "prod" })).toContain(".env.staging")
    expect(devEnvFiles(["--env=.env.mine"], {})[0]).toBe(".env.mine")
  })
})

describe("resolveDevEnv", () => {
  it("lets the shell win, then the first file that sets a key", () => {
    const r = resolveDevEnv({ PLASMO_PUBLIC_API_URL: "https://shell.example" }, files([
      [".env.local", "PLASMO_PUBLIC_API_HOST=https://local.example/*\n"],
      [".env.development", DEVELOPMENT],
    ]))
    expect(r.PLASMO_PUBLIC_API_URL).toEqual({ value: "https://shell.example", from: "the shell" })
    expect(r.PLASMO_PUBLIC_API_HOST).toEqual({ value: "https://local.example/*", from: ".env.local" })
    expect(r.FLEXTAB_EXT_NAME).toEqual({ value: DEV_NAME, from: ".env.development" })
  })
})

describe("devGate", () => {
  it("starts a clean setup, blocks a problem, and lets the explicit opt-in through with a warning", () => {
    expect(devGate([], {})).toBe("ok")
    expect(devGate(["x"], {})).toBe("block")
    expect(devGate(["x"], { [OPT_IN]: "1" })).toBe("warn")
    expect(devGate(["x"], { [OPT_IN]: "true" })).toBe("block")
  })
})

describe("devEnvProblems", () => {
  it("passes a normal setup: .env.development against localhost with the dev name", () => {
    expect(devEnvProblems(resolveDevEnv({ NODE_ENV: "production" }, files([[".env.development", DEVELOPMENT]])))).toEqual([])
  })

  it("names the shell when an exported API URL points elsewhere", () => {
    const problems = devEnvProblems(resolveDevEnv({ PLASMO_PUBLIC_API_URL: "https://api.flextabmanager.com" }, files([[".env.development", DEVELOPMENT]])))
    expect(problems).toEqual(["PLASMO_PUBLIC_API_URL=https://api.flextabmanager.com (from the shell) is not a localhost address."])
  })

  it("names the file when a more specific env file points at production", () => {
    const problems = devEnvProblems(resolveDevEnv({}, files([[".env.local", PRODUCTION], [".env.development", DEVELOPMENT]])))
    expect(problems).toEqual([
      "PLASMO_PUBLIC_API_URL=https://api.flextabmanager.com (from .env.local) is not a localhost address.",
      "PLASMO_PUBLIC_API_HOST=https://api.flextabmanager.com/* (from .env.local) is not a localhost address.",
    ])
  })

  it("flags missing values and a build that would not be named FlexTab Dev", () => {
    expect(devEnvProblems({})).toEqual([
      "PLASMO_PUBLIC_API_URL is not set by the shell or any dev env file.",
      "PLASMO_PUBLIC_API_HOST is not set by the shell or any dev env file.",
      'FLEXTAB_EXT_NAME is not set, not "FlexTab Dev".',
    ])
    const named = resolveDevEnv({ FLEXTAB_EXT_NAME: "FlexTab" }, files([[".env.development", DEVELOPMENT]]))
    expect(devEnvProblems(named)).toEqual(['FLEXTAB_EXT_NAME is "FlexTab" (from the shell), not "FlexTab Dev".'])
  })

  it("accepts 127.0.0.1 and [::1] as local", () => {
    const r = resolveDevEnv({ PLASMO_PUBLIC_API_URL: "http://127.0.0.1:3000", PLASMO_PUBLIC_API_HOST: "http://[::1]/*" }, files([[".env.development", DEVELOPMENT]]))
    expect(devEnvProblems(r)).toEqual([])
  })
})
