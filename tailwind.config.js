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
        // shadcn semantic tokens (mapped to --sc-* in style.css)
        border: "hsl(var(--sc-border))",
        input: "hsl(var(--sc-input))",
        ring: "hsl(var(--sc-ring))",
        background: "hsl(var(--sc-background))",
        foreground: "hsl(var(--sc-foreground))",
        primary: { DEFAULT: "hsl(var(--sc-primary))", foreground: "hsl(var(--sc-primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--sc-secondary))", foreground: "hsl(var(--sc-secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--sc-destructive))", foreground: "hsl(var(--sc-destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--sc-muted))", foreground: "hsl(var(--sc-muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--sc-accent))", foreground: "hsl(var(--sc-accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--sc-popover))", foreground: "hsl(var(--sc-popover-foreground))" },
        card: { DEFAULT: "hsl(var(--sc-card))", foreground: "hsl(var(--sc-card-foreground))" },
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
