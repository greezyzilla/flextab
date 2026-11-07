module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Routed through a CSS var so the Appearance "Font" setting can swap it
        // globally. Default (Inter stack) lives in style.css :root.
        sans: ['var(--font-sans)'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        // shadcn semantic tokens — all derive from the live --hue / --color-black-*
        // (one source of truth; see style.css). primary/destructive keep an
        // <alpha-value> form so bg-primary/90 etc. still work.
        border: "var(--color-black-700)",
        // Control boundary (inputs, select triggers, switch tracks): ≥3:1, TASK-6.
        input: "var(--border-control)",
        ring: "var(--accent)",
        background: "var(--color-black-900)",
        foreground: "hsl(var(--ink) / 0.92)",
        primary: { DEFAULT: "var(--accent)", foreground: "hsl(0 0% 100%)" },
        secondary: { DEFAULT: "var(--color-black-800)", foreground: "hsl(var(--ink) / 0.88)" },
        destructive: { DEFAULT: "hsl(0 72% 51% / <alpha-value>)", foreground: "hsl(0 0% 100%)" },
        muted: { DEFAULT: "var(--color-black-800)", foreground: "var(--text-tertiary)" },
        // Text tiers (TASK-6, style.css): text-fg / -muted / -subtle / -disabled.
        fg: {
          DEFAULT: "var(--text-primary)",
          muted: "var(--text-secondary)",
          subtle: "var(--text-tertiary)",
          disabled: "var(--text-disabled)",
          accent: "var(--accent-text)",
        },
        control: "var(--border-control)",
        // Ink: the colour that contrasts with the surfaces (white on dark,
        // near-black on light). Hairlines, washes and hover fills use it with
        // an alpha (border-ink/10, bg-ink/[0.03]) so they follow the theme.
        ink: "hsl(var(--ink) / <alpha-value>)",
        // A saved tab row, and the dim behind dialogs / the drawer.
        row: { DEFAULT: "var(--row)", hover: "var(--row-hover)" },
        overlay: { DEFAULT: "var(--overlay)", soft: "var(--overlay-soft)" },
        // Hairline between panels and sections.
        line: "var(--color-line)",
        // Status text. Each theme picks shades that read on its own surfaces.
        danger: { DEFAULT: "rgb(var(--danger) / <alpha-value>)", strong: "rgb(var(--danger-strong) / <alpha-value>)" },
        warning: { DEFAULT: "rgb(var(--warning) / <alpha-value>)", body: "rgb(var(--warning-body) / <alpha-value>)" },
        success: "rgb(var(--success) / <alpha-value>)",
        caution: "rgb(var(--caution) / <alpha-value>)",
        // item-hover surface — lighter than the menu bg so hover reads
        accent: { DEFAULT: "var(--color-black-700)", foreground: "hsl(var(--ink) / 0.92)" },
        // elevated surfaces (menus/dropdowns/tooltips) — LIGHTER than the page base
        popover: { DEFAULT: "var(--color-black-800)", foreground: "hsl(var(--ink) / 0.92)" },
        card: { DEFAULT: "var(--color-black-800)", foreground: "hsl(var(--ink) / 0.92)" },
        'black-50': 'var(--color-black-50)',
        'black-100': 'var(--color-black-100)',
        'black-200': 'var(--color-black-200)',
        'black-300': 'var(--color-black-300)',
        'black-400': 'var(--color-black-400)',
        'black-500': 'var(--color-black-500)',
        'black-600': 'var(--color-black-600)',
        'black-700': 'var(--color-black-700)',
        'black-800': 'var(--color-black-800)',
        'black-900': 'var(--color-black-900)',
        'black-950': 'var(--color-black-950)',
        'black': 'var(--color-black)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
