import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceTab } from "./AppearanceTab";
import { APPEARANCE_DEFAULTS, useSettingsStore } from "~src/store/useSettingsStore";

beforeEach(() => {
  useSettingsStore.setState(APPEARANCE_DEFAULTS);
  // jsdom has no layout observer; these tests exercise semantics and keys.
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("appearance control accessibility", () => {
  it("names every slider and describes its value and purpose", () => {
    render(<AppearanceTab />);
    for (const [name, value, description] of [
      ["Accent hue", "214 degrees", "The colour for accents and highlights."],
      ["Colour intensity", "100 percent", "How much colour shows. 0 = neutral grayscale; higher = vivid accent + tinted surfaces."],
      ["Roundness", "8 pixels", "Corner radius across the UI. 0 = sharp, higher = softer."],
      ["Interface scale", "100 percent", "Zoom the whole UI in or out."],
    ]) {
      const slider = screen.getByRole("slider", { name });
      expect(slider).toHaveAccessibleDescription(description);
      expect(slider).toHaveAttribute("aria-valuetext", value);
    }
    expect(screen.getAllByRole("slider")).toHaveLength(4);
  });

  it("updates the setting and announced value from the keyboard", async () => {
    const user = userEvent.setup();
    render(<AppearanceTab />);
    await user.tab();
    const hue = screen.getByRole("slider", { name: "Accent hue" });
    expect(hue).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(useSettingsStore.getState().hue).toBe(215);
    expect(hue).toHaveAttribute("aria-valuetext", "215 degrees");
    const scale = screen.getByRole("slider", { name: "Interface scale" });
    scale.focus();
    await user.keyboard("{ArrowRight}");
    expect(useSettingsStore.getState().uiScale).toBe(1.05);
    expect(scale).toHaveAttribute("aria-valuetext", "105 percent");
  });

  it("names the motion switch and toggles it with Space", async () => {
    const user = userEvent.setup();
    render(<AppearanceTab />);
    const control = screen.getByRole("switch", { name: "Reduce motion" });
    expect(control).toHaveAccessibleDescription("Minimise animations and transitions across the app.");
    expect(control).not.toBeChecked();
    control.focus();
    await user.keyboard(" ");
    expect(control).toBeChecked();
    expect(useSettingsStore.getState().reduceMotion).toBe(true);
  });

  it("labels option groups, including conditional grid columns", async () => {
    const user = userEvent.setup();
    render(<AppearanceTab />);
    for (const name of ["Font", "Group layout", "Density"]) {
      expect(screen.getByRole("radiogroup", { name })).toHaveAccessibleDescription();
    }
    await user.click(within(screen.getByRole("radiogroup", { name: "Group layout" })).getByRole("radio", { name: "Grid" }));
    const columns = screen.getByRole("radiogroup", { name: "Grid columns" });
    expect(columns).toHaveAccessibleDescription("Number of columns in grid view.");
    await user.click(within(columns).getByRole("radio", { name: "3" }));
    expect(useSettingsStore.getState().gridColumns).toBe(3);
  });

  it("keeps label references unique when multiple instances mount", () => {
    const { container } = render(<><AppearanceTab /><AppearanceTab /></>);
    const ids = Array.from(container.querySelectorAll("[id]")).map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByRole("switch", { name: "Reduce motion" })).toHaveLength(2);
    expect(screen.getAllByRole("slider", { name: "Roundness" })).toHaveLength(2);
  });
});
