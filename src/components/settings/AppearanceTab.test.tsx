import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceTab } from "./AppearanceTab";
import { TooltipProvider } from "~src/components/ui/tooltip";
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
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    for (const [name, value, description] of [
      ["Accent hue", "214 degrees", "The colour for accents and highlights."],
      ["Colour intensity", "100 percent", "How much colour shows. 0 = neutral grayscale; higher = vivid accent + tinted surfaces."],
      ["Group tint", "35 percent", "How strongly a coloured group tints its card. 0 = no tint, the colour shows only as its dot."],
      ["Roundness", "8 pixels", "Corner radius across the UI. 0 = sharp, higher = softer."],
      ["Interface scale", "100 percent", "Zoom the whole UI in or out."],
      ["Title cut", "50 percent", "Where a long tab title is shortened. 0% keeps its end, 100% keeps its start."],
      ["Link cut", "50 percent", "Where a long link is shortened. 0% keeps its end, 100% keeps its start."],
    ]) {
      const slider = screen.getByRole("slider", { name });
      expect(slider).toHaveAccessibleDescription(description);
      expect(slider).toHaveAttribute("aria-valuetext", value);
    }
    expect(screen.getAllByRole("slider")).toHaveLength(7);
  });

  it("updates the setting and announced value from the keyboard", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    await user.tab();
    expect(within(screen.getByRole("radiogroup", { name: "Mode" })).getByRole("radio", { name: "System" })).toHaveFocus();
    const hue = screen.getByRole("slider", { name: "Accent hue" });
    hue.focus();
    await user.keyboard("{ArrowRight}");
    expect(useSettingsStore.getState().hue).toBe(215);
    expect(hue).toHaveAttribute("aria-valuetext", "215 degrees");
    const scale = screen.getByRole("slider", { name: "Interface scale" });
    scale.focus();
    await user.keyboard("{ArrowRight}");
    expect(useSettingsStore.getState().uiScale).toBe(1.05);
    expect(scale).toHaveAttribute("aria-valuetext", "105 percent");
    // Title and link cuts move in steps of 5 (TASK-71).
    const titleCut = screen.getByRole("slider", { name: "Title cut" });
    titleCut.focus();
    await user.keyboard("{ArrowLeft}");
    expect(useSettingsStore.getState().titleCut).toBe(45);
    const linkCut = screen.getByRole("slider", { name: "Link cut" });
    linkCut.focus();
    await user.keyboard("{ArrowRight}");
    expect(useSettingsStore.getState().linkCut).toBe(55);
    expect(linkCut).toHaveAttribute("aria-valuetext", "55 percent");
    // Which part of the link gives way: All by default, each choice saying what to expect.
    const shorten = screen.getByRole("radiogroup", { name: "Link cut applies to" });
    expect(within(shorten).getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "true");
    expect(shorten).toHaveAccessibleDescription("The whole link is shortened as one.");
    await user.click(within(shorten).getByRole("radio", { name: "Path" }));
    expect(useSettingsStore.getState().linkCutScope).toBe("path");
    expect(shorten).toHaveAccessibleDescription("Only the path is shortened, so the site stays whole. If the site alone doesn't fit, the whole link is shortened.");
    await user.click(within(shorten).getByRole("radio", { name: "Site" }));
    expect(shorten).toHaveAccessibleDescription("Only the site is shortened, so the path stays whole. If the path alone doesn't fit, the whole link is shortened.");
  });

  it("lets the cut tab preview open on hover or only while Alt is held, saying how in its description (TASK-80)", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ tabPreview: "hover" });
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    const preview = screen.getByRole("radiogroup", { name: "Full title and link" });
    expect(within(preview).getByRole("radio", { name: "On hover" })).toHaveAttribute("aria-checked", "true");
    expect(preview).toHaveAccessibleDescription("Pointing at a cut tab shows its full title and link.");
    await user.click(within(preview).getByRole("radio", { name: /^Hold (Alt|Option)$/ }));
    expect(useSettingsStore.getState().tabPreview).toBe("alt");
    expect(preview).toHaveAccessibleDescription(/^Hold (Alt|Option) while pointing at a cut tab, or while it has keyboard focus, to see its full title and link\.$/);
    useSettingsStore.setState({ tabPreview: "hover" });
  });

  it("names the motion switch and toggles it with Space", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    const control = screen.getByRole("switch", { name: "Reduce motion" });
    expect(control).toHaveAccessibleDescription("Minimise animations and transitions across the app.");
    expect(control).not.toBeChecked();
    control.focus();
    await user.keyboard(" ");
    expect(control).toBeChecked();
    expect(useSettingsStore.getState().reduceMotion).toBe(true);
  });

  it("offers System, Light and Dark, following the device by default", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    const mode = screen.getByRole("radiogroup", { name: "Mode" });
    expect(mode).toHaveAccessibleDescription("Follow your device, or always use light or dark.");
    expect(within(mode).getAllByRole("radio").map(r => r.getAttribute("aria-label"))).toEqual(["System", "Light", "Dark"]);
    expect(within(mode).getByRole("radio", { name: "System" })).toBeChecked();
    await user.click(within(mode).getByRole("radio", { name: "Light" }));
    expect(useSettingsStore.getState().theme).toBe("light");
    // Reset to defaults goes back to following the device.
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(useSettingsStore.getState().theme).toBe("system");
  });

  it("labels option groups, including conditional grid columns", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    for (const name of ["Mode", "Font", "Group layout", "Density"]) {
      expect(screen.getByRole("radiogroup", { name })).toHaveAccessibleDescription();
    }
    await user.click(within(screen.getByRole("radiogroup", { name: "Group layout" })).getByRole("radio", { name: "Grid" }));
    const columns = screen.getByRole("radiogroup", { name: "Grid columns" });
    expect(columns).toHaveAccessibleDescription("Maximum columns in grid view. Narrow windows show fewer so titles stay readable.");
    await user.click(within(columns).getByRole("radio", { name: "3" }));
    expect(useSettingsStore.getState().gridColumns).toBe(3);
  });

  it("picks how duplicate tabs are marked, Ribbon by default, and resets to it (TASK-68)", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    const mark = screen.getByRole("radiogroup", { name: "Duplicate tabs" });
    expect(mark).toHaveAccessibleDescription("How a tab saved twice in the same group is marked.");
    expect(within(mark).getByRole("radio", { name: "Ribbon" })).toBeChecked();
    await user.click(within(mark).getByRole("radio", { name: "Icon" }));
    expect(useSettingsStore.getState().duplicateMark).toBe("icon");
    await user.click(within(mark).getByRole("radio", { name: "Off" }));
    expect(useSettingsStore.getState().duplicateMark).toBe("off");
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(useSettingsStore.getState().duplicateMark).toBe("ribbon");
  });

  it("offers colour for any mark, and corner and text only for the ribbon (TASK-68)", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    const pick = (group: string, name: string) => user.click(within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name }));
    for (const name of ["Duplicate colour", "Ribbon corner", "Ribbon text"]) {
      expect(screen.getByRole("radiogroup", { name })).toHaveAccessibleDescription();
    }
    await pick("Duplicate colour", "Accent");
    await pick("Ribbon corner", "Left");
    await pick("Ribbon text", "Count");
    expect(useSettingsStore.getState()).toMatchObject({ duplicateTone: "accent", duplicateCorner: "left", duplicateLabel: "count" });
    await pick("Duplicate tabs", "Icon");
    expect(screen.getByRole("radiogroup", { name: "Duplicate colour" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Ribbon corner" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Ribbon text" })).toBeNull();
    await pick("Duplicate tabs", "Off");
    expect(screen.queryByRole("radiogroup", { name: "Duplicate colour" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(useSettingsStore.getState()).toMatchObject({ duplicateMark: "ribbon", duplicateTone: "caution", duplicateCorner: "right", duplicateLabel: "dupe" });
  });

  it("keeps label references unique when multiple instances mount", () => {
    const { container } = render(<TooltipProvider><AppearanceTab /><AppearanceTab /></TooltipProvider>);
    const ids = Array.from(container.querySelectorAll("[id]")).map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByRole("switch", { name: "Reduce motion" })).toHaveLength(2);
    expect(screen.getAllByRole("slider", { name: "Roundness" })).toHaveLength(2);
  });
});

describe("Open as tab groups (TASK-31)", () => {
  const c = chrome as unknown as Record<string, any>;
  afterEach(() => { delete c.tabs.group; delete c.permissions; useSettingsStore.setState({ openAsTabGroups: true }); });
  const supported = (answer: boolean) => {
    c.tabs.group = vi.fn();
    c.permissions = { request: vi.fn(async () => answer), remove: vi.fn(async () => true) };
  };

  it("is not offered in a browser without tab groups", () => {
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    expect(screen.queryByRole("switch", { name: "Open as tab groups" })).not.toBeInTheDocument();
  });

  it("turns off and gives the permission back", async () => {
    supported(true);
    const user = userEvent.setup();
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    const toggle = screen.getByRole("switch", { name: "Open as tab groups" });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription("Open all puts a group's tabs in a browser tab group with the same name and color.");
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(useSettingsStore.getState().openAsTabGroups).toBe(false);
    expect(c.permissions.remove).toHaveBeenCalledWith({ permissions: ["tabGroups"] });
  });

  it("turns on only when the browser grants the permission", async () => {
    supported(false);
    useSettingsStore.setState({ openAsTabGroups: false });
    const user = userEvent.setup();
    render(<TooltipProvider><AppearanceTab /></TooltipProvider>);
    const toggle = screen.getByRole("switch", { name: "Open as tab groups" });
    await user.click(toggle);
    expect(c.permissions.request).toHaveBeenCalledWith({ permissions: ["tabGroups"] });
    expect(toggle).not.toBeChecked(); // declined: stays off

    c.permissions.request = vi.fn(async () => true);
    await user.click(toggle);
    await vi.waitFor(() => expect(toggle).toBeChecked());
  });
});
