import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

let session: Record<string, any>;
let local: Record<string, any>;
let tabs: Map<number, string>;
let nextTab: number;
let oauth: typeof import("./oauthLogin");
const api = "https://api.flextabmanager.com";
const code = "c".repeat(43);
const tokens = () => ({ access_token: "access", refresh_token: "refresh", expires_at: Date.now() / 1000 + 900 });

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("PLASMO_PUBLIC_API_URL", api);
  vi.stubGlobal("crypto", webcrypto);
  session = {}; local = { workspace: "private guest work" }; tabs = new Map(); nextTab = 1;
  vi.mocked(chrome.storage.session.get).mockImplementation(async key => ({ [key as string]: structuredClone(session[key as string]) }));
  vi.mocked(chrome.storage.session.set).mockImplementation(async data => { Object.assign(session, structuredClone(data)); });
  vi.mocked(chrome.storage.session.remove).mockImplementation(async key => { delete session[key as string]; });
  vi.mocked(chrome.storage.local.get).mockImplementation(async key => ({ [key as string]: structuredClone(local[key as string]) }));
  vi.mocked(chrome.storage.local.set).mockImplementation(async data => { Object.assign(local, structuredClone(data)); });
  vi.mocked(chrome.storage.local.remove).mockImplementation(async key => { delete local[key as string]; });
  vi.mocked(chrome.tabs.create).mockImplementation(async ({ url }: any) => { const id = nextTab++; tabs.set(id, url); return { id } as any; });
  vi.mocked(chrome.tabs.update).mockImplementation(async (id: any, update: any) => { tabs.set(id, update.url); return { id } as any; });
  vi.mocked(chrome.tabs.get).mockImplementation(async (id: any) => { if (!tabs.has(id)) throw new Error("Tab closed"); return { id, url: tabs.get(id) } as any; });
  vi.mocked(chrome.tabs.remove).mockImplementation(async (id: any) => { tabs.delete(id); });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => tokens() })));
  oauth = await import("./oauthLogin");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function attempt(provider = "google") {
  await oauth.startOAuthLogin(provider);
  const pending = structuredClone(session[oauth.OAUTH_PENDING_KEY]);
  const callback = `${api}/auth/success#code=${code}&state=${pending.nonce}`;
  return { pending, callback };
}

it.each(["google", "github"])("starts %s with a private verifier and a SHA-256 challenge before navigation", async provider => {
  const { pending } = await attempt(provider);
  const url = new URL(tabs.get(pending.tabId)!);
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(pending.verifier));
  expect(url.searchParams.get("code_challenge")).toBe(Buffer.from(digest).toString("base64url"));
  expect(url.searchParams.get("state")).toBe(pending.nonce);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.toString()).not.toContain(pending.verifier);
  expect(pending.verifier).not.toBe(pending.nonce);
  expect(pending.expiresAt).toBeGreaterThan(Date.now());
  expect(vi.mocked(chrome.storage.session.set).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(chrome.tabs.update).mock.invocationCallOrder[0]);
  expect(local).toEqual({ workspace: "private guest work" });
});

it("completes only the expected tab/nonce and consumes duplicate callback paths once", async () => {
  const { pending, callback } = await attempt(); tabs.set(pending.tabId, callback);
  local.flextab_sync_hydrated = true;
  const result = await Promise.all([oauth.completeOAuthLogin(pending.tabId, callback), oauth.completeOAuthLogin(pending.tabId, callback)]);
  expect(result).toEqual([true, false]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ code, state: pending.nonce, code_verifier: pending.verifier });
  expect(local.auth_tokens.access_token).toBe("access");
  expect(local.flextab_sync_hydrated).toBeUndefined();
  expect(local.flextab_fresh_login).toBe(true);
  expect(local.workspace).toBe("private guest work");
  expect(session[oauth.OAUTH_PENDING_KEY]).toBeUndefined();
  expect(tabs.has(pending.tabId)).toBe(false);
});

it("retains the attempt across a worker restart", async () => {
  const { pending, callback } = await attempt(); tabs.set(pending.tabId, callback);
  vi.resetModules(); oauth = await import("./oauthLogin");
  expect(await oauth.completeOAuthLogin(pending.tabId, callback)).toBe(true);
});

it.each(["absent", "expired", "tab", "nonce", "origin", "path", "tokens", "mixed", "duplicate", "navigated"])("rejects %s callback without changing credentials or workspace", async mode => {
  const { pending, callback } = await attempt();
  let target = callback, id = pending.tabId;
  if (mode === "absent") session = {};
  if (mode === "expired") session[oauth.OAUTH_PENDING_KEY].expiresAt = Date.now() - 1;
  if (mode === "tab") id = 999;
  if (mode === "nonce") target = callback.replace(pending.nonce, "x".repeat(43));
  if (mode === "origin") target = callback.replace(api, "https://attacker.example");
  if (mode === "path") target = callback.replace("/auth/success", "/auth/success/extra");
  if (mode === "tokens") target = `${api}/auth/success#access_token=attacker&refresh_token=evil&expires_at=9999999999`;
  if (mode === "mixed") target += "&access_token=attacker";
  if (mode === "duplicate") target += `&code=${code}`;
  tabs.set(id, mode === "navigated" ? "https://elsewhere.example" : target);
  expect(await oauth.completeOAuthLogin(id, target)).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(local).toEqual({ workspace: "private guest work" });
});

it("invalidates an old login when a new one starts", async () => {
  const old = await attempt(); const current = await attempt("github");
  expect(old.pending.nonce).not.toBe(current.pending.nonce);
  expect(await oauth.completeOAuthLogin(old.pending.tabId, old.callback)).toBe(false);
  expect(session[oauth.OAUTH_PENDING_KEY].nonce).toBe(current.pending.nonce);
  expect(fetch).not.toHaveBeenCalled();
});

it("refuses to start over an existing session or replace a session established during login", async () => {
  const { pending, callback } = await attempt(); tabs.set(pending.tabId, callback);
  local.auth_tokens = { access_token: "other-session" };
  await expect(oauth.startOAuthLogin("github")).rejects.toThrow("Sign out");
  expect(await oauth.completeOAuthLogin(pending.tabId, callback)).toBe(false);
  expect(local.auth_tokens).toEqual({ access_token: "other-session" });
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["closed", "navigated", "signed-in"])("does not install tokens if the tab is %s during exchange", async mode => {
  const { pending, callback } = await attempt(); tabs.set(pending.tabId, callback);
  vi.mocked(fetch).mockImplementation(async () => {
    if (mode === "closed") tabs.delete(pending.tabId);
    if (mode === "navigated") tabs.set(pending.tabId, "about:blank");
    if (mode === "signed-in") local.auth_tokens = { access_token: "other-session" };
    return { ok: true, json: async () => tokens() } as any;
  });
  const result = oauth.completeOAuthLogin(pending.tabId, callback);
  if (mode === "closed") await expect(result).rejects.toThrow("Tab closed"); else expect(await result).toBe(false);
  expect(local.auth_tokens?.access_token).not.toBe("access");
  expect(local.workspace).toBe("private guest work");
});

it.each(["network", "http", "invalid-tokens", "storage"])("fails closed on %s failure and requires a new attempt", async mode => {
  const { pending, callback } = await attempt(); tabs.set(pending.tabId, callback);
  if (mode === "network") vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  if (mode === "http") vi.mocked(fetch).mockResolvedValue({ ok: false } as any);
  if (mode === "invalid-tokens") vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ...tokens(), expires_at: "9999999999" }) } as any);
  if (mode === "storage") vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(oauth.completeOAuthLogin(pending.tabId, callback)).rejects.toThrow();
  expect(local.auth_tokens).toBeUndefined();
  expect(session[oauth.OAUTH_PENDING_KEY]).toBeUndefined();
  expect(await oauth.completeOAuthLogin(pending.tabId, callback)).toBe(false);
});

it("does not exchange when pending storage cannot be consumed", async () => {
  const { pending, callback } = await attempt(); tabs.set(pending.tabId, callback);
  vi.mocked(chrome.storage.session.remove).mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(oauth.completeOAuthLogin(pending.tabId, callback)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled(); expect(local.auth_tokens).toBeUndefined();
});

it("cancels a closed login tab without canceling a different pending tab", async () => {
  const { pending } = await attempt();
  await oauth.cancelOAuthTab(pending.tabId + 1);
  expect(session[oauth.OAUTH_PENDING_KEY]).toBeDefined();
  await oauth.cancelOAuthTab(pending.tabId);
  expect(session[oauth.OAUTH_PENDING_KEY]).toBeUndefined();
});

it("authenticates message senders and accepts only top-frame callback messages", async () => {
  oauth.registerOAuthMessages();
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0];
  const respond = vi.fn();
  const webSender = { id: chrome.runtime.id, url: `${api}/auth/success`, frameId: 0, tab: { id: 10 } } as any;
  expect(listener({ type: oauth.OAUTH_START, provider: "google" }, webSender, respond)).toBeUndefined();
  expect(listener({ type: oauth.OAUTH_START, provider: "google" }, { id: "other", url: chrome.runtime.getURL("newtab.html") }, respond)).toBeUndefined();
  expect(listener({ type: oauth.OAUTH_CALLBACK }, { ...webSender, frameId: 1 }, respond)).toBeUndefined();
  expect(chrome.tabs.create).not.toHaveBeenCalled();
  const started = new Promise<any>(resolve => listener({ type: oauth.OAUTH_START, provider: "google" }, { id: chrome.runtime.id, url: chrome.runtime.getURL("newtab.html") }, resolve));
  expect(await started).toEqual({ ok: true });
  const pending = session[oauth.OAUTH_PENDING_KEY];
  const callback = `${api}/auth/success#code=${code}&state=${pending.nonce}`;
  tabs.set(pending.tabId, callback);
  const completed = new Promise<any>(resolve => listener({ type: oauth.OAUTH_CALLBACK, url: "https://ignored-attacker-input" }, { ...webSender, url: callback, tab: { id: pending.tabId } }, resolve));
  expect(await completed).toEqual({ ok: true });
  expect(local.auth_tokens.access_token).toBe("access");
});
