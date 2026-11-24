# UI layering

`src/components/ui/ui-layering.test.ts` fails when a look bypasses the chain below. No call site
styles a shared component, writes a raw value or renders a native control.

## The rule

Every look flows one way:

1. **Token.** Colours, type sizes, radii, spacing and breakpoints are named in `style.css`
   (`@theme` and the `--sc-` layer) and `tailwind.config.js`. No other file writes a raw value.
2. **Shared component.** `src/components/ui/*` (the shadcn/Radix layer) turns tokens into
   components. It is the only place that styles a native control.
3. **Variant.** A different look is a variant or prop of that component (`variant="link"`,
   `size="inline"`, `size="sm"` on `Icon`), so every use changes together.

A call site only **places** a component. It never styles it.

## What a call site may pass

`className` on a shared component may carry placement only: how the component sits in its
parent.

| Allowed | Classes |
|---|---|
| Flex or grid item behaviour | `flex-1`, `flex-auto`, `flex-none`, `grow`, `shrink`, `shrink-0`, `basis-*`, `min-w-0`, `min-h-0` |
| Alignment and order | `self-*`, `justify-self-*`, `place-self-*`, `order-*` |
| Grid position | `col-span-*`, `col-start-*`, `row-span-*`, ... |
| Positioning | `relative`, `absolute`, `sticky`, `inset-*`, `top-*`, `left-*`, `z-*` |
| Hooks for children | `group`, `peer` |
| A cap in % of the parent | `max-w-[40%]`: how much of its row it may take (a fixed cap such as `max-w-[12rem]` is a look) |

Everything else is a look and belongs in the component. That includes three cases that are easy to
mistake for placement:

- **Filling the width** (`w-full`) is the component's decision: a prop (`fullWidth` on `Button`) or
  its default (`Input` and `Select` already fill their container).
- **Margins** (`mt-2`, `-mx-1`) are not allowed. The parent spaces its children with `gap`, so a
  component keeps no spacing that only fits one place.
- **Fixed sizes** (`h-7`, `h-9 w-9`, `w-72`) are a size variant.

`Icon` keeps its exception from [icon-standard.md](icon-standard.md): the call site may set its
colour, rotation and spin, never its size or stroke.

## Raw values

A `.ts` or `.tsx` outside `components/ui` writes no raw value: no hex, `rgb()`, `hsl()` or `oklch()` colour,
and no arbitrary px, type size or radius (`py-[11px]`, `text-[15px]`, `rounded-[10px]`,
`min-[1440px]:`). Name the value as a token, or use the component that owns it. Token references
(`bg-ink/[0.06]`, `text-[var(--accent)]`, `oklch(from var(--fg) ...)`) are fine.

## Named tokens

`tailwind.config.js` names the values that are not on Tailwind's scale:

| Kind | Tokens |
|---|---|
| Type (size with its own line height) | `text-count` 10/15, `text-caption` 11/16, `text-item` 13/20, `text-popup-meta` 13/18, `text-popup` 15/22, `text-popup-title` 19/24, `text-display` 3.25rem/1.02 |
| Radius (the popup's own scale; it does not follow Roundness) | `rounded-popup` 14, `rounded-popup-tile` 13, `rounded-popup-item` 10 |
| One-off geometry | `preview:` (1440px breakpoint), `min-h-group-head`, `max-h-popup-list`, `shadow-float`, `backdrop-blur-overlay` |

A type token carries its line height, so no text inherits one by accident. Name a token by role,
and check it does not collide with a colour name (`row` is a colour, so `text-row` would also
paint the text). When you add a token, add its name to `extendTailwindMerge` in
`src/lib/utils.ts`, or `cn()` reads `text-caption` as a colour and drops `text-fg-*`
(`src/lib/cn-type-tokens.test.ts` checks the type list).

## Data colours

Some colours are data, not style, and stay literal on purpose: the provider brand colours on
sign-in, the space colours (a space stores and syncs the hex), the accent hue picker's spectrum.
They live only in `src/lib/data-colours.ts`, each with its reason. The browser toolbar icon's badge
is data too: `src/services/toolbarMarks.ts` draws it on a canvas outside any page, where CSS tokens
do not exist. The guard lists both files in `DATA_COLOURS` with their reasons and skips them. A
theme or accent change must never alter these colours.

## Native controls

`<button>`, `<input>`, `<select>` and `<textarea>` appear only inside `components/ui`. Elsewhere,
use the shared component. An input nobody sees (a file picker with `hidden`, a radio with `sr-only`
under a styled label, `type="hidden"`) carries no look and is allowed.

## The guard

`ui-layering.test.ts` parses every `.ts` and `.tsx` outside `components/ui` (tests excepted) with the
TypeScript compiler and reads every `className`, including `cn(...)`, conditions and template
strings, and every other string for raw values. It fails with the
file, line and class of each new finding.

Findings allowed to remain sit in `DEBT`, with an exact count per file. The table is empty and
only shrinks:

- a new finding fails, even in a file that already has entries;
- a cleared finding whose entry was not lowered fails as stale, so a cleaned file cannot get dirty
  again.

When a change cleans a file, lower or remove its entry in the same change.
