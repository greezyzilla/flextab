// The background worker owns the session refresh; pages and the popup ask it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

function res(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: 'ERR', json: async () => body } as Response;
}
const future = () => Date.now() / 1000 + 3600;
const past = () => Date.now() / 1000 - 10;
let api: typeof import('./api');
let disk: Record<string, any>;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  disk = {};
  (chrome.storage.local.get as any).mockImplementation(async (k: any) => ({ [k]: disk[k] }));
  (chrome.storage.local.set as any).mockImplementation(async (items: any) => { Object.assign(disk, items); });
  (chrome.storage.local.remove as any).mockImplementation(async (k: any) => { for (const x of [k].flat()) delete disk[x]; });
  global.fetch = vi.fn();
  api = await import('./api');
});

describe('a page whose token needs refreshing', () => {
  it('asks the worker and uses the pair it stored, without refreshing itself', async () => {
    await api.saveTokens({ access_token: 'old', refresh_token: 'rt1', expires_at: past() });
    const fresh = { access_token: 'new', refresh_token: 'rt2', expires_at: future() };
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ status: 'ok', tokens: fresh } as never);
    (global.fetch as any).mockResolvedValueOnce(res({ ok: true }));
    await api.apiFetch('/x');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'flextab:refresh-tokens', attempted: 'rt1' });
    expect((global.fetch as any).mock.calls.map((c: any[]) => c[0]).some((u: string) => u.includes('/auth/refresh'))).toBe(false);
    expect((global.fetch as any).mock.calls[0][1].headers.Authorization).toBe('Bearer new');
  });

  it('stops when the worker says the session ended, without a refresh of its own', async () => {
    await api.saveTokens({ access_token: 'old', refresh_token: 'rt1', expires_at: past() });
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ status: 'expired' } as never);
    await expect(api.apiFetch('/x')).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps the session and retries later when the worker could not reach the server', async () => {
    await api.saveTokens({ access_token: 'old', refresh_token: 'rt1', expires_at: past() });
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ status: 'unavailable' } as never);
    await expect(api.apiFetch('/x')).rejects.toBeInstanceOf(api.RefreshUnavailableError);
    expect(disk.auth_tokens?.refresh_token).toBe('rt1');
  });
});

describe('the worker', () => {
  const serve = () => {
    api.serveTokenRefresh();
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)![0] as any;
    return (attempted: string) => new Promise<any>((resolve) => {
      expect(listener({ type: 'flextab:refresh-tokens', attempted }, { id: chrome.runtime.id }, resolve)).toBe(true);
    });
  };

  it('refreshes and stores the new pair, so it survives the asking page closing', async () => {
    disk.auth_tokens = { access_token: 'old', refresh_token: 'rt1', expires_at: past() };
    (global.fetch as any).mockResolvedValueOnce(res({ access_token: 'new', refresh_token: 'rt2', expires_at: future() }));
    const ask = serve();
    const reply = await ask('rt1');
    expect(reply).toMatchObject({ status: 'ok', tokens: { refresh_token: 'rt2' } });
    expect(disk.auth_tokens.refresh_token).toBe('rt2');
  });

  it('hands over a pair another context already rotated, with no request', async () => {
    disk.auth_tokens = { access_token: 'new', refresh_token: 'rt2', expires_at: future() };
    const ask = serve();
    expect(await ask('rt1')).toMatchObject({ status: 'ok', tokens: { refresh_token: 'rt2' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers two pages asking at once with one refresh', async () => {
    disk.auth_tokens = { access_token: 'old', refresh_token: 'rt1', expires_at: past() };
    (global.fetch as any).mockResolvedValueOnce(res({ access_token: 'new', refresh_token: 'rt2', expires_at: future() }));
    const ask = serve();
    const [a, b] = await Promise.all([ask('rt1'), ask('rt1')]);
    expect(a.tokens.refresh_token).toBe('rt2');
    expect(b.tokens.refresh_token).toBe('rt2');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('says the session ended when there is nothing stored', async () => {
    const ask = serve();
    expect(await ask('rt1')).toEqual({ status: 'expired' });
  });

  it('ignores messages from other extensions', async () => {
    api.serveTokenRefresh();
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)![0] as any;
    expect(listener({ type: 'flextab:refresh-tokens', attempted: 'x' }, { id: 'someone-else' }, vi.fn())).toBeUndefined();
  });
});
