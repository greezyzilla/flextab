/**
 * "The API server just answered" signal.
 *
 * The realtime socket backs off up to 5 minutes while the server is down, so
 * after the server comes back it can wait that long to reconnect. Any HTTP
 * response from the API proves the server is up again, so the HTTP client
 * reports it here and the sync engine can retry the socket right away.
 *
 * Kept apart from api.ts so the sync engine can listen without importing the
 * HTTP client's internals, and so tests can drive it directly.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** True when a response came from the API itself, not from a proxy in front of a down server. */
export function isServerAnswer(status: number): boolean {
  return status > 0 && status < 500;
}

/** Called by the HTTP client after every response it receives. */
export function noteServerResponse(status: number): void {
  if (!isServerAnswer(status)) return;
  for (const listener of listeners) {
    try { listener(); } catch (_) { /* a listener must not break the request */ }
  }
}

/** Subscribe to "the server answered"; returns the unsubscribe function. */
export function onServerReachable(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
