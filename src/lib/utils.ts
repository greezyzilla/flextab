import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge learns the type tokens (tailwind.config.js fontSize), so text-caption is a size, not a colour. */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["count", "caption", "item", "popup-meta", "popup", "popup-title"] } },
});

/** Merge class names with Tailwind conflict resolution (the shadcn `cn` helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
