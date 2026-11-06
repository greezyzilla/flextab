import { useState } from "react";

// Neutral globe (lucide "globe"): a missing favicon is not an error, so the
// fallback must not look like an alert.
const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'/%3E%3Cpath d='M2 12h20'/%3E%3C/svg%3E";

// Only these schemes are safely renderable as an <img> from the new-tab page.
// chrome://, chrome-extension://, edge://, about:, etc. either error out or get
// blocked by the browser (web_accessible_resources), so we skip them entirely.
function isRenderableFavicon(src?: string): src is string {
  if (!src) return false;
  return /^(https?:|data:)/i.test(src);
}

export function FaviconImg({ src, alt, className = "w-5 h-5" }: { src?: string; alt?: string; className?: string }) {
  const [error, setError] = useState(false);

  const usable = !error && isRenderableFavicon(src);

  return (
    <img
      src={usable ? src : FALLBACK_ICON}
      alt={alt || ""}
      className={className}
      onError={() => setError(true)}
    />
  );
}
