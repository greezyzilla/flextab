import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAltHeld, useArmAlt } from "./altKey";

const key = (type: "keydown" | "keyup", init: KeyboardEventInit) => {
  const e = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
  act(() => { window.dispatchEvent(e); });
  return e;
};
const pointer = (altKey: boolean) => act(() => { window.dispatchEvent(new PointerEvent("pointermove", { altKey })); });

afterEach(() => key("keyup", { key: "Alt" }));

describe("useAltHeld", () => {
  it("listens only when enabled", () => {
    const { result } = renderHook(() => useAltHeld(false));
    key("keydown", { key: "Alt", altKey: true });
    expect(result.current).toBe(false);
  });

  it("follows Alt from keys and pointer events, so a lost keyup can't leave it stuck", () => {
    const { result } = renderHook(() => useAltHeld(true));
    key("keydown", { key: "Alt", altKey: true });
    expect(result.current).toBe(true);
    key("keydown", { key: "a", altKey: false });
    expect(result.current).toBe(false);
    pointer(true);
    expect(result.current).toBe(true);
    pointer(false);
    expect(result.current).toBe(false);
  });

  it("resets when the page is hidden, and ignores the page becoming visible", () => {
    const { result } = renderHook(() => useAltHeld(true));
    key("keydown", { key: "Alt", altKey: true });
    const state = (v: DocumentVisibilityState) => { Object.defineProperty(document, "visibilityState", { value: v, configurable: true }); act(() => { document.dispatchEvent(new Event("visibilitychange")); }); };
    state("visible");
    expect(result.current).toBe(true);
    state("hidden");
    expect(result.current).toBe(false);
    state("visible");
  });

  it("ignores keyups of other keys, and stops listening and forgets Alt once the last card lets go", () => {
    const first = renderHook(() => useAltHeld(true));
    const second = renderHook(() => useAltHeld(true));
    key("keydown", { key: "Alt", altKey: true });
    key("keyup", { key: "Shift" });
    expect(first.result.current).toBe(true);
    first.unmount();
    expect(second.result.current).toBe(true);
    second.unmount();
    const later = renderHook(() => useAltHeld(true));
    expect(later.result.current).toBe(false);
  });

  it("swallows a lone Alt only while a card is armed", () => {
    renderHook(() => useAltHeld(true));
    const armed = renderHook(({ on }) => useArmAlt(on), { initialProps: { on: true } });
    expect(key("keydown", { key: "Alt", altKey: true }).defaultPrevented).toBe(true);
    expect(key("keyup", { key: "Alt" }).defaultPrevented).toBe(true);
    armed.rerender({ on: false });
    expect(key("keydown", { key: "Alt", altKey: true }).defaultPrevented).toBe(false);
  });
});
