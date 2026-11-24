import { useSyncExternalStore } from "react";

// Minimal hash-based routing for the new-tab app. The workspace lives at "/",
// full-screen pages live under a hash path (e.g. "#/settings/history"). Kept
// dependency-free — the app has exactly one nesting level of "pages", so a
// router library would be overkill. Deep-linkable + the browser Back button
// works because we drive off window.location.hash.

function getHash(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** Current route path, e.g. "/" or "/settings/history". Re-renders on change. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, getHash, () => "/");
}

/** Navigate to a hash path (adds a history entry, so Back returns here). */
export function navigate(path: string): void {
  window.location.hash = path;
}

/** Go back to the workspace root. Prefers real history (so Back/Forward stay
 *  consistent), falling back to a hash replace when there's nothing to pop. */
export function goBack(): void {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = "/";
}
