# Danger standard

Gate: `src/components/ui/danger-gate.test.ts` fails on a raw red palette class (`text-red-400`,
`hover:bg-rose-500/10`, …), a hard-coded red hex or a `!text-danger` override. Modals link here from
`docs/modal-standard.md` §7.

## 1. When red is allowed

Red means one of two things, and nothing else:

1. **This destroys data** (deletes, removes, replaces, signs out and removes tabs).
2. **Something failed and needs the user** (an error message, an invalid field, a failed sync or
   save, a list that could not load, a quota that is full).

Red is never decoration, never a brand or accent colour, never "important". A routine action that
can be undone or that the server refuses anyway (Unlink, Restore, Remove from a list that keeps a
copy) is **not** red at rest.

Exempt, because it is data and not a signal: the colours a user picks for their own content
(a space's "Red"). Exempt, because CSS tokens do not exist there: the browser toolbar icon's
canvas badge (`services/toolbarMarks.ts`, white on `#dc2626`, 4.8:1).

## 2. Tokens

| Token | What it is for |
|---|---|
| `danger` (`--danger`) | Red text, red borders, red tints (`bg-danger/10`). Light 185 28 28, dark 248 113 113. |
| `danger-strong` | Only the hover of a red link inside red text (Delete account's plan link). |
| `destructive` + `destructive-foreground` | The one solid red fill with white text: a destructive dialog confirm. |

No other red. Warning and nearly-full use `warning` / `caution`, never red.

## 3. One treatment per role

| Role | Primitive | Look | Where today |
|---|---|---|---|
| Confirm a destructive step in a dialog | `ModalFooter primary={{ tone: "destructive" }}` / `ConfirmDialog` | solid `destructive` fill, white text, leading `TriangleAlert`; hover darkens (`brightness-90`) | Delete account, Delete space, Delete group, Sign out + remove tabs, Import "Replace", Sync conflict |
| Open a destructive flow from a page | `<Button variant="danger">` | `danger` text on an 8% tint, `danger/70` border; hover 14% tint, `danger/90` border | "Delete account…", "Delete space…" |
| Destructive item in a menu | `RowActions` item with `danger: true` | `danger` text at rest, `bg-danger/10` on focus; last item, after a separator | Remove / Delete on groups, projects, categories |
| Icon-only destructive button | `<IconButton danger>` | neutral at rest, `danger` (+ `bg-danger/10` on the default variant) on hover | |
| Destructive choice in a dialog | `ModalOptionCard` (no danger look) | never red: chosen = the accent like any choice; its label says what it removes and the destructive primary carries the red (two near-identical reds tell no one anything, and a colour-blind reader gets nothing from them) | Sign out "Remove tabs from this device", Delete account "Remove tabs", Import "Replace", Sync conflict |
| Routine row action | `<Button variant="ghost" size="sm">` | never red | Unlink, Link, Restore, Preview |
| Error message | text `text-danger`, `role="alert"` | `danger` text | sign-in, password, import, dialogs |
| Invalid field | `Input` with `aria-invalid` | `danger` border | every field |
| Failed status | `text-danger` | `danger` text or glyph | Sync error and conflict, popup "refused to store it" |
| A list that could not load | `SettingsList failed={…}` | `TriangleAlert` in `danger` in the state block, Try again | Devices, Version history, Usage, Payment history |
| "Removed" marker in a comparison | `bg-danger/10` + `text-danger` badge, `border-danger/30` panel | | Sync conflict trees |
| Quota full | `UsageMeter` / cap meter | bar in `rgb(var(--danger))`; nearly full uses `rgb(var(--warning))` | Usage, import cap |

## 4. Telling danger from the accent

The accent can itself be red (Accent hue presets). Danger never relies on hue alone:
- the dialog confirm carries `TriangleAlert`, so a primary that turns destructive shows it even on a
  red accent;
- the page trigger is a tinted outline, never the accent's solid fill;
- a choice in a dialog is never red, so a red accent on it cannot be mistaken for danger; the
  danger shows once, on the destructive primary (red fill + `TriangleAlert`).

## 5. Contrast (worst of accent hues 214 / 0 / 120)

Text >= 4.5:1, shapes and borders >= 3:1, hover included.

| Role | Dark | Light |
|---|---|---|
| Error text on the page / on a tile | 7.02 / 6.63 | 6.04 / 6.47 |
| Menu item text on the menu / on its focus tint | 5.88 / 5.11 | 6.47 / 5.46 |
| Page trigger text, rest / hover | 6.01 / 5.47 | 5.66 / 5.09 |
| Page trigger border, rest / hover | 3.81 / 5.57 | 3.84 / 5.59 |
| Dialog confirm, white on red, rest / hover | 4.80 / 5.71 | 4.80 / 5.71 |
| Dialog confirm against the dialog | 3.39 | 4.80 |
| Invalid field border | 7.02 | 6.04 |

## 6. Adding a new red

Pick the role from §3 and use its primitive. If none fits, the need is either not danger (use
neutral, `warning` or `caution`) or a new role, which is added here, with its measurement, before
it is built.
