import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button, ClippedTooltip, IconButton, IconTooltip } from "./button";
import { TooltipProvider } from "./tooltip";
import { stubResizeObserver } from "~src/test/stubResizeObserver";

// Tooltips open in these tests; their arrow needs a ResizeObserver (TASK-69).
stubResizeObserver();

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

describe("ClippedTooltip (TASK-69)", () => {
  afterEach(() => vi.restoreAllMocks());

  // jsdom lays nothing out, so each test sets how wide the text is against its box.
  const widths = (el: HTMLElement, scroll: number, client: number) => {
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: client });
  };

  it("opens only while the trigger's own text is cut", async () => {
    focusVisible(true);
    render(
      <TooltipProvider delayDuration={0}>
        <ClippedTooltip content="A very long space name"><button data-clip>A very long…</button></ClippedTooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button");
    widths(trigger, 100, 100);
    await act(async () => { trigger.focus(); });
    expect(tooltipShown()).toBe(false);
    await act(async () => { trigger.blur(); });
    widths(trigger, 180, 100);
    await act(async () => { trigger.focus(); });
    expect(screen.getByRole("tooltip")).toHaveTextContent("A very long space name");
    expect(trigger).not.toHaveAttribute("title");
  });

  it("also opens when a [data-clip] inside the trigger is cut", async () => {
    focusVisible(true);
    render(
      <TooltipProvider delayDuration={0}>
        <ClippedTooltip content="Inbox"><button><span data-clip>Inb…</span></button></ClippedTooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button");
    widths(trigger, 50, 50);
    widths(trigger.querySelector("span")!, 60, 30);
    await act(async () => { trigger.focus(); });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Inbox");
  });

  it("stays shut on a trigger that is not marked as clippable", async () => {
    focusVisible(true);
    render(
      <TooltipProvider delayDuration={0}>
        <ClippedTooltip content="Name"><button>Name</button></ClippedTooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button");
    widths(trigger, 200, 50);
    await act(async () => { trigger.focus(); });
    expect(tooltipShown()).toBe(false);
  });
});

describe("forced colours edge (TASK-100)", () => {
  // Forced colours drop backgrounds; a filled variant keeps its shape only through this outline.
  // tailwind-merge once dropped `outline` next to `outline-1`, leaving outline-style none: lock the
  // classes as they reach the DOM, after cn().
  it.each(["default", "destructive", "secondary"] as const)("%s keeps an edge in forced colours", (variant) => {
    render(<Button variant={variant}>Go</Button>);
    const cls = screen.getByRole("button", { name: "Go" }).className;
    expect(cls).toContain("forced-colors:[outline:1px_solid_ButtonText]");
    expect(cls).toContain("forced-colors:[outline-offset:-1px]");
    expect(cls).toContain("forced-colors:disabled:[outline-color:GrayText]");
  });
  it.each(["outline", "ghost", "danger", "link"] as const)("%s needs no extra edge (it has a border, or is text)", (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" }).className).not.toContain("forced-colors:[outline");
  });
});

describe("link variant and inline size (TASK-103.2)", () => {
  // Looks live in the variant, so every link button reads as an action without call-site classes.
  it("a link reads as an action at rest: accent text from the variant", () => {
    render(<Button variant="link">Sync settings</Button>);
    expect(screen.getByRole("button", { name: "Sync settings" }).className).toContain("text-fg-accent");
  });
  it("an inline link takes the sentence's own size and line height, with no box", () => {
    render(<p className="text-xs">Still confirming. <Button variant="link" size="inline">Check again</Button></p>);
    const cls = screen.getByRole("button", { name: "Check again" }).className;
    for (const c of ["h-auto", "p-0", "align-baseline", "text-[length:inherit]", "leading-[inherit]"]) expect(cls).toContain(c);
    expect(cls).not.toMatch(/(^|\s)text-(sm|xs)(\s|$)/);
  });
});
