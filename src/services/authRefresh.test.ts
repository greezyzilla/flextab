import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { apiFetch, clearTokens, loadTokens, pushSync, serveTokenRefresh, SESSION_EXPIRED_KEY } from './api';
import { useAuthStore } from '../store/useAuthStore';
import { getSpaces, setSpaces } from '../lib/yjsDoc';

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
}) as Response;
const expired = () => ({ access_token: 'old', refresh_token: 'refresh-old', expires_at: Date.now() / 1000 - 10 });
const fresh = () => ({ access_token: 'new', refresh_token: 'refresh-new', expires_at: Date.now() / 1000 + 3600 });
let storage: Record<string, any>;
let oldTokens: ReturnType<typeof expired>;
let fetchMock: Mock;

// These cases test the refresh itself, which the background worker performs
// for every context: run as the worker (pages ask it; tokenRefreshOwner.test.ts).
serveTokenRefresh();

beforeEach(async () => {
  vi.clearAllMocks();
  storage = {};
  vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: any) =>
    Object.fromEntries((typeof keys === 'string' ? [keys] : keys ?? Object.keys(storage))
      .filter((key: string) => key in storage).map((key: string) => [key, storage[key]])));
  vi.mocked(chrome.storage.local.set).mockImplementation(async (items) => { Object.assign(storage, items); });
  vi.mocked(chrome.storage.local.remove).mockImplementation(async (keys) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) delete storage[key];
  });
  await clearTokens();
  oldTokens = expired();
  storage.auth_tokens = oldTokens;
  await loadTokens();
  fetchMock = vi.fn();
  global.fetch = fetchMock;
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
});

function expectSessionPreserved() {
  expect(storage.auth_tokens).toEqual(oldTokens);
  expect(storage[SESSION_EXPIRED_KEY]).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain('/api/auth/refresh');
}

describe('refresh failure recovery with real API and auth store', () => {
  it.each([429, 500, 502, 503])('preserves the session on refresh HTTP %i without an anonymous follow-up', async (status) => {
    fetchMock.mockResolvedValueOnce(response({}, status)).mockResolvedValue(response({}, 401));
    await expect(apiFetch('/api/me')).rejects.toMatchObject({ status: 503, retryable: true });
    expectSessionPreserved();
  });

  it.each([new TypeError('Failed to fetch'), new DOMException('Timed out', 'AbortError')])(
    'preserves the session on a rejected refresh: %s', async (error) => {
      fetchMock.mockRejectedValueOnce(error).mockResolvedValue(response({}, 401));
      await expect(apiFetch('/api/me')).rejects.toMatchObject({ status: 503, retryable: true });
      expectSessionPreserved();
    });

  it.each([null, {}, { ...fresh(), refresh_token: '' }, { ...fresh(), expires_at: 1 }])(
    'does not overwrite credentials with an invalid successful response: %j', async (body) => {
      fetchMock.mockResolvedValueOnce(response(body));
      await expect(apiFetch('/api/me')).rejects.toMatchObject({ status: 503, retryable: true });
      expectSessionPreserved();
    });

  it('preserves credentials when refresh JSON cannot be decoded', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Bad JSON'); } });
    await expect(apiFetch('/api/me')).rejects.toMatchObject({ status: 503, retryable: true });
    expectSessionPreserved();
  });

  it('retries after an outage and sends the protected request with fresh credentials', async () => {
    const next = fresh();
    fetchMock.mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response(next)).mockResolvedValueOnce(response({ id: 'user' }));
    await expect(apiFetch('/api/me')).rejects.toMatchObject({ retryable: true });
    await expect(apiFetch('/api/me')).resolves.toEqual({ id: 'user' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).refresh_token).toBe(oldTokens.refresh_token);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
    expect(storage.auth_tokens).toEqual(next);
    expect(storage[SESSION_EXPIRED_KEY]).toBeUndefined();
  });

  it('shares a failed refresh between concurrent requests and allows a later retry', async () => {
    let finish!: (res: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const settled = Promise.allSettled([apiFetch('/api/me'), apiFetch('/api/sync')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(response({}, 503));
    for (const result of await settled) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ retryable: true });
    }
    expectSessionPreserved();
    fetchMock.mockResolvedValueOnce(response(fresh())).mockResolvedValueOnce(response({ ok: true }));
    await expect(apiFetch('/api/me')).resolves.toEqual({ ok: true });
  });

  it('does not expire the session when a sibling-token storage read fails after refresh 401', async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('Storage unavailable'));
    fetchMock.mockResolvedValueOnce(response({}, 401));
    await expect(apiFetch('/api/me')).rejects.toMatchObject({ retryable: true });
    expectSessionPreserved();
    fetchMock.mockResolvedValueOnce(response(fresh())).mockResolvedValueOnce(response({ ok: true }));
    await expect(apiFetch('/api/me')).resolves.toEqual({ ok: true });
  });

  it('keeps initialization authenticated and the local workspace intact during a refresh outage', async () => {
    setSpaces([{ id: 'local-space', name: 'Unsynced work', projects: [{
      id: 'project', name: 'Research', categories: [{
        id: 'category', name: 'Reading', groups: [{
          id: 'group', name: 'Pending tabs', tabs: [{
            id: 'tab', title: 'Unsynced tab', url: 'https://example.com', favicon: '',
          }],
        }],
      }],
    }] }]);
    storage.spaces = getSpaces();
    const workspace = getSpaces();
    fetchMock.mockResolvedValueOnce(response({}, 503)).mockResolvedValue(response({}, 401));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, isLoading: false });
    expect(getSpaces()).toEqual(workspace);
    expect(storage.spaces).toEqual(workspace);
    expectSessionPreserved();
  });

  it('returns a sync error without sending a PUT or discarding saved credentials', async () => {
    fetchMock.mockResolvedValueOnce(response({}, 503));
    await expect(pushSync([{ id: 'pending-work' }], 4)).resolves.toEqual({ status: 'error' });
    expectSessionPreserved();
  });

  it('still signs out on an explicit refresh rejection with no sibling rotation', async () => {
    fetchMock.mockResolvedValue(response({}, 401));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, isLoading: false });
    expect(storage.auth_tokens).toBeUndefined();
    expect(storage[SESSION_EXPIRED_KEY]).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
