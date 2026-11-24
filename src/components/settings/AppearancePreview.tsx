import { useLayoutEffect, useRef, useState } from "react"
import { DndContext } from "@dnd-kit/core"
import { TabGroup } from "~src/components/TabGroup"
import { CategoryHeader } from "~src/components/layout/ContentPanel"
import { Button } from "~src/components/ui/button"
import { SearchField } from "~src/components/ui/input"
import { searchPlaceholder } from "~src/components/SearchBar"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { useSettingsStore } from "~src/store/useSettingsStore"
import type { SavedGroup, SavedTab } from "~src/types"

// The Appearance previewer (TASK-30): a miniature of the workspace with a fixed
// sample, the same for every account, so an empty or brand-new workspace
// previews every control too. Everything in it is a real component (the search
// field, the Save all tabs button, the category header, TabGroup's look-only
// `preview` variant), styled by the live theme tokens, never the person's data.
const tab = (id: string, title: string, host: string, path = "/"): SavedTab => ({ id: `appearance-preview-${id}`, title, url: `https://${host}${path}`, favicon: "", order: 0 })
// The first two are long, so Title cut and Link cut show on them (TASK-71).
const RESEARCH_TABS = [
  tab("b", "[BD] Black Clover: Mahou Tei no Ken (BD) Episode 2 Subtitle Indonesia - Kuramanime", "v20.kuramanime.ing", "/anime/4116/black-clover-mahou-tei-no-ken/episode/2"),
  tab("c", "[FLEX-413] Billing retries fail when the card is replaced in the middle of a cycle - Jira", "acme.atlassian.net", "/jira/software/projects/FLEX/boards/7?selectedIssue=FLEX-413"),
  tab("d", "Figma: checkout v3", "figma.com"), tab("e", "Sprint board", "linear.app"),
  tab("f", "Pull request #91", "github.com"), tab("g", "Invoice #2291", "stripe.com"),
]
// Uncoloured, as most groups are: the reference the coloured one is judged against.
// The same address twice, so the Duplicate tabs setting shows on the sample (TASK-68).
const INBOX: SavedGroup = { id: "appearance-preview-inbox", name: "Inbox", order: 0, tabs: [tab("a", "Kickoff deck", "docs.google.com"), tab("a2", "Kickoff deck", "docs.google.com")] }
const research = (count: number): SavedGroup => ({ id: "appearance-preview-research", name: "Research", color: "blue", order: 1, tabs: RESEARCH_TABS.slice(0, count) })
const LOCATION = { spaceId: "appearance-preview", projectId: "appearance-preview", categoryId: "appearance-preview" }

/** Columns the browser laid out for the last grid inside `root` (0 when it is a list). */
function laidOutColumns(root: HTMLElement | null): number {
  const grids = root?.querySelectorAll<HTMLElement>(".grid")
  const grid = grids?.[grids.length - 1]
  if (!grid) return 0
  return getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length
}

/**
 * The previewer card beside the Appearance controls. Top to bottom, as in the
 * workspace: the search field and Save all tabs (theme, intensity, roundness,
 * font), a category header, then an uncoloured and a coloured group (tint,
 * density, layout, grid columns). Always whole: two rows in a list, exactly one
 * full row of the columns that fit in a grid. Inert: no clicks, drags or tab
 * stops, and it never touches saved data.
 */
export function AppearancePreview() {
  const { groupLayout, gridColumns } = useSettingsStore()
  const frame = useRef<HTMLDivElement>(null)
  // Columns that fit in the card, read from the grid the browser laid out (the
  // count follows the width, not the number of tabs).
  const [fit, setFit] = useState(RESEARCH_TABS.length)

  useLayoutEffect(() => {
    const measure = () => setFit(laidOutColumns(frame.current) || RESEARCH_TABS.length)
    measure()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    if (frame.current) observer?.observe(frame.current)
    return () => observer?.disconnect()
  }, [groupLayout, gridColumns])

  const grid = groupLayout === "grid"
  const tabs = grid ? Math.min(fit, RESEARCH_TABS.length) : 2
  // Honest about the card's own width: a wider workspace can show more columns.
  const note = grid && fit > 0 && fit < gridColumns
    ? `${fit} of ${gridColumns} columns fit in this preview. Your workspace shows up to ${gridColumns} when it is wide enough.`
    : ""

  return (
    <section aria-label="Preview" className="rounded-xl border border-line bg-black-900 overflow-hidden preview:max-h-[calc(100vh-8rem)] preview:overflow-y-auto">
      <p className="px-6 pt-4 text-fg-muted text-xs font-medium font-sans">Preview</p>
      <div ref={frame} inert className="select-none pb-6">
        {/* Its own providers: self-contained wherever Appearance renders. */}
        <TooltipProvider>
          <div className="flex items-center gap-2 px-6 py-3 border-b border-line">
            {/* The header's own field, read-only (TASK-57): a preview reuses the real component. */}
            <SearchField type="text" placeholder={searchPlaceholder()} aria-label="Search (preview)" boxClassName="min-w-0 flex-1" readOnly />
            <Button variant="secondary" size="sm">Save all tabs</Button>
          </div>
          <CategoryHeader id="appearance-preview" name="Reading" counts="2 groups" />
          <DndContext>
            <TabGroup preview group={INBOX} location={LOCATION} layout={groupLayout} gridColumns={gridColumns} />
            <TabGroup preview group={research(tabs)} location={LOCATION} layout={groupLayout} gridColumns={gridColumns} />
          </DndContext>
        </TooltipProvider>
      </div>
      <p aria-live="polite" className="px-6 pb-4 -mt-2 text-fg-subtle text-xs font-sans empty:hidden">{note}</p>
    </section>
  )
}
