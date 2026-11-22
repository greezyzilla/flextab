// TASK-103.5: cn() knows the type tokens in tailwind.config.js fontSize, so it merges them as sizes.
import { describe, expect, it } from "vitest"
import { cn } from "./utils"

const TOKENS = ["count", "caption", "item", "popup-meta", "popup", "popup-title"]

describe("cn with the type tokens", () => {
  it("keeps a text colour beside a type token", () => {
    for (const t of TOKENS) expect(cn("text-fg-muted", `text-${t}`)).toBe(`text-fg-muted text-${t}`)
  })
  it("lets a later size replace a type token, and a token replace a size", () => {
    expect(cn("text-caption", "text-sm")).toBe("text-sm")
    expect(cn("text-sm", "text-popup")).toBe("text-popup")
    expect(cn("text-item", "text-caption")).toBe("text-caption")
  })
  it("lists every fontSize token in tailwind.config.js", async () => {
    const config = (await import("../../tailwind.config.js")).default as { theme: { extend: { fontSize: Record<string, unknown> } } }
    expect(Object.keys(config.theme.extend.fontSize).sort()).toEqual([...TOKENS].sort())
  })
})
