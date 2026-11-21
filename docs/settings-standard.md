# Settings standard (TASK-84)

Settings is one product surface. Every sub-setting speaks the same design
language, so a user who learned one page reads every other page without
learning anything new. A new need changes values inside this standard; it never
adds a part. `src/components/settings/settings-standard.test.ts` enforces it.

## Pages

- The nav (left panel) has three headed groups of three pages:
  Workspace (Spaces, Saving & opening, Sync & backup), Appearance (Theme,
  Display, Layout), Account (Profile, Sign-in & security, Plan & billing).
  Every page is one job; no row stands outside a group; no page has sub-tabs.
- A guest has no account pages: `ACCOUNT_ONLY` in `types.ts` removes them from
  the nav and the narrow selector, and a link to one lands on Theme. One list
  decides this for the nav, the selector and routing alike.
- The header of every page holds only the page title (24px, on the baseline of
  the panel's "Settings"). No page has header actions.
- A page is a stack of section cards, 40px apart (`SettingsPage`).

## The parts (`src/components/settings/shared.tsx`)

| Part | What it is for | Shape |
| --- | --- | --- |
| `SettingsSection` | a group of related things | one group card (`rounded-card`, border ink/8, fill ink/1.5, padding `--density-p-group`) with its header inside: a 40px ink/8 box holding the section's glyph, the title (16px semibold) and one subtitle line (12px); then an optional notice; then its tiles, 10px apart |
| `SettingRow` | something the user changes | a `bg-row` tile: label (14px medium) and one sentence (12px) on the left, the control in the right column (at least 16rem, wider only when its content needs it) |
| `SettingsList` + `SettingsListRow` | things the user looks at (devices, versions, payments, usage, ways to sign in, the subscription) | each item a tile like a setting row: optional brand mark, name, one line of facts, quiet actions on the right |
| `SettingsNotice` | a note or warning about a section (why something is off, what signing in adds, a failed action) | one rounded block under the section header, `info` or `warning` |

All spacing comes from density tokens, so Compact tightens every page alike:
tile gap `--density-gap-group` x 5/3, tile padding `--density-py-tab` x 1.75 by
`--density-px-tab`, header to tiles `--density-p-group` x 4/3.

## Rules

1. Every section has a glyph, a title and one subtitle line; the types require
   all three. The glyph comes from icon-standard.md ("Settings sections") and
   means one thing. Section titles use "and"; nav labels use "&".
2. A row shows one sentence. `SettingRow` keeps the first sentence of a
   description and moves the rest into the row's info mark (an Info button
   beside the label, the app tooltip on hover and focus, the same text read to
   screen readers as part of the description).
3. A section holds setting rows or one list, never both. "What I change" and
   "what I look at" never share a shape.
4. Controls in the column: a control that fills (field, slider, dropdown, a row
   of colour or hue dots) spans the column; a control as wide as its content
   (button, switch with its On/Off, Move up/down, segmented choices) ends on the
   column's right edge. Segmented choices are each as wide as their content and
   never wrap; a wider set widens the column instead.
5. A list of named options that can grow (Font) is a dropdown (`ui/select`). A
   small fixed set, or a fixed numeric range (Grid columns), is segmented
   choices (`ToggleGroup`). The dropdown trigger is the choice button (the
   toggle's outline/sm look), so both read as one family.
6. Option icons: on every option of a group or on none, and only when the icon
   shows the outcome (Mode, Group layout, Mark, Duplicate colour, Ribbon corner,
   Full title and link). Never decoration.
7. Every field in the app has one look (`ui/input`): no fill and an ink/25 edge
   at rest; focus (ink/50) and the invalid red keep their own edge. A field never
   adds a layer to the surface it sits on, so a tile needs no override.
8. Row actions (Export, Import, Sign out, Reset, Link, Unlink, Preview, Restore,
   Manage billing, Move up/down, Try again) are ghost buttons. Exceptions with a
   reason: Save beside a text field (secondary, commits what was typed), Upgrade
   (default, the one purchase), Delete (danger, see danger-standard.md).
9. Pages never draw their own containers (no `Card`, no box per item). A list
   that cannot show items uses its own states: `loading` (skeleton rows shaped
   like a real row), `failed` (a centred block with a warning mark and Try
   again), `empty` (a centred block with the section's glyph saying what will
   appear and when). The mark sits in `data-slot="list-state-art"` so an
   illustration can take that slot later. Anything else is a `SettingsNotice`:
   `info` for information, `warning` only when something is wrong or needs
   action.
10. Approved exceptions, nothing else:
    - the Spaces tab strip above its form (TASK-58);
    - the Appearance preview beside Theme, Display and Layout (TASK-30), shown
      only at 1440px and wider, capped at 24rem; narrower, it is hidden and the
      controls start at the top;
    - the plan cards on Plan & billing: one per tier side by side, each a tile
      with name, price, who it is for, the same limit lines (Free's from the
      server's `free_limits`) and one full-width action, Upgrade to X or the
      quiet disabled Current plan. When the plan renews or ends belongs to the
      Subscription section, shown only with a subscription or a granted plan,
      never on a card;
    - usage rows: the bar with its numbers right under it; an unlimited cap
      shows "Unlimited" in the bar's place and "N used" under it.
11. Copy: no em dash in anything the user reads; use a full stop or a comma.
