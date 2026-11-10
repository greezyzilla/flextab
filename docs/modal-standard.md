# Modal standard

Status: **built** (2026-11-10): `src/components/ui/modal.tsx` (TASK-43), every modal migrated
(TASK-42, 44, 45, 46). `src/components/ui/modal-gate.test.ts` fails if a component outside `ui/`
builds a modal from the raw dialog primitives. The narrow-screen drawer is exempt: it is a side
sheet, not a modal. The audit that motivated it is
backlog doc-1 "Modal audit 2026-11-10". Its rule ids (S1–S11) and root causes (R1–R6) are cited below.

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

**Forced decision.** The sync choice and merge conflicts cannot simply be cancelled. They still get
a non-destructive way out ("Decide later": sync stays paused), so a person is never trapped (S6).

Both kinds share everything else in this document: anatomy, sizes, spacing, type and buttons (S11).

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

- The **body scrolls** when the modal outgrows 85vh. Header and footer stay put (S7).
- **One exception: a long choice list keeps its own bounded box.** The destination picker keeps its
  border and max height (as it is today), so the options above it and the footer stay in view. The
  sample showed that letting the picker grow with the body loses its boundary (Common Region). The
  list then blends into the options around it, and the modal becomes very tall (decision D4).
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
- **Open decision D1:** Primer makes dialogs with inputs full-screen on narrow screens. FlexTab's
  narrow case is a small window, not a phone. Proposal: do not go full-screen; the 16px safe area
  is enough.

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

Call sites pass **no spacing classes**. The primitive owns them (R2).

## 6. Type

| Element | Style |
|---|---|
| Title | 16px / 600, `text-fg`, sentence case |
| Description, body text | 14px / 400, `text-fg-muted` |
| Field label | the existing `<Label>` (11px caption), for fields only |
| Option text (radio, switch, option card) | 14px / 400 `text-fg`. A short count goes on the same line after a middle dot ("This window · 1 tab"); a sentence-long hint goes below at 12px `text-fg-subtle` |
| Note or warning | the existing `role="note"` box, 12px |
| Footer status | 12px `text-fg-subtle` |

There is one title size for both kinds (R1). `<Label>` is never used as option text (R6).

## 7. Footer and buttons

- Right-aligned, in the order **[Cancel] [Primary]**. At most one primary (S3).
- All footer buttons are size `default` (h36, 14px), in both kinds (R3).
- **Cancel** is the `secondary` variant everywhere (R4).
- **Primary** is `default` (accent), or `destructive` when it deletes, removes or replaces. A
  destructive primary also leads with a warning icon (`TriangleAlert`), so a primary that changes
  tone with the choice still shows the change when the accent hue is red (TASK-49). The page
  control that opens a destructive flow ("Delete space…") is the `danger` variant (red text on a
  red tint), not a red fill.
- The footer-start action is `link` styled, with its underline visible at rest. It must not read as
  a heading.
- The footer never stacks vertically (R4, Sign out). If it overflows, buttons wrap with the primary
  last.

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
- Focus never starts outside the modal (S5, sync choice today).
- Tab is trapped inside.
- Esc runs Cancel.
- On close, focus returns to the trigger. If the trigger is gone (a deleted row), it goes to that
  row's list.
- Enter in a text field submits only when the primary is not destructive. The exception is a
  typed confirmation (delete space, delete account), where the typed name is the safeguard.

## 9. Implementation shape

One `Modal` primitive over Radix Dialog and AlertDialog. It replaces direct use of `DialogContent`,
`AlertDialogContent` and `ConfirmDialog` layout props.

```tsx
<Modal kind="dialog" | "alert" size="s" | "m" | "l" open onOpenChange initialFocus="cancel" dirty={edited}>
  <ModalHeader title="Delete group?" description="This permanently removes Research and its 3 saved tabs." />
  <ModalBody>…</ModalBody>
  <ModalFooter start={<Button variant="link">Export JSON</Button>}
    cancel="Cancel" primary={{ label: "Delete group", tone: "destructive", onClick }} />
</Modal>
```

Gates:
- A unit test asserts every modal renders through `Modal`.
- `tools/ui-shots/modals.cjs` must report the §5 gaps, the §6 sizes and the §8 focus target for
  every modal, in light and dark.

## 10. The 15 modals under this standard

| Modal | Kind | Size | Primary (label, tone) | Focus on open | Notable change |
|---|---|---|---|---|---|
| Choose what to keep (sync choice) | alert, forced | L | follows the choice: "Merge both" / "Keep my account's" / "Keep this device's"; destructive when it removes tabs | selected option | focus inside; "Decide later" only if D2 says yes |
| Resolve sync conflicts | alert, forced | L | "Resolve conflicts" | first option | "Pause sync and decide later" moves to footer start; the chosen-count moves up beside "Choose for all" |
| Import | dialog | M | "Add N tabs" / "Replace workspace" (destructive) | selected radio | description is what the file holds, not its name |
| Version preview | dialog | M | "Restore version" | Close X | the same workspace tree as the sign-in choice (`WorkspaceTree`), in its own bounded box; Cancel added |
| Restore version? | alert | S | "Restore version" | Cancel | body at most 2 sentences; footer start "Export JSON" |
| Sign out of FlexTab? | alert | M | "Sign out" / "Sign out and remove tabs" (destructive) | Cancel | footer becomes a row; "Download backup" moves to footer start |
| Delete your account? | alert | M | "Delete account" (destructive) | email field | "Download your tabs first" moves to footer start |
| Save all tabs | dialog | M | "Save N tabs" | destination search | option text at 14px; drop the "This window (0 tabs)" choice when it is empty (TASK-42) |
| Save window as a group (was "Save Session") | dialog | M | "Save group" | name field | drop the duplicate destination line |
| Move tab / Move group / Save tab | dialog | M | "Move tab" / "Move group" / "Save tab" | search field | none beyond the primitive; picker keeps its own box |
| Delete group? | alert | S | "Delete group" (destructive) | Cancel | none beyond the primitive |
| Delete project? / Delete category? | alert | S | "Delete project" / "Delete category" (destructive) | Cancel | specific label |
| Delete "Work"? (space) | alert | S | "Delete space" (destructive) | name field | none beyond the primitive |
| Keyboard shortcuts | dialog, passive | M | none | the dialog itself (`initialFocus="dialog"`): nothing is highlighted before use | description at 14px |
| Your plan syncs up to N tabs | alert | S | "Got it" | primary | "See plan" moves to footer start |

## 11. Open decisions

- **D1** ~~Narrow screens.~~ Decided 2026-11-10: no full-screen; every size is `100vw − 32px` wide below 640px.
- **D2** ~~Sync choice "Decide later".~~ Decided 2026-11-10: it stays a forced choice with no exit. The
  sign-in choice has no paused state to fall back to (merge conflicts do, through
  `dismissMergeConflicts`), and adding one is new sync behaviour, out of this standard's scope. The
  sync choice gets the standard's focus and a primary that names the choice.
- **D3** ~~Alert buttons grow from h32/12px to h36/14px.~~ Accepted with the sample.
- **D4** ~~The picker grows with the body.~~ Rejected after the sample: the picker keeps its bounded box (§3).
