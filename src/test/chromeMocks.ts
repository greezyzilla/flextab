import { vi, type Mock } from "vitest"

/**
 * The promise form of an overloaded chrome.* function, as a mock. @types/chrome
 * declares the callback overload last, and vi.mocked() types a mock from the
 * last overload, whose return type is void. Name the resolved value instead:
 * mockedAsync<chrome.tabs.Tab[]>(chrome.tabs.query).mockResolvedValue([])
 */
export function mockedAsync<R, A extends unknown[] = any[]>(fn: unknown): Mock<(...args: A) => Promise<R>> {
  return vi.mocked(fn as (...args: A) => Promise<R>)
}
