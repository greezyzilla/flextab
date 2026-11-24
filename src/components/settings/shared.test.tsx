import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Cloud } from "lucide-react"
import { SettingRow, SettingsSection } from "./shared"

describe("SettingRow in a card", () => {
  it("a message in the control column adds no width to it, so the label keeps its column", () => {
    render(
      <SettingsSection title="Export and import" icon={Cloud} subtitle="Move your tabs.">
        <SettingRow label="Import" description="Add tabs from a backup or another app.">
          <button>Import…</button>
          <div role="status">Invalid backup: spaces[0].projects[0].categories[0].groups[1].tabs[0].id must be a non-empty, unique ID.</div>
        </SettingRow>
      </SettingsSection>,
    )
    const column = screen.getByRole("button", { name: "Import…" }).parentElement!
    expect(column.className).toContain("[&>[role=status]]:[contain:inline-size]")
    expect(column.className).toContain("[&>[role=alert]]:[contain:inline-size]")
    expect(screen.getByRole("status").parentElement).toBe(column)
  })
})
