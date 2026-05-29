import { useState } from "react";

const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 8v4m0 4h.01'/%3E%3C/svg%3E";

export function FaviconImg({ src, alt, className = "w-5 h-5" }: { src?: string; alt?: string; className?: string }) {
  const [error, setError] = useState(false);

  return (
    <img
      src={error || !src ? FALLBACK_ICON : src}
      alt={alt || ""}
      className={className}
      onError={() => setError(true)}
    />
  );
}
