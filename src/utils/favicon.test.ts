import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chromeFaviconUrl, faviconToDataUrl } from './favicon';

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

const PAGE = 'https://site.example/page';
const CHROME_ICON = 'chrome-extension://test/_favicon/?pageUrl=https%3A%2F%2Fsite.example%2Fpage&size=32';

describe('chromeFaviconUrl', () => {
  it("asks Chrome's favicon cache for web pages only", () => {
    expect(chromeFaviconUrl(PAGE)).toBe(CHROME_ICON);
    expect(chromeFaviconUrl('chrome://settings')).toBeNull();
    expect(chromeFaviconUrl('not a url')).toBeNull();
    expect(chromeFaviconUrl(undefined)).toBeNull();
  });
});

describe('faviconToDataUrl', () => {
  let loaded: string[];
  beforeEach(() => {
    loaded = [];
    const Base = FakeImage;
    vi.stubGlobal('Image', class extends Base { set src(v: string) { loaded.push(v); super.src = v; } get src() { return super.src; } });
  });

  it('returns empty string when the tab has no favicon', async () => {
    expect(await faviconToDataUrl('', PAGE)).toBe('');
    expect(loaded).toEqual([]);
  });

  it('passes data: urls through unchanged', async () => {
    expect(await faviconToDataUrl('data:image/png;base64,x', PAGE)).toBe('data:image/png;base64,x');
  });

  it("converts Chrome's cached icon, never the site's own URL (no CORS request, TASK-52)", async () => {
    expect(await faviconToDataUrl('http://x/favicon.ico', PAGE)).toBe('data:image/webp;base64,CONV');
    expect(loaded).toEqual([CHROME_ICON]);
  });

  it('keeps the URL as it is, without loading it, when there is no web page', async () => {
    expect(await faviconToDataUrl('http://x/favicon.ico')).toBe('http://x/favicon.ico');
    expect(await faviconToDataUrl('http://x/favicon.ico', 'chrome://newtab/')).toBe('http://x/favicon.ico');
    expect(loaded).toEqual([]);
  });

  it('falls back to the url when the image fails to load', async () => {
    (chrome.runtime.getURL as any).mockImplementationOnce(() => 'chrome-extension://test/fail/');
    expect(await faviconToDataUrl('http://x/favicon.ico', PAGE)).toBe('http://x/favicon.ico');
  });

  it('falls back to the url when toDataURL throws', async () => {
    (HTMLCanvasElement.prototype.toDataURL as any).mockImplementation(() => { throw new Error('tainted'); });
    expect(await faviconToDataUrl('http://x/favicon.ico', PAGE)).toBe('http://x/favicon.ico');
  });
});

describe('faviconToDataUrl in a service worker (no Image/DOM)', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', undefined);
  });

  it("converts Chrome's cached icon through fetch + OffscreenCanvas", async () => {
    const close = vi.fn();
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close })));
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() { return { drawImage: vi.fn() }; }
      // jsdom's Blob has no arrayBuffer(); the real service worker's does.
      async convertToBlob() { return { type: 'image/webp', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; }
    });
    expect(await faviconToDataUrl('http://x/favicon.ico', PAGE)).toBe('data:image/webp;base64,AQID');
    expect(fetchMock).toHaveBeenCalledWith(CHROME_ICON);
    expect(close).toHaveBeenCalled();
  });

  it('falls back to the url on a failed response or a decode error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await faviconToDataUrl('http://x/404.ico', PAGE)).toBe('http://x/404.ico');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    expect(await faviconToDataUrl('http://x/err.ico', PAGE)).toBe('http://x/err.ico');
  });
});

describe('favicons in Firefox, which has no _favicon cache (TASK-112)', () => {
  afterEach(() => { delete (chrome.runtime as unknown as Record<string, unknown>).getBrowserInfo })

  it('keeps the tab\'s own favicon URL instead of asking a cache that does not exist', async () => {
    (chrome.runtime as unknown as Record<string, unknown>).getBrowserInfo = vi.fn()
    expect(chromeFaviconUrl('https://example.com/')).toBeNull()
    expect(await faviconToDataUrl('https://example.com/favicon.ico', 'https://example.com/')).toBe('https://example.com/favicon.ico')
  })
})
