const FAVICON_SIZE = 16;

export function faviconToDataUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url || url.startsWith('data:')) { resolve(url || ''); return; }
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
