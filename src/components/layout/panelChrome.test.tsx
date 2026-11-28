import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

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
  it("shows the manifest's version name when it has one", () => {
    withManifest({ version: "0.1.0", version_name: "0.1.0 Preview" })
    render(<AppVersion />)
    expect(screen.getByText("FlexTab v0.1.0 Preview")).toBeInTheDocument()
  })

  it("shows a stable build's version, which has no version name", () => {
    withManifest({ version: "0.2.0" })
    render(<AppVersion />)
    expect(screen.getByText("FlexTab v0.2.0")).toBeInTheDocument()
  })

  it("shows 0.0.0 outside the extension, where there is no manifest", () => {
    runtime.getManifest = undefined
    render(<AppVersion />)
    expect(screen.getByText("FlexTab v0.0.0")).toBeInTheDocument()
  })
})
