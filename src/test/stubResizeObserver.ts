import { afterAll, beforeAll, vi } from "vitest";

/**
 * For a test file that opens app tooltips: Radix's tooltip arrow measures itself
 * with a ResizeObserver, which jsdom lacks (TASK-69). Scoped to the file, not the
 * global setup, because components such as MiddleText and AppearancePreview take
 * a different path when ResizeObserver is missing and other tests rely on it.
 */
export function stubResizeObserver() {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });
  afterAll(() => vi.unstubAllGlobals());
}

/**
 * The same stub for one step only, for a file whose cards measure text with a
 * ResizeObserver when one exists (TabUrl, MiddleText): stub, open the tooltip,
 * check it, unstub, before anything re-renders those cards.
 */
export async function withResizeObserver<T>(step: () => Promise<T>): Promise<T> {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  try {
    return await step();
  } finally {
    vi.unstubAllGlobals();
  }
}
