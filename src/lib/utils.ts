import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge learns the named tokens in tailwind.config.js (type, radius, shadow, blur, breakpoint), so text-caption is a size, not a colour. */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["count", "caption", "item", "popup-meta", "popup", "popup-title", "display"], radius: ["popup", "popup-tile", "popup-item"], shadow: ["float"], blur: ["overlay"], breakpoint: ["preview"] } },
});

/** Merge class names with Tailwind conflict resolution (the shadcn `cn` helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
