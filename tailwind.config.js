module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
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
        input: "var(--color-black-700)",
        ring: "var(--accent)",
        background: "var(--color-black-900)",
        foreground: "hsl(0 0% 100% / 0.92)",
        primary: { DEFAULT: "var(--accent)", foreground: "hsl(0 0% 100%)" },
        secondary: { DEFAULT: "var(--color-black-800)", foreground: "hsl(0 0% 100% / 0.88)" },
        destructive: { DEFAULT: "hsl(0 72% 51% / <alpha-value>)", foreground: "hsl(0 0% 100%)" },
        muted: { DEFAULT: "var(--color-black-800)", foreground: "hsl(0 0% 100% / 0.5)" },
        // item-hover surface — lighter than the menu bg so hover reads
        accent: { DEFAULT: "var(--color-black-700)", foreground: "hsl(0 0% 100% / 0.92)" },
        // elevated surfaces (menus/dropdowns/tooltips) — LIGHTER than the page base
        popover: { DEFAULT: "var(--color-black-800)", foreground: "hsl(0 0% 100% / 0.92)" },
        card: { DEFAULT: "var(--color-black-800)", foreground: "hsl(0 0% 100% / 0.92)" },
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
