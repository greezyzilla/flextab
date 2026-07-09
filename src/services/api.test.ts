import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  apiFetch, pushSync, fetchSyncRevision, apiRegister, apiLogin, apiChangePassword,
  getAuthUrl, getDeviceId, loadTokens, saveTokens, clearTokens, ApiError,
} from './api';

function res(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: 'ERR', json: async () => body } as Response;
}
const future = () => Date.now() / 1000 + 3600;
const past = () => Date.now() / 1000 - 10;
const validToken = () => saveTokens({ access_token: 'tok', refresh_token: 'rt', expires_at: future() });

beforeEach(async () => {
  vi.clearAllMocks();
  (chrome.storage.local.get as any).mockResolvedValue({});
  (chrome.storage.local.set as any).mockResolvedValue(undefined);
  (chrome.storage.local.remove as any).mockResolvedValue(undefined);
  global.fetch = vi.fn();
  await clearTokens();
});

describe('getDeviceId', () => {
  it('generates and persists an id when none is stored', async () => {
    vi.resetModules();
    (chrome.storage.local.get as any).mockResolvedValue({});
    const { getDeviceId: fresh } = await import('./api');
    const id = await fresh();
    expect(id).toBeTruthy();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_device_id: id });
    expect(await fresh()).toBe(id); // cached
  });

  it('reads the stored device id', async () => {
    vi.resetModules();
    (chrome.storage.local.get as any).mockResolvedValue({ flextab_device_id: 'stored-id' });
    const { getDeviceId: fresh } = await import('./api');
    expect(await fresh()).toBe('stored-id');
  });

  it('generates when storage throws', async () => {
    vi.resetModules();
    (chrome.storage.local.get as any).mockRejectedValue(new Error('no ctx'));
    const { getDeviceId: fresh } = await import('./api');
    expect(await fresh()).toBeTruthy();
  });
});

describe('token storage', () => {
  it('loadTokens reads from storage', async () => {
    (chrome.storage.local.get as any).mockResolvedValue({ auth_tokens: { access_token: 'a', refresh_token: 'r', expires_at: future() } });
    expect((await loadTokens())?.access_token).toBe('a');
  });
  it('loadTokens returns null on error', async () => {
    (chrome.storage.local.get as any).mockRejectedValue(new Error('x'));
    expect(await loadTokens()).toBeNull();
  });
  it('saveTokens and clearTokens hit storage', async () => {
    await saveTokens({ access_token: 'a', refresh_token: 'r', expires_at: 1 });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ auth_tokens: expect.any(Object) });
    await clearTokens();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('auth_tokens');
  });
});

describe('apiFetch', () => {
  it('attaches auth + client id and returns json', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({ hello: 1 }));
    expect(await apiFetch('/x')).toEqual({ hello: 1 });
    const [, opts] = (global.fetch as any).mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer tok');
    expect(opts.headers['X-Client-ID']).toBeTruthy();
  });

  it('omits Authorization when there is no token', async () => {
    (chrome.storage.local.get as any).mockResolvedValue({}); // loadTokens → null
    (global.fetch as any).mockResolvedValue(res({}));
    await apiFetch('/x');
    const [, opts] = (global.fetch as any).mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });

  it('401 clears tokens and throws', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({}, 401));
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('auth_tokens');
  });

  it('non-ok throws ApiError with the body error', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({ error: 'boom' }, 500));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 500, message: 'boom' });
  });

  it('non-ok falls back to statusText when body has no error', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable', json: async () => { throw new Error('no json'); } } as Response);
    await expect(apiFetch('/x')).rejects.toMatchObject({ message: 'Unavailable' });
  });

  it('refreshes an expired token before the request', async () => {
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    (global.fetch as any)
      .mockResolvedValueOnce(res({ access_token: 'new', refresh_token: 'rt2', expires_at: future() }))
      .mockResolvedValueOnce(res({ ok: true }));
    await apiFetch('/x');
    expect((global.fetch as any).mock.calls[0][0]).toContain('/api/auth/refresh');
    expect((global.fetch as any).mock.calls[1][1].headers['Authorization']).toBe('Bearer new');
  });

  it('a failed refresh (401) clears tokens and proceeds unauthenticated', async () => {
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    (global.fetch as any)
      .mockResolvedValueOnce(res({}, 401)) // refresh fails
      .mockResolvedValueOnce(res({ ok: true }));
    await apiFetch('/x');
    expect((global.fetch as any).mock.calls[1][1].headers['Authorization']).toBeUndefined();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('auth_tokens');
  });

  it('a 401 refresh adopts a token a sibling context already rotated in, instead of clearing', async () => {
    // Simulates the background worker and a newtab page racing to refresh the
    // same soon-to-expire token: the loser gets a 401 for a token that was
    // valid when it sent it, not actually dead — it should pick up the
    // winner's fresh tokens rather than wipe a still-live session.
    await saveTokens({ access_token: 'old', refresh_token: 'rt-old', expires_at: past() });
    const rotated = { access_token: 'new2', refresh_token: 'rt-new', expires_at: future() };
    (chrome.storage.local.get as any).mockResolvedValue({ auth_tokens: rotated });
    (global.fetch as any)
      .mockResolvedValueOnce(res({}, 401))
      .mockResolvedValueOnce(res({ ok: true }));
    await apiFetch('/x');
    // One call is the beforeEach's own clearTokens() reset — the assertion is
    // that this path doesn't add a *second* one of its own.
    expect(chrome.storage.local.remove).toHaveBeenCalledTimes(1);
    expect((global.fetch as any).mock.calls[1][1].headers['Authorization']).toBe('Bearer new2');
  });

  it('a non-401 refresh failure does not clear tokens (transient, not a dead session)', async () => {
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    (global.fetch as any)
      .mockResolvedValueOnce(res({}, 500))
      .mockResolvedValueOnce(res({ ok: true }));
    await apiFetch('/x');
    expect(chrome.storage.local.remove).toHaveBeenCalledTimes(1);
    expect((global.fetch as any).mock.calls[1][1].headers['Authorization']).toBeUndefined();
  });

  it('a thrown refresh resolves to no token', async () => {
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    (global.fetch as any).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(res({ ok: true }));
    await apiFetch('/x');
    expect((global.fetch as any).mock.calls[1][1].headers['Authorization']).toBeUndefined();
  });

  it('an expired token without a refresh token yields no token', async () => {
    await saveTokens({ access_token: 'old', refresh_token: '', expires_at: past() });
    (global.fetch as any).mockResolvedValue(res({ ok: true }));
    await apiFetch('/x');
    expect((global.fetch as any).mock.calls[0][1].headers['Authorization']).toBeUndefined();
  });
});

describe('pushSync', () => {
  it('returns error without a token', async () => {
    (chrome.storage.local.get as any).mockResolvedValue({});
    expect(await pushSync([], 1)).toEqual({ status: 'error' });
  });
  it('returns ok on 200', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({ revision: 5 }));
    expect(await pushSync([{ id: 's' }], 4)).toEqual({ status: 'ok', revision: 5 });
  });
  it('falls back to base+1 when the ok body lacks a revision', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({}));
    expect(await pushSync([{ id: 's' }], 4)).toEqual({ status: 'ok', revision: 5 });
  });
  it('returns conflict with the server state on 409', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({ revision: 9, spaces: [{ id: 'x' }] }, 409));
    expect(await pushSync([], 1)).toEqual({ status: 'conflict', revision: 9, spaces: [{ id: 'x' }] });
  });
  it('conflict falls back to base revision + empty spaces when the body is bare', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({}, 409));
    expect(await pushSync([], 3)).toEqual({ status: 'conflict', revision: 3, spaces: [] });
  });
  it('returns error on other non-ok statuses', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({}, 500));
    expect(await pushSync([], 1)).toEqual({ status: 'error' });
  });
  it('returns error when the request throws', async () => {
    await validToken();
    (global.fetch as any).mockRejectedValue(new Error('net'));
    expect(await pushSync([], 1)).toEqual({ status: 'error' });
  });
});

describe('fetchSyncRevision', () => {
  it('returns the revision', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({ revision: 7 }));
    expect(await fetchSyncRevision()).toBe(7);
  });
  it('returns null for a non-numeric revision', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({ revision: 'x' }));
    expect(await fetchSyncRevision()).toBeNull();
  });
  it('returns null when the request fails', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({}, 500));
    expect(await fetchSyncRevision()).toBeNull();
  });
});

describe('auth endpoints', () => {
  it('apiRegister returns tokens', async () => {
    (global.fetch as any).mockResolvedValue(res({ access_token: 'a', refresh_token: 'r', expires_at: 1 }));
    expect((await apiRegister('e', 'p', 'n')).access_token).toBe('a');
  });
  it('apiRegister throws on failure', async () => {
    (global.fetch as any).mockResolvedValue(res({ error: 'taken' }, 409));
    await expect(apiRegister('e', 'p', 'n')).rejects.toMatchObject({ status: 409, message: 'taken' });
  });
  it('apiLogin returns tokens', async () => {
    (global.fetch as any).mockResolvedValue(res({ access_token: 'a', refresh_token: 'r', expires_at: 1 }));
    expect((await apiLogin('e', 'p')).access_token).toBe('a');
  });
  it('apiLogin throws on failure', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) } as Response);
    await expect(apiLogin('e', 'p')).rejects.toMatchObject({ status: 401, message: 'Unauthorized' });
  });
  it('apiChangePassword PUTs to the password endpoint', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res({}));
    await apiChangePassword('old', 'new');
    const [url, opts] = (global.fetch as any).mock.calls[0];
    expect(url).toContain('/api/auth/password');
    expect(opts.method).toBe('PUT');
  });
});

describe('misc', () => {
  it('getAuthUrl builds the google url', () => {
    expect(getAuthUrl()).toContain('/api/auth/google');
  });
  it('ApiError carries status and name', () => {
    const e = new ApiError(404, 'nope');
    expect(e.status).toBe(404);
    expect(e.name).toBe('ApiError');
    expect(e.message).toBe('nope');
  });
});
