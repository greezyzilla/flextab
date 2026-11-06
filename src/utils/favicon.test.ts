import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { faviconToDataUrl } from './favicon';

class FakeImage {
  crossOrigin = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  set src(v: string) {
    this._src = v;
    queueMicrotask(() => { if (v.includes('fail')) this.onerror?.(); else this.onload?.(); });
  }
  get src() { return this._src; }
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
  (HTMLCanvasElement.prototype as any).getContext = vi.fn(() => ({ drawImage: vi.fn() }));
  (HTMLCanvasElement.prototype as any).toDataURL = vi.fn(() => 'data:image/webp;base64,CONV');
});
afterEach(() => vi.unstubAllGlobals());

describe('faviconToDataUrl', () => {
  it('returns empty string for empty input', async () => {
    expect(await faviconToDataUrl('')).toBe('');
  });

  it('passes data: urls through unchanged', async () => {
    expect(await faviconToDataUrl('data:image/png;base64,x')).toBe('data:image/png;base64,x');
  });

  it('converts a loaded image to a webp data url', async () => {
    expect(await faviconToDataUrl('http://x/favicon.ico')).toBe('data:image/webp;base64,CONV');
  });

  it('falls back to the url when the image fails to load', async () => {
    expect(await faviconToDataUrl('http://x/fail.ico')).toBe('http://x/fail.ico');
  });

  it('falls back to the url when toDataURL throws (tainted canvas)', async () => {
    (HTMLCanvasElement.prototype.toDataURL as any).mockImplementation(() => { throw new Error('tainted'); });
    expect(await faviconToDataUrl('http://x/favicon.ico')).toBe('http://x/favicon.ico');
  });
});

describe('faviconToDataUrl in a service worker (no Image/DOM)', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', undefined);
  });

  it('converts through fetch + OffscreenCanvas', async () => {
    const close = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })));
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close })));
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return { drawImage: vi.fn() }; }
      // jsdom's Blob has no arrayBuffer(); the real service worker's does.
      async convertToBlob() { return { type: 'image/webp', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; }
    });
    expect(await faviconToDataUrl('http://x/favicon.ico')).toBe('data:image/webp;base64,AQID');
    expect(close).toHaveBeenCalled();
  });

  it('falls back to the url on a failed response or a decode error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await faviconToDataUrl('http://x/404.ico')).toBe('http://x/404.ico');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('cors'); }));
    expect(await faviconToDataUrl('http://x/cors.ico')).toBe('http://x/cors.ico');
  });
});
