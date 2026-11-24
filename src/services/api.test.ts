import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  apiFetch, pushSync, fetchSyncRevision, apiLogin, apiChangePassword,
  getAuthUrl, getDeviceId, loadTokens, saveTokens, clearTokens, ApiError, RefreshUnavailableError,
  waitForTokenRefresh, getOAuthUrl, apiGetAuthProviders, apiGetSignInOptions, apiRegister, apiResendVerification,
  apiForgotPassword, apiUpdateProfile, apiListIdentities, apiUnbindIdentity, apiGetBindUrl, apiGetPlan,
  apiGetCheckoutUrl, apiGetTransactions, apiGetSettings, apiPutSettings, apiLogout,
} from './api';
import { onServerReachable, isServerAnswer, noteServerResponse } from './serverReachable';

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
    vi.mocked(global.fetch).mockResolvedValue(new Response('not json', { status: 503, statusText: 'Unavailable' }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ message: 'Unavailable' });
  });

  it('waitForTokenRefresh resolves at once with no refresh, and after a refresh stored its pair (TASK-113)', async () => {
    await waitForTokenRefresh();
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    let answer!: (r: Response) => void;
    (global.fetch as any)
      .mockImplementationOnce(() => new Promise<Response>((r) => { answer = r; }))
      .mockResolvedValueOnce(res({ ok: true }));
    const request = apiFetch('/x');
    await new Promise((r) => setTimeout(r, 0));
    let done = false;
    const waited = waitForTokenRefresh().then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false);
    answer(res({ access_token: 'new', refresh_token: 'rt2', expires_at: future() }));
    await waited;
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ auth_tokens: expect.objectContaining({ refresh_token: 'rt2' }) });
    await request;
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

  it('a failed refresh (401) clears tokens and stops before the protected request', async () => {
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    (global.fetch as any)
      .mockResolvedValueOnce(res({}, 401)) // refresh fails
      .mockResolvedValueOnce(res({ ok: true }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(RefreshUnavailableError);
    expect(chrome.storage.local.remove).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a network failure aborts the request with a retryable error', async () => {
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    (global.fetch as any).mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(res({ ok: true }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 503, retryable: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('an expired token without a refresh token cannot send a protected request', async () => {
    await saveTokens({ access_token: 'old', refresh_token: '', expires_at: past() });
    (global.fetch as any).mockResolvedValue(res({ ok: true }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('pushSync', () => {
  it('does not upload when Off is selected during token refresh', async () => {
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    let finish!: (response: Response) => void;
    (global.fetch as any).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let allowed = true;
    const request = pushSync([{ id: 's' }], 1, async () => allowed);
    for (let i = 0; i < 20 && !finish; i++) await Promise.resolve();
    expect(finish).toBeDefined();
    allowed = false;
    finish(res({ access_token: 'new', refresh_token: 'rt2', expires_at: future() }));
    expect(await request).toEqual({ status: 'paused' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as any).mock.calls[0][0]).toContain('/auth/refresh');
  });

  it('checks automatic-sync permission after awaiting token/device work', async () => {
    await validToken();
    const guard = vi.fn(async () => false);
    expect(await pushSync([{ id: 's' }], 1, guard)).toEqual({ status: 'paused' });
    expect(guard).toHaveBeenCalledOnce();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([0, 1])('counts the complete UTF-8 body at 8 MiB + %i bytes before upload', async (extra) => {
    await validToken();
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue(res({ revision: 8 }));
    // Multibyte text and escaped characters distinguish byte count from JS
    // string length or the unescaped workspace's size.
    const spaces = [{ name: '文"\\' }];
    const overhead = new TextEncoder().encode(JSON.stringify({ spaces, base_revision: 7 })).byteLength;
    spaces[0].name += 'x'.repeat(8 * 1024 * 1024 + extra - overhead);
    const result = await pushSync(spaces, 7);
    if (extra === 0) {
      expect(result).toEqual({ status: 'ok', revision: 8 });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const body = (global.fetch as any).mock.calls[0][1].body;
      expect(new TextEncoder().encode(body).byteLength).toBe(8 * 1024 * 1024);
      expect(JSON.parse(body).spaces).toEqual(spaces);
    } else {
      expect(result).toEqual({ status: 'limit', message: 'Sync payload is too large. Reduce it to 8 MiB or less.' });
      expect(global.fetch).not.toHaveBeenCalled();
    }
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
  it('reports a structured HTTP 413 as a terminal limit and keeps the session', async () => {
    await validToken();
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue(res({ code: 'payload_too_large', error: 'Reduce the sync payload to 8 MiB or less.' }, 413));
    expect(await pushSync([], 7)).toEqual({ status: 'limit', message: 'Reduce the sync payload to 8 MiB or less.' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
  it.each([null, {}, { error: '' }, { error: 42 }, { error: '  ' }])('uses an actionable fallback for a bare 413 (%j)', async (body) => {
    await validToken();
    (global.fetch as any).mockResolvedValue(res(body, 413));
    expect(await pushSync([], 7)).toEqual({ status: 'limit', message: 'Sync payload is too large for the server. Reduce the workspace size and try again.' });
  });
  it('handles an HTML/plain-text ingress 413 as a terminal limit', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValue({ status: 413, ok: false, json: async () => { throw new SyntaxError('HTML response'); } });
    expect(await pushSync([], 7)).toMatchObject({ status: 'limit', message: expect.stringContaining('too large') });
  });
  it('keeps structured plan quota errors distinct from other forbidden responses', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce(res({ code: 'plan_limit_exceeded', error: 'Sync size limit reached' }, 403));
    expect(await pushSync([], 7)).toEqual({ status: 'limit', message: 'Sync size limit reached' });
    (global.fetch as any).mockResolvedValueOnce(res({ error: 'Forbidden' }, 403));
    expect(await pushSync([], 7)).toEqual({ status: 'error' });
  });
  it('carries which cap a plan limit hit and by how much (TASK-9)', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce(res({ code: 'plan_limit_exceeded', error: 'total tab limit reached (190/150) on the free plan', limit: 'max_tabs_total', cap: 150, got: 190 }, 403));
    expect(await pushSync([], 7)).toEqual({ status: 'limit', message: 'total tab limit reached (190/150) on the free plan', limit: 'max_tabs_total', cap: 150, got: 190 });
  });
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

describe('server reachable signal (TASK-63)', () => {
  it('reports every API answer below 500 from apiFetch, refresh and pushSync', async () => {
    const heard = vi.fn();
    const stop = onServerReachable(heard);
    try {
      await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
      (global.fetch as any)
        .mockResolvedValueOnce(res({ access_token: 'new', refresh_token: 'rt2', expires_at: future() }))
        .mockResolvedValueOnce(res({ error: 'nope' }, 404));
      await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
      expect(heard).toHaveBeenCalledTimes(2); // refresh 200 + the request's 404
      (global.fetch as any).mockResolvedValueOnce(res({ revision: 3 }));
      await pushSync([], 2);
      expect(heard).toHaveBeenCalledTimes(3);
      (global.fetch as any).mockResolvedValueOnce(res({}, 502)).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await pushSync([], 2);
      await pushSync([], 2);
      expect(heard).toHaveBeenCalledTimes(3); // a gateway error or no answer proves nothing
    } finally { stop(); }
  });

  it('stops after unsubscribe and survives a throwing listener', () => {
    const bad = vi.fn(() => { throw new Error('x'); });
    const good = vi.fn();
    const stopBad = onServerReachable(bad);
    const stopGood = onServerReachable(good);
    expect(() => noteServerResponse(200)).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
    stopBad(); stopGood();
    noteServerResponse(200);
    expect(bad).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledOnce();
  });

  it('counts only real API statuses', () => {
    expect([0, 200, 401, 499, 500, 503].map(isServerAnswer)).toEqual([false, true, true, true, false, false]);
  });
});

// TASK-67: the upload that carries a conflict resolution says so, and the mark
// only clears once that upload has landed.
describe('pushSync resolution mark', () => {
  const stored = (mark: unknown) => (chrome.storage.local.get as any).mockImplementation(async (key: string) =>
    key === 'flextab_resolution_push' && mark !== undefined ? { flextab_resolution_push: mark } : {});
  const sentBody = () => JSON.parse((global.fetch as any).mock.calls[0][1].body);

  it('sends resolution: true while a mark is pending, and clears that mark after a 200', async () => {
    await validToken();
    vi.clearAllMocks();
    stored(42);
    (global.fetch as any).mockResolvedValue(res({ revision: 8 }));
    expect(await pushSync([{ id: 's' }], 7)).toEqual({ status: 'ok', revision: 8 });
    expect(sentBody()).toEqual({ spaces: [{ id: 's' }], base_revision: 7, resolution: true });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('flextab_resolution_push');
  });

  it('keeps the body as before when no mark is pending', async () => {
    await validToken();
    vi.clearAllMocks();
    stored(undefined);
    (global.fetch as any).mockResolvedValue(res({ revision: 8 }));
    await pushSync([{ id: 's' }], 7);
    expect(sentBody()).toEqual({ spaces: [{ id: 's' }], base_revision: 7 });
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it.each([
    ['a 409', 409, { revision: 9, spaces: [] }],
    ['a server error', 500, {}],
  ])('keeps the mark after %s, so the retry still carries it', async (_label, status, body) => {
    await validToken();
    vi.clearAllMocks();
    stored(42);
    (global.fetch as any).mockResolvedValue(res(body, status));
    await pushSync([{ id: 's' }], 7);
    expect(sentBody().resolution).toBe(true);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('leaves a newer mark set while the push was in flight', async () => {
    await validToken();
    vi.clearAllMocks();
    let mark = 42;
    (chrome.storage.local.get as any).mockImplementation(async (key: string) =>
      key === 'flextab_resolution_push' ? { flextab_resolution_push: mark } : {});
    (global.fetch as any).mockImplementation(async () => { mark = 43; return res({ revision: 8 }); });
    await pushSync([{ id: 's' }], 7);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
});

describe('endpoint contracts the BE answers (coverage gate)', () => {
  const call = (i = 0) => {
    const [url, opts = {}] = (global.fetch as any).mock.calls[i];
    return { path: String(url).replace(/^https?:\/\/[^/]+/, ''), method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : undefined, headers: opts.headers ?? {} };
  };

  it('builds the OAuth sign-in URL per provider', () => {
    expect(getOAuthUrl('github')).toMatch(/\/api\/auth\/github$/);
  });

  it('reads the sign-in options, with safe defaults for a bare answer', async () => {
    (global.fetch as any).mockResolvedValueOnce(res({ providers: ['google', 'github'], email_signup: true }));
    expect(await apiGetSignInOptions()).toEqual({ providers: ['google', 'github'], emailSignup: true });
    (global.fetch as any).mockResolvedValueOnce(res({}));
    expect(await apiGetSignInOptions()).toEqual({ providers: [], emailSignup: false });
    (global.fetch as any).mockResolvedValueOnce(res({ providers: ['google'] }));
    expect(await apiGetAuthProviders()).toEqual(['google']);
    (global.fetch as any).mockResolvedValueOnce(res({}));
    expect(await apiGetAuthProviders()).toEqual([]);
    expect(call().path).toBe('/api/auth/providers');
  });

  it.each([
    ['apiRegister', () => apiRegister('a@b.c', 'pw'), '/api/auth/register', { email: 'a@b.c', password: 'pw' }],
    ['apiResendVerification', () => apiResendVerification('a@b.c'), '/api/auth/verification/resend', { email: 'a@b.c' }],
    ['apiForgotPassword', () => apiForgotPassword('a@b.c'), '/api/auth/password/forgot', { email: 'a@b.c' }],
  ])('%s posts to its public endpoint without a token', async (_, run, path, body) => {
    (global.fetch as any).mockResolvedValueOnce(res({ status: 'sent' }));
    expect(await run()).toEqual({ status: 'sent' });
    expect(call()).toMatchObject({ path, method: 'POST', body });
    expect(call().headers.Authorization).toBeUndefined();
  });

  it('keeps the server code and wait time when a public auth call is refused', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many', headers: new Headers({ 'Retry-After': '30' }), json: async () => ({ error: 'Slow down', code: 'rate_limited' }) });
    await expect(apiRegister('a@b.c', 'pw')).rejects.toMatchObject({ status: 429, message: 'Slow down', code: 'rate_limited', retryAfter: 30 });
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 400, statusText: 'Bad Request', headers: new Headers(), json: async () => null });
    await expect(apiForgotPassword('x')).rejects.toMatchObject({ status: 400, message: 'Bad Request', retryAfter: undefined });
  });

  it.each([
    ['apiUpdateProfile', () => apiUpdateProfile('Ana'), {}, '/api/me', 'PATCH', { name: 'Ana' }, undefined],
    ['apiListIdentities', () => apiListIdentities(), { identities: [], has_password: true }, '/api/me/identities', 'GET', undefined, { identities: [], has_password: true }],
    ['apiUnbindIdentity', () => apiUnbindIdentity('github'), {}, '/api/me/identities/github', 'DELETE', undefined, undefined],
    ['apiGetBindUrl', () => apiGetBindUrl('github'), { url: 'https://bind' }, '/api/auth/github/bind', 'GET', undefined, 'https://bind'],
    ['apiGetPlan', () => apiGetPlan(), { plan: 'free' }, '/api/plan', 'GET', undefined, { plan: 'free' }],
    ['apiGetCheckoutUrl', () => apiGetCheckoutUrl(), { url: 'https://pay' }, '/api/billing/checkout', 'POST', { plan: 'pro' }, 'https://pay'],
    ['apiGetCheckoutUrl plus', () => apiGetCheckoutUrl('plus'), { url: 'https://pay' }, '/api/billing/checkout', 'POST', { plan: 'plus' }, 'https://pay'],
    ['apiGetTransactions', () => apiGetTransactions(), { transactions: [{ id: 't' }] }, '/api/billing/transactions', 'GET', undefined, [{ id: 't' }]],
    ['apiGetTransactions bare', () => apiGetTransactions(), {}, '/api/billing/transactions', 'GET', undefined, []],
    ['apiGetSettings', () => apiGetSettings(), { hue: 30 }, '/api/settings', 'GET', undefined, { hue: 30 }],
    ['apiPutSettings', () => apiPutSettings({ hue: 30 }), {}, '/api/settings', 'PUT', { hue: 30 }, undefined],
  ])('%s calls its signed-in endpoint', async (_, run, answer, path, method, body, result) => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce(res(answer));
    expect(await run()).toEqual(result);
    expect(call()).toMatchObject({ path, method, ...(body ? { body } : {}) });
    expect(call().headers.Authorization).toBe('Bearer tok');
  });
});

describe('answers with an empty (null) JSON body', () => {
  const nullBody = (status: number) => ({ ok: status < 300, status, statusText: 'Status text', headers: new Headers(), json: async () => null } as unknown as Response);

  it('apiFetch falls back to the status text', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce(nullBody(500));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 500, message: 'Status text' });
  });

  it('apiLogin falls back to the status text', async () => {
    (global.fetch as any).mockResolvedValueOnce(nullBody(400));
    await expect(apiLogin('e', 'p')).rejects.toMatchObject({ status: 400, message: 'Status text' });
  });

  it('pushSync without a base revision: conflict at 0, ok at 1, a bare forbidden is an error', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce(nullBody(409));
    expect(await pushSync([], null as unknown as number)).toEqual({ status: 'conflict', revision: 0, spaces: [] });
    (global.fetch as any).mockResolvedValueOnce(nullBody(200));
    expect(await pushSync([], null as unknown as number)).toEqual({ status: 'ok', revision: 1 });
    (global.fetch as any).mockResolvedValueOnce(nullBody(403));
    expect(await pushSync([], 1)).toEqual({ status: 'error' });
  });

  it('pushSync names a plan limit even when the server sends no message', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce(res({ code: 'plan_limit_exceeded' }, 403));
    expect(await pushSync([], 1)).toEqual({ status: 'limit', message: 'Plan limit reached', limit: undefined, cap: undefined, got: undefined });
  });
});

describe('sign-out and session expiry edges', () => {
  it('apiLogout does nothing without a session and ignores being offline', async () => {
    await apiLogout();
    expect(global.fetch).not.toHaveBeenCalled();
    await validToken();
    (global.fetch as any).mockRejectedValueOnce(new Error('offline'));
    await expect(apiLogout()).resolves.toBeUndefined();
    expect((global.fetch as any).mock.calls[0][0]).toContain('/api/auth/logout');
  });

  it('a refused refresh still signs out when the expiry note cannot be written', async () => {
    await saveTokens({ access_token: 'old', refresh_token: 'rt', expires_at: past() });
    (chrome.storage.local.set as any).mockRejectedValueOnce(new Error('disk'));
    (global.fetch as any).mockResolvedValueOnce(res({}, 401));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 401 });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('auth_tokens');
  });
});

describe('a version the server no longer takes (TASK-114)', () => {
  it('pauses a push on 426, so its pending flag stays until the update', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce({ ...res({ code: 'client_too_old', min_version: '0.2.0' }, 426), clone: () => res({ code: 'client_too_old', min_version: '0.2.0' }, 426) });
    expect(await pushSync([], 1)).toEqual({ status: 'paused' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ flextab_update_required: { minVersion: '0.2.0', at: expect.any(Number) } });
  });

  it('carries the server code on an apiFetch error', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce({ ...res({ code: 'client_too_old', error: 'Update FlexTab' }, 426), clone: () => res({}, 426) });
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 426, code: 'client_too_old', message: 'Update FlexTab' });
  });

  it('sends the client version and channel with every request', async () => {
    await validToken();
    (global.fetch as any).mockResolvedValueOnce(res({ ok: true }));
    await apiFetch('/x');
    expect((global.fetch as any).mock.calls[0][1].headers).toMatchObject({ 'X-Client-Version': expect.any(String), 'X-Client-Channel': 'dev' });
  });
});
