# UI layering

Status: **guarded** (2026-11-22, TASK-103.1). `src/components/ui/ui-layering.test.ts` fails when a
look bypasses the chain below. The cleanup that follows is TASK-103.2 to 103.6.

## The rule

Every look flows one way:

1. **Token.** Colours, type sizes, radii, spacing and breakpoints are named in `style.css`
   (`@theme` and the `--sc-` layer). No other file writes a raw value.
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

A `.tsx` outside `components/ui` writes no raw value: no hex, `rgb()`, `hsl()` or `oklch()` colour,
and no arbitrary px, type size or radius (`py-[11px]`, `text-[15px]`, `rounded-[10px]`,
`min-[1440px]:`). Name the value as a token, or use the component that owns it. Token references
(`bg-ink/[0.06]`, `text-[var(--accent)]`, `oklch(from var(--fg) ...)`) are fine.

## Native controls

`<button>`, `<input>`, `<select>` and `<textarea>` appear only inside `components/ui`. Elsewhere,
use the shared component. An input nobody sees (a file picker with `hidden`, a radio with `sr-only`
under a styled label, `type="hidden"`) carries no look and is allowed.

## The guard

`ui-layering.test.ts` parses every `.tsx` outside `components/ui` with the TypeScript compiler and
reads every `className`, including `cn(...)`, conditions and template strings. It fails with the
file, line and class of each new finding.

Findings that existed when the guard landed sit in `DEBT`, grouped by the subtask that clears them,
with an exact count per file. The table only shrinks:

- a new finding fails, even in a file that already has entries;
- a cleared finding whose entry was not lowered fails as stale, so a cleaned file cannot get dirty
  again.

When a subtask cleans a file, lower or remove its entry in the same change.
