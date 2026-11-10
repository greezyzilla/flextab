const FAVICON_SIZE = 16;

/**
 * Shrink a tab's favicon to a small webp data URL so it syncs cheaply and shows
 * offline. The pixels come from Chrome's own favicon cache (`_favicon/`, behind
 * the `favicon` permission), which is same-origin for the extension: no request
 * to the site, no CORS check, so nothing is logged for sites that send no CORS
 * headers (TASK-52). Works in a page (Image + <canvas>) and in the background
 * service worker, which has no DOM (fetch + createImageBitmap + OffscreenCanvas),
 * because tabs can be captured from both (TASK-2). Without a page URL, or if
 * anything fails, the original favicon URL is kept as it is, never fetched.
 */
export function faviconToDataUrl(favIconUrl: string, pageUrl?: string): Promise<string> {
  if (!favIconUrl || favIconUrl.startsWith('data:')) return Promise.resolve(favIconUrl || '');
  const source = chromeFaviconUrl(pageUrl);
  if (!source) return Promise.resolve(favIconUrl);
  return typeof Image === 'undefined' ? workerFaviconToDataUrl(source, favIconUrl) : pageFaviconToDataUrl(source, favIconUrl);
}

/** Chrome's cached icon for a web page, or null when there is no web page to ask about. */
export function chromeFaviconUrl(pageUrl: string | undefined): string | null {
  if (!pageUrl) return null;
  try {
    const { protocol } = new URL(pageUrl);
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    const url = new URL(chrome.runtime.getURL('_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', String(FAVICON_SIZE * 2));
    return url.toString();
  } catch (_) {
    return null;
  }
}

function pageFaviconToDataUrl(source: string, fallback: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = FAVICON_SIZE;
      canvas.height = FAVICON_SIZE;
      canvas.getContext('2d')!.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
      try { resolve(canvas.toDataURL('image/webp', 0.8)); } catch (_) { resolve(fallback); }
    };
    img.onerror = () => resolve(fallback);
    img.src = source;
  });
}

async function workerFaviconToDataUrl(source: string, fallback: string): Promise<string> {
  try {
    const response = await fetch(source);
    if (!response.ok) return fallback;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(FAVICON_SIZE, FAVICON_SIZE);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return `data:${blob.type};base64,${btoa(binary)}`;
  } catch (_) {
    return fallback;
  }
}
