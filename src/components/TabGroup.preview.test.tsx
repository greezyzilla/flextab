import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { TabGroup } from "./TabGroup";
import { TooltipProvider } from "./ui/tooltip";
import { stubResizeObserver } from "~src/test/stubResizeObserver";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { setSpaces } from "~src/lib/yjsDoc";
import { syncActiveSelection, useActiveGroups } from "~src/store/useSavedSpacesStore";
import { openOrFocus } from "~src/services/openTab";

// The preview opens in these tests; its arrow needs a ResizeObserver.
stubResizeObserver();

// The title and link measure themselves with Range rects, which jsdom lacks.
const realRect = Range.prototype.getBoundingClientRect;
beforeAll(() => { Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0); });
afterAll(() => { Range.prototype.getBoundingClientRect = realRect; });

// Every card counts as cut, so the preview is always allowed to open.
vi.mock("~src/lib/displayUrl", async (importOriginal) => ({
  ...await importOriginal<typeof import("~src/lib/displayUrl")>(),
  hasClippedText: () => true,
}));
vi.mock("~src/services/openTab", async (importOriginal) => ({
  ...await importOriginal<typeof import("~src/services/openTab")>(),
  openOrFocus: vi.fn(async () => {}),
}));
vi.mock("./ui/sonner", () => ({ showUndoToast: vi.fn() }));

const TITLE = "A very long saved tab title that the card has to cut";
const URL = "https://example.com/a/very/long/path?utm_source=newsletter";

// jsdom has no focus heuristics, so each test says whether the focus is a keyboard one.
const focusVisible = (visible: boolean) => {
  const real = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, sel: string) {
    return sel === ":focus-visible" ? visible : real.call(this, sel);
  });
};

function Groups() {
  const groups = useActiveGroups();
  return <>{groups.map((g) => <TabGroup key={g.id} group={g} location={{ spaceId: "s", projectId: "p", categoryId: "c" }} />)}</>;
}
function setup() {
  render(<TooltipProvider delayDuration={300}><DndContext><Groups /></DndContext></TooltipProvider>);
  return screen.getByRole("link", { name: `Open ${TITLE}` });
}
const preview = () => screen.queryByRole("tooltip");
const key = (type: "keydown" | "keyup", init: KeyboardEventInit) => {
  const e = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
  act(() => { window.dispatchEvent(e); });
  return e;
};

beforeEach(() => {
  vi.clearAllMocks();
  setSpaces([{ id: "s", name: "Personal", projects: [{ id: "p", name: "Research", categories: [{ id: "c", name: "General", groups: [{ id: "g", name: "Reading", tabs: [{ id: "t", title: TITLE, url: URL, favicon: "", order: 0 }] }] }] }] }]);
  syncActiveSelection(true);
});
afterEach(() => {
  key("keyup", { key: "Alt" });
  vi.restoreAllMocks();
  useSettingsStore.setState({ tabPreview: "hover" });
});

describe("saved tab preview: Hold Alt", () => {
  beforeEach(() => useSettingsStore.setState({ tabPreview: "alt" }));

  it("stays shut while the pointer crosses the card, opens at once while Alt is held, and closes on release", () => {
    const link = setup();
    fireEvent.pointerEnter(link);
    expect(preview()).toBeNull();
    key("keydown", { key: "Alt", altKey: true });
    expect(preview()).toHaveTextContent(TITLE);
    expect(preview()).toHaveTextContent(URL);
    key("keyup", { key: "Alt" });
    expect(preview()).toBeNull();
  });

  it("closes when the pointer leaves the card, and stays while it moves onto the preview", () => {
    const link = setup();
    fireEvent.pointerEnter(link);
    key("keydown", { key: "Alt", altKey: true });
    const box = screen.getByRole("tooltip").closest("[data-side]") as HTMLElement;
    fireEvent.pointerEnter(box);
    fireEvent.pointerLeave(link);
    expect(preview()).not.toBeNull();
    fireEvent.pointerLeave(box);
    expect(preview()).toBeNull();
  });

  it("opens for a keyboard user on the focused card, never for a card focused by a click", () => {
    focusVisible(true);
    const link = setup();
    act(() => link.focus());
    key("keydown", { key: "Alt", altKey: true });
    expect(preview()).toHaveTextContent(TITLE);
    key("keyup", { key: "Alt" });
    act(() => link.blur());
    vi.restoreAllMocks();
    focusVisible(false);
    act(() => link.focus());
    key("keydown", { key: "Alt", altKey: true });
    expect(preview()).toBeNull();
  });

  it("swallows a lone Alt only while it is aimed at a card, so the browser menu doesn't take focus", () => {
    const link = setup();
    expect(key("keydown", { key: "Alt", altKey: true }).defaultPrevented).toBe(false);
    expect(key("keyup", { key: "Alt" }).defaultPrevented).toBe(false);
    fireEvent.pointerEnter(link);
    expect(key("keydown", { key: "Alt", altKey: true }).defaultPrevented).toBe(true);
    expect(key("keyup", { key: "Alt" }).defaultPrevented).toBe(true);
  });

  it("opens the card on Alt+click instead of letting the browser download the link", () => {
    const link = setup();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, altKey: true, button: 0 });
    act(() => { link.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(openOrFocus).toHaveBeenCalledWith(URL, expect.objectContaining({ tabId: "t" }));
  });

  it("forgets a held Alt when the window loses focus (the keyup never comes)", () => {
    const link = setup();
    fireEvent.pointerEnter(link);
    key("keydown", { key: "Alt", altKey: true });
    expect(preview()).not.toBeNull();
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(preview()).toBeNull();
  });
});

describe("saved tab preview: On hover", () => {
  it("opens on keyboard focus without Alt, and leaves Alt+click to the browser", () => {
    focusVisible(true);
    const link = setup();
    act(() => link.focus());
    expect(preview()).toHaveTextContent(TITLE);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, altKey: true, button: 0 });
    act(() => { link.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(false);
    expect(openOrFocus).not.toHaveBeenCalled();
  });
});
