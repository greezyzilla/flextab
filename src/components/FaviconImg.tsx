import { useState } from "react";

const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 8v4m0 4h.01'/%3E%3C/svg%3E";

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
