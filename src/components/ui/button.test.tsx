import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IconButton, IconTooltip } from "./button";
import { TooltipProvider } from "./tooltip";

// jsdom has no focus heuristics, so each test says whether the focus is a keyboard one.
const focusVisible = (visible: boolean | "throws") => {
  const real = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, sel: string) {
    if (sel !== ":focus-visible") return real.call(this, sel);
    if (visible === "throws") throw new SyntaxError("unsupported");
    return visible;
  });
};

const renderButton = () => render(
  <TooltipProvider delayDuration={0}>
    <IconButton aria-label="Actions for Launch" tooltip="More actions" tooltipSide="right">⋯</IconButton>
  </TooltipProvider>,
);
const button = () => screen.getByRole("button", { name: "Actions for Launch" });
const tooltipShown = () => screen.queryByRole("tooltip") !== null;

describe("IconButton tooltip (TASK-53)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders no tooltip wrapper and no native title without the prop", () => {
    render(<IconButton aria-label="Plain">x</IconButton>);
    expect(screen.getByRole("button", { name: "Plain" })).not.toHaveAttribute("title");
  });

  it("shows the app tooltip on keyboard focus, and keeps the full aria-label", async () => {
    focusVisible(true);
    renderButton();
    await act(async () => { button().focus(); });
    expect(tooltipShown()).toBe(true);
    expect(screen.getByRole("tooltip")).toHaveTextContent("More actions");
    expect(button()).not.toHaveAttribute("title");
  });

  it("stays quiet when focus comes back without :focus-visible (a menu closed by mouse), until hovered", async () => {
    focusVisible(false);
    renderButton();
    await act(async () => { button().focus(); });
    expect(tooltipShown()).toBe(false);
    await act(async () => { fireEvent.pointerMove(button(), { pointerType: "mouse" }); });
    expect(tooltipShown()).toBe(true);
  });

  it("IconTooltip opens only while `when` says so (a card shows its full title only when cut, TASK-54)", async () => {
    focusVisible(true);
    let clipped = false;
    render(
      <TooltipProvider delayDuration={0}>
        <IconTooltip content="Full title" when={() => clipped}><a href="#x">Short</a></IconTooltip>
      </TooltipProvider>,
    );
    const link = screen.getByRole("link", { name: "Short" });
    await act(async () => { link.focus(); });
    expect(tooltipShown()).toBe(false);
    await act(async () => { link.blur(); });
    clipped = true;
    await act(async () => { link.focus(); });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Full title");
  });

  it("treats a browser without :focus-visible support as keyboard focus", async () => {
    focusVisible("throws");
    renderButton();
    await act(async () => { button().focus(); });
    expect(tooltipShown()).toBe(true);
    await act(async () => { button().blur(); });
  });
});
