# Modal standard

`src/components/ui/modal.tsx` is the one modal family. `src/components/ui/modal-gate.test.ts` fails
if a component outside `ui/` builds a modal from the raw dialog primitives. The narrow-screen drawer
is exempt: it is a side sheet, not a modal.

Sources: Atlassian *Modal dialog*, Primer (GitHub) *Dialog*, Carbon (IBM) *Modal*, and the W3C APG
*Dialog (Modal)* pattern. Where they disagree, the choice is stated.

## 1. When to use a modal

Use one for a short task that blocks the current flow:
- a decision with consequences (delete, sign out, restore, replace);
- a small form (name and destination);
- a choice the app cannot make for the person (sync conflicts).

Do not use one for:
- something an Undo toast already covers;
- non-critical information (use a toast or an inline note);
- anything that needs a whole page.

A modal never opens another modal (Atlassian).

## 2. Two kinds, one family

| | **Dialog** (`role="dialog"`) | **Alert** (`role="alertdialog"`) |
|---|---|---|
| For | tasks, forms, previews, passive info | confirming a consequential action, a forced decision |
| Close X | yes, top right | no (W3C: the Cancel button is the close control) |
| Esc | closes (= Cancel) | closes (= Cancel) |
| Click outside | closes, **unless a field was edited** (Primer) | never closes |
| Cancel in footer | when the dialog has a primary action | always, except the forced decision below |

**Forced decision.** The sign-in sync choice and merge conflicts cannot simply be cancelled. Merge
conflicts still get a non-destructive way out ("Pause sync and decide later": sync stays paused), so
a person is never trapped. The sign-in sync choice has no paused state to fall back to, so it stays
a forced choice with no exit; it gets the standard's focus and a primary that names the choice.

Both kinds share everything else in this document: anatomy, sizes, spacing, type and buttons.

## 3. Anatomy

```
┌────────────────────────────────────────────┐
│ Title                                   [X] │  header (fixed)
│ Description (optional)                      │
├────────────────────────────────────────────┤  divider only while the body scrolls
│ Body                                        │  the only scroll area
├────────────────────────────────────────────┤  divider only while the body scrolls
│ [start action / status]     [Cancel] [Primary] │  footer (fixed)
└────────────────────────────────────────────┘
```

- The **body scrolls** when the modal outgrows 85vh. Header and footer stay put.
- **One exception: a long choice list keeps its own bounded box.** The destination picker keeps its
  border and max height, so the options above it and the footer stay in view. Letting the picker
  grow with the body loses its boundary (Common Region): the list blends into the options around
  it, and the modal becomes very tall.
- The **footer start** holds at most one escape hatch or helper action (Download backup, See plan,
  Export JSON, Decide later) or a status line ("3 of 5 chosen"). Primer allows secondary actions on
  the left.

## 4. Sizes

| Size | Width | Use |
|---|---|---|
| **S** | 400px | confirmations, acknowledgements |
| **M** | 480px | forms, choices with option cards |
| **L** | 720px | side-by-side comparisons (sync choice, merge conflicts) |

- Max height is 85vh. Past that, the body scrolls.
- Below 640px viewport width, every size is `100vw − 32px` wide (16px safe area, Primer).
- No full-screen on narrow screens. Primer makes dialogs with inputs full-screen there, but
  FlexTab's narrow case is a small window, not a phone, so the 16px safe area is enough.

## 5. Spacing (one rhythm)

| Where | Value |
|---|---|
| Padding (all sides, header and footer included) | 20px |
| Title → description | 6px |
| Header → body, body → footer | 16px (20px each side of a divider when one shows) |
| Between groups in the body | 16px |
| Inside a group (option → option, description → options) | 8px |
| Field label → control | 6px |
| Between footer buttons | 8px |
| Close X | 28px target, top 14px, right 14px, vertically centred on the title's first line; the title reserves 32px on the right |

Call sites pass **no spacing classes**. The primitive owns them.

## 6. Type

| Element | Style |
|---|---|
| Title | 16px / 600, `text-fg`, sentence case |
| Description, body text | 14px / 400, `text-fg-muted` |
| Field label | the existing `<Label>` (11px caption), for fields only |
| Option text (radio, switch, option card) | 14px / 400 `text-fg`. A short count goes on the same line after a middle dot ("This window · 1 tab"); a sentence-long hint goes below at 12px `text-fg-subtle` |
| Note or warning | the existing `role="note"` box, 12px |
| Footer status | 12px `text-fg-subtle` |

There is one title size for both kinds. `<Label>` is never used as option text.

## 7. Footer and buttons

- Right-aligned, in the order **[Cancel] [Primary]**. At most one primary.
- All footer buttons are size `default` (h36, 14px), in both kinds.
- **Cancel** is the `secondary` variant everywhere, except in a `quiet` footer (below).
- **Primary** is `default` (accent), or `destructive` when it deletes, removes or replaces. A
  destructive primary also leads with a warning icon (`TriangleAlert`), so a primary that changes
  tone with the choice still shows the change when the accent hue is red. The page
  control that opens a destructive flow ("Delete space…") is the `danger` variant (red text on a
  red tint), not a red fill.
- **Quiet footer** (`ModalFooter quiet`) for a step that leaves rather than goes ahead (Sign out):
  the primary is `secondary` (neutral) instead of the accent, Cancel is `ghost` so the two
  neutral buttons differ by shape, and the primary holds one width (`min-w-28`) so Cancel never
  moves when the primary turns destructive.
- A typed confirmation is one line: the description is the instruction ("Type <name> to delete
  it.") and the field has no visible label or placeholder of its own, only an `aria-label`
  (no line that only explains another line).
- Every red in a modal (destructive primary, an inline error) follows
  `docs/danger-standard.md`.
- The footer-start action is `link` styled, with its underline visible at rest. It must not read as
  a heading.
- The footer never stacks vertically. If it overflows, buttons wrap with the primary last.

**Labels.**
- The primary is a verb plus an object that repeats the title: "Delete group", "Save 3 tabs",
  "Restore version", "Replace workspace" (Atlassian, Carbon).
- Never use "Apply", "OK", "Yes" or "Done". "Got it" is allowed only on an acknowledgement with no
  other consequence (over-cap notice).
- Confirmation titles are questions: "Delete group?". Task titles are verb phrases: "Save all tabs".
- No instruction without its action. If the text says "Export JSON first", the footer start offers
  "Export JSON".

## 8. Focus and keyboard

Focus on open, first rule that applies:
1. The first text field, or the selected radio of the first option group.
2. **Cancel**, when the primary deletes, removes or replaces data, including Import with Replace
   selected and Restore from a preview (W3C: least destructive for irreversible steps).
3. Otherwise the primary.

Rules for every modal:
- Focus never starts outside the modal.
- Tab is trapped inside.
- Esc runs Cancel.
- On close, focus returns to the trigger. If the trigger is gone (a deleted row), it goes to that
  row's list.
- Enter in a text field submits only when the primary is not destructive. The exception is a
  typed confirmation (delete space, delete account), where the typed name is the safeguard.

## 9. Implementation shape

One `Modal` primitive over Radix Dialog and AlertDialog. Components never build a modal from
`DialogContent` or `AlertDialogContent` directly.

```tsx
<Modal kind="dialog" | "alert" size="s" | "m" | "l" open onOpenChange initialFocus="cancel" dirty={edited}>
  <ModalHeader title="Delete group?" description="This permanently removes Research and its 3 saved tabs." />
  <ModalBody>…</ModalBody>
  <ModalFooter start={<Button variant="link">Export JSON</Button>}
    cancel="Cancel" primary={{ label: "Delete group", tone: "destructive", onClick }} />
</Modal>
```

Gate: `modal-gate.test.ts` asserts every modal renders through `Modal`.
