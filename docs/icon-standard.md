# Icon standard

Status: **built** (2026-11-18, TASK-76). `src/components/ui/icon.tsx` is the only way FlexTab draws
an icon. `src/components/ui/icon.test.tsx` fails when:
- a component renders a Lucide glyph without going through `Icon`;
- a component draws its own `<svg>` outside the allowed non-icon drawings.

The map the decisions came from (every meaning, how it was drawn, the glyph chosen) is the review
page "FlexTab Icon Map" (tools/review/tk76/icon-map.html).

## 1. One set

Every icon is a [Lucide](https://lucide.dev) glyph from the project's `lucide-react`. Lucide was
already the most used source, and every hand-drawn SVG had a Lucide equivalent.

Three drawings are not icons and stay as they are:
- a space's letter avatar (`SpaceAvatar`);
- brand logos: FlexTab, plus Google, GitHub, GitLab and Discord on sign-in;
- non-icon shapes: a tooltip's arrow, the spring-load progress ring, and the filled indicator dots
  inside the shadcn radio and menu primitives.

## 2. How to draw one

```tsx
import { Bookmark } from "lucide-react"
import { Icon } from "~src/components/ui/icon"

<Icon icon={Bookmark} size="sm" className="text-fg-subtle" />
```

- **Size comes from the scale** (below), never from `h-*`/`w-*` classes.
- **Colour comes from the text colour** (`currentColor`): put colour on the icon or its button, so
  the icon follows the button's rest, hover, active and disabled states.
- **Line weight comes from Settings.** Never pass `strokeWidth`.
- An icon is hidden from assistive tech, because the control it sits in carries the name
  (`aria-label` or visible text). Pass `label` only when nothing else names it, such as a lone
  loading spinner.

## 3. Size scale

| Size | px | Use |
|---|---|---|
| `xs` | 12 | small marks in dense rows: a category in the sidebar tree, the tree's chevron |
| `sm` | 14 | row actions, tree rows, breadcrumbs, icons inline with text (default) |
| `md` | 16 | header tools, menu items, dialog close, search fields, the popup's place rows |
| `lg` | 20 | the rail, main navigation, popup actions |
| `xl` | 24 | page headings, the rail's Add space, empty states |
| `badge` | 8 | a mark on top of another icon (the saved check in Opened Tabs) |
| `badge-lg` | 11 | the same mark at popup size |

Badges draw at a fixed heavy weight (3.5) at every Settings choice, so they stay legible.

## 4. Line weight

Settings › Appearance › **Icon weight**: Thin 1.5, **Regular 1.75** (default), Bold 2.

The weight is synced with the other appearance settings (`iconWeight`).

## 5. One glyph per meaning

| Meaning | Glyph |
|---|---|
| Project, Category, Group, Unsorted | `Folder`, `ListTree`, `Layers`, `Inbox` (`levelIcons.tsx`) |
| Add | `Plus` |
| More actions | `Ellipsis` (`MoreHorizontal`) |
| Close or remove | `X` |
| Save a page | `BookmarkPlus` |
| Open all tabs of a group (opens pages in the browser) | `SquareArrowOutUpRight` |
| Open in FlexTab | `AppWindow` |
| Drag to reorder | `GripVertical` |
| Expand or collapse | `ChevronRight`, turned down when open |
| Open a dropdown | `ChevronDown` |
| Search | `Search` |
| Saved | `Check` at a badge size |
| Selected | `Check` |
| Duplicate, or a warning | `TriangleAlert` |
| Settings / Account | `Settings` / `User` |
| Privacy | `ShieldCheck` |
| Copy (a link) | `Copy` |
| Email (a link was sent) | `Mail` |
| Navigation menu / Opened Tabs panel | `Menu` / `PanelRight` |
| List / Grid view | `List` / `LayoutGrid` |
| Settings sections | Spaces `Boxes`, Saving `Bookmark`, Appearance `Palette`, Sync `Cloud`, Backup `History`, Plan & Usage `Gauge`, Transactions `Receipt`, Account `User` |

`Layers` means Group only. Settings › Spaces is `Boxes`, so the two never share a shape. `Boxes` also marks the empty states with no space to show ("No spaces yet", "Pick a space"), where there is no space avatar to draw.

A new meaning gets one glyph, added to this table. A glyph already in the table is never reused
for a second meaning.
