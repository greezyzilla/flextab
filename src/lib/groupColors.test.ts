import { describe, it, expect } from "vitest";
import { GROUP_COLORS, groupColorFill, groupTintEdge, groupTintSurface, isGroupColor } from "./groupColors";

describe("group colours (TASK-18)", () => {
  it("are Chrome's nine tab-group colours, in Chrome's order", () => {
    expect(GROUP_COLORS.map((c) => c.id)).toEqual(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]);
  });

  it("accepts only those ids", () => {
    expect(isGroupColor("pink")).toBe(true);
    expect(isGroupColor("magenta")).toBe(false);
    expect(isGroupColor("")).toBe(false);
    expect(isGroupColor(undefined)).toBe(false);
    expect(isGroupColor(3)).toBe(false);
  });

  it("maps a colour to its swatch token", () => {
    expect(groupColorFill("blue")).toBe("var(--group-blue)");
  });

  it("tints at the surface's lightness with the colour's hue, scaled by --group-tint", () => {
    const s = groupTintSurface("pink");
    expect(s).toBe("oklch(from var(--color-black-900) l calc(var(--group-tint) * 0.0006 * var(--group-pink-k, 1)) var(--group-pink-h))");
    // A lifted card uses an elevated base; a drop target leans in harder.
    expect(groupTintSurface("pink", { base: "var(--color-black-800)", strength: 2 }))
      .toBe("oklch(from var(--color-black-800) l calc(var(--group-tint) * 0.0012 * var(--group-pink-k, 1)) var(--group-pink-h))");
  });

  it("gives the edge the neutral edge's lightness and twice the chroma", () => {
    expect(groupTintEdge("yellow")).toContain("calc(var(--group-tint) * 0.0012 * var(--group-yellow-k, 1)) var(--group-yellow-h)");
    expect(groupTintEdge("yellow", 2)).toContain("calc(var(--group-tint) * 0.0024 * var(--group-yellow-k, 1))");
  });
});
