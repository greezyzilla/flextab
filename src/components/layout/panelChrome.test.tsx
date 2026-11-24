import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import config from "../../../package.json"
import { AppVersion } from "./panelChrome"

const runtime = chrome.runtime as unknown as { getManifest?: () => chrome.runtime.Manifest }
const original = runtime.getManifest

afterEach(() => {
  runtime.getManifest = original
})

function withManifest(manifest: Partial<chrome.runtime.Manifest>) {
  runtime.getManifest = () => manifest as chrome.runtime.Manifest
}

describe("AppVersion", () => {
  it("shows a beta build's version name", () => {
    withManifest({ version: "0.1.0.7", version_name: "0.1.0 Beta 7" })
    render(<AppVersion />)
    expect(screen.getByText("FlexTab v0.1.0 Beta 7")).toBeInTheDocument()
  })

  it("shows a stable build's version, which has no version name", () => {
    withManifest({ version: "0.2.0" })
    render(<AppVersion />)
    expect(screen.getByText("FlexTab v0.2.0")).toBeInTheDocument()
  })

  it("falls back to package.json outside the extension", () => {
    runtime.getManifest = undefined
    render(<AppVersion />)
    expect(screen.getByText(`FlexTab v${config.version}`)).toBeInTheDocument()
  })
})
