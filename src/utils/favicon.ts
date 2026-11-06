const FAVICON_SIZE = 16;

/**
 * Shrink a favicon to a small webp data URL so it syncs cheaply. Works in a
 * page (Image + <canvas>) and in the background service worker, which has no
 * DOM (fetch + createImageBitmap + OffscreenCanvas), because tabs can now be
 * captured from both (TASK-2). Any failure falls back to the original URL.
 */
export function faviconToDataUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return Promise.resolve(url || '');
  return typeof Image === 'undefined' ? workerFaviconToDataUrl(url) : pageFaviconToDataUrl(url);
}

function pageFaviconToDataUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = FAVICON_SIZE;
      canvas.height = FAVICON_SIZE;
      canvas.getContext('2d')!.drawImage(img, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
      try { resolve(canvas.toDataURL('image/webp', 0.8)); } catch (_) { resolve(url); }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

async function workerFaviconToDataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) return url;
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
    return url;
  }
}
