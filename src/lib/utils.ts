import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge learns the type and radius tokens (tailwind.config.js fontSize, borderRadius), so text-caption is a size, not a colour. */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["count", "caption", "item", "popup-meta", "popup", "popup-title"], radius: ["popup", "popup-tile", "popup-item"] } },
});

/** Merge class names with Tailwind conflict resolution (the shadcn `cn` helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
