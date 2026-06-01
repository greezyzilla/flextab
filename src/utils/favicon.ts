export function faviconToDataUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url || url.startsWith('data:')) { resolve(url || ''); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 16;
      canvas.height = img.height || 16;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      try { resolve(canvas.toDataURL('image/png')); } catch (_) { resolve(url); }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}
