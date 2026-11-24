/**
 * Colours that are data, not style (TASK-103.5). They stay literal on purpose, so the guard
 * (components/ui/ui-layering.test.ts, DATA_COLOURS) lists this file with the reason for each:
 * no theme or accent change may alter them.
 */

/** Sign-in marks in each provider's own brand colours: their guidelines fix them. */
export const PROVIDER_BRAND = {
  googleBlue: "#4285F4",
  googleGreen: "#34A853",
  googleYellow: "#FBBC05",
  googleRed: "#EA4335",
  gitlab: "#FC6D26",
  discord: "#5865F2",
} as const

/**
 * The colours a space can be given (Settings › Spaces). A space stores the hex itself and it
 * syncs between devices, so a value here must never change or saved spaces lose their colour.
 */
export const SPACE_COLOURS = [
  { name: "Blue", value: "#2274F0" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Cyan", value: "#06b6d4" },
] as const

export type SpaceColourName = (typeof SPACE_COLOURS)[number]["name"]

/** The stored hex of a named space colour. */
export function spaceColour(name: SpaceColourName): string {
  return SPACE_COLOURS.find((c) => c.name === name)!.value
}

/**
 * The accent hue picker (Settings › Theme): a hue is the setting's value, drawn at a fixed
 * saturation and lightness, and the track shows the whole spectrum it picks from.
 */
export function hueColour(hue: number): string {
  return `hsl(${hue} 85% 56%)`
}

export const HUE_SPECTRUM = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map(hueColour).join(", ")})`
