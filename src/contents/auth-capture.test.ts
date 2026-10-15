import { beforeEach, afterEach, it, expect, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubEnv("PLASMO_PUBLIC_API_URL", "https://api.flextabmanager.com"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("only wakes the worker and never writes tokens from the page", async () => {
  vi.stubGlobal("window", { location: new URL("https://api.flextabmanager.com/auth/success#access_token=attacker&refresh_token=evil&expires_at=9999999999") });
  await import("./auth-capture");
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "flextab.oauth.callback" });
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
  expect(chrome.storage.session.get).not.toHaveBeenCalled();
});

it.each(["https://attacker.example/auth/success", "https://api.flextabmanager.com/other"])("ignores unrelated page %s", async url => {
  vi.stubGlobal("window", { location: new URL(url) });
  await import("./auth-capture");
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});
